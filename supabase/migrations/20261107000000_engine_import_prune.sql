-- Engine imports can leave stale rows behind.
--
-- `set_panel_blocks` merges, on purpose: an empty string means "no opinion"
-- and a row absent from the payload is only deleted when it holds no text. That
-- keeps a truncated model response from erasing real translations
-- (20261030090000_extraction_preserves_text.sql).
--
-- The cost of that safety is duplicates: when the engine finds fewer regions
-- than the pipeline did, the surplus rows keep their text and show up as extra
-- bubbles. There is no way to tell "engine found 12 regions" from "engine died
-- after 12 of 20", so the app must decide explicitly.
--
-- `set_panel_engine_blocks` is that explicit path. It deletes the page's
-- rows that the payload does not mention, but only when `is_edited = false` —
-- human edits are never pruned. The import route only calls it when the user
-- presses "Remove stale lines".
--
-- Returns the number of removed rows.

create or replace function public.set_panel_engine_blocks(
  p_chapter_id uuid,
  p_page_id    uuid,
  p_blocks     jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer := 0;
begin
  if not public.can_edit_chapter(p_chapter_id) then
    raise exception 'You don''t have access to this chapter.' using errcode = 'HF001';
  end if;

  if not exists (
    select 1 from public.chapter_pages
    where id = p_page_id and chapter_id = p_chapter_id
  ) then
    raise exception 'That panel no longer exists.' using errcode = 'HF002';
  end if;

  delete from public.text_blocks b
  where b.page_id = p_page_id
    and b.is_edited = false
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) e
      where (e->>'index')::int = b.block_index
    );

  get diagnostics v_removed = row_count;

  -- Same upsert, same text-preserving rules, same permission re-check.
  perform public.set_panel_blocks(p_chapter_id, p_page_id, p_blocks);

  return v_removed;
end;
$$;

revoke all on function public.set_panel_engine_blocks(uuid, uuid, jsonb) from public;
grant execute on function public.set_panel_engine_blocks(uuid, uuid, jsonb) to authenticated;

comment on function public.set_panel_engine_blocks(uuid, uuid, jsonb) is
  'Engine import with pruning: deletes unedited blocks the payload omits, then merges. Explicit opt-in only.';
