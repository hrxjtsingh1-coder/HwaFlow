-- Extraction must never destroy translation work.
--
-- `set_panel_blocks` is called by the extraction stage, which sends only
-- `index`, `sourceText`, `bbox` and `confidence`. The previous definition
-- coerced the missing text fields to '' and then overwrote the stored columns
-- unconditionally, so pressing "Run" on a chapter that already had translations
-- blanked every bubble — including hand-edited ones — while leaving
-- `is_edited = true` behind.
--
-- Two changes:
--   1. An incoming empty string means "no opinion", not "erase". A non-empty
--      value still overwrites, so the translate/proofread stages keep working.
--   2. A block that is absent from the payload is only deleted when it holds no
--      text. A truncated model response can no longer delete translated rows.
--
-- Same signature, same return type, same permission checks.

create or replace function public.set_panel_blocks(
  p_chapter_id uuid,
  p_page_id    uuid,
  p_blocks     jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block jsonb;
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
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) e
      where (e->>'index')::int = b.block_index
    )
    and coalesce(b.base_translation, '') = ''
    and coalesce(b.final_text, '') = '';

  for v_block in
    select * from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb))
  loop
    insert into public.text_blocks as tb (
      page_id, chapter_id, block_index, bbox, source_text,
      base_translation, final_text, confidence
    )
    values (
      p_page_id,
      p_chapter_id,
      (v_block->>'index')::int,
      nullif(v_block->'bbox', 'null'::jsonb),
      coalesce(v_block->>'sourceText', ''),
      coalesce(v_block->>'baseTranslation', ''),
      coalesce(v_block->>'finalText', ''),
      (v_block->>'confidence')::numeric
    )
    on conflict (page_id, block_index) do update
      set bbox        = excluded.bbox,
          source_text = excluded.source_text,
          confidence  = excluded.confidence,
          base_translation = case
            when coalesce(excluded.base_translation, '') = ''
              then tb.base_translation
            else excluded.base_translation
          end,
          final_text = case
            when coalesce(excluded.final_text, '') = ''
              then tb.final_text
            else excluded.final_text
          end;
  end loop;

  update public.chapters set updated_at = now() where id = p_chapter_id;
end;
$$;

revoke all on function public.set_panel_blocks(uuid, uuid, jsonb) from public;
grant execute on function public.set_panel_blocks(uuid, uuid, jsonb) to authenticated;
