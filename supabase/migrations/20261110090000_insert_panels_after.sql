-- Insert panels *between* existing pages.
--
-- `register_panels` only appends: it writes the caller's `index` and relies on
-- `on conflict (id) do nothing`, so it cannot move the pages already stored.
-- "Add panels" in the workspace inserts after the page the user is looking at,
-- which needs the whole tail of the list shifted first.
--
-- Same two-phase trick as `remove_panel`: shift the tail by a large constant,
-- write the new rows into the gap, then renumber everything `0..n-1` in one
-- pass. The unique (chapter_id, page_index) constraint never sees a duplicate.
--
-- The page/byte caps are not re-checked here: the `chapter_pages_engine_budget`
-- trigger (20261109000000) already refuses a 21st row or an 80 MiB chapter.

create or replace function public.insert_panels_after(
  p_chapter_id  uuid,
  p_after_index int,
  p_panels      jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_panel    jsonb;
  v_group    uuid;
  v_path     text;
  v_inserted int := 0;
  v_row      int := 0;
  v_offset   int := 0;
begin
  if not public.can_edit_chapter(p_chapter_id) then
    raise exception 'You don''t have access to this chapter.' using errcode = 'HF001';
  end if;

  select s.group_id into v_group
  from public.chapters c
  join public.series s on s.id = c.series_id
  where c.id = p_chapter_id;

  if v_group is null then
    raise exception 'That chapter no longer exists.' using errcode = 'HF002';
  end if;

  -- Serialize against a competing upload or remove for this chapter, so the
  -- shift and the renumber cannot interleave with another writer.
  perform 1
    from public.chapters c
   where c.id = p_chapter_id
   for update;

  -- Phase one: park every page after the insertion point out of range.
  update public.chapter_pages
     set page_index = page_index + 10000
   where chapter_id = p_chapter_id
     and page_index > p_after_index;

  for v_panel in
    select * from jsonb_array_elements(coalesce(p_panels, '[]'::jsonb))
  loop
    v_path := v_panel->>'path';

    if v_path is null
       or v_path not like v_group::text || '/' || p_chapter_id::text || '/%'
    then
      raise exception 'That panel path is not valid for this chapter.'
        using errcode = 'HF026';
    end if;

    insert into public.chapter_pages (
      id, chapter_id, page_index, original_path, width, height, byte_size
    )
    values (
      (v_panel->>'id')::uuid,
      p_chapter_id,
      p_after_index + 1 + v_offset,
      v_path,
      (v_panel->>'width')::int,
      (v_panel->>'height')::int,
      (v_panel->>'byteSize')::int
    )
    on conflict (id) do nothing;

    -- A retry after a partial upload re-sends rows that already exist. Only a
    -- row this call actually wrote may consume a slot.
    get diagnostics v_row = row_count;
    if v_row > 0 then
      v_inserted := v_inserted + 1;
      v_offset := v_offset + 1;
    end if;
  end loop;

  -- Phase two: compact back to 0..n-1, keeping the new reading order.
  with ordered as (
    select id, row_number() over (order by page_index) - 1 as new_index
    from public.chapter_pages
    where chapter_id = p_chapter_id
  )
  update public.chapter_pages p
     set page_index = o.new_index
    from ordered o
   where p.id = o.id;

  update public.chapters set updated_at = now() where id = p_chapter_id;

  return v_inserted;
end;
$$;

revoke all on function public.insert_panels_after(uuid, int, jsonb) from public;
grant execute on function public.insert_panels_after(uuid, int, jsonb) to authenticated;
