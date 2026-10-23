-- `register_panels` must say how many rows it actually wrote.
--
-- It returns void today, so the action reported `input.panels.length`. The
-- insert is `on conflict (id) do nothing`, which means a retry after a partial
-- upload re-sends every panel and the toast claims all of them were added when
-- most were already there. Callers now get the real number.
--
-- Signature changes from `void` to `int`, so the old function is dropped first;
-- `create or replace` cannot change a return type.

drop function if exists public.register_panels(uuid, jsonb);

create function public.register_panels(
  p_chapter_id uuid,
  p_panels     jsonb
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
begin
  if not public.can_edit_chapter(p_chapter_id) then
    raise exception 'You don''t have access to this chapter.' using errcode = 'HF001';
  end if;

  select s.group_id into v_group
  from public.chapters c
  join public.series s on s.id = c.series_id
  where c.id = p_chapter_id;

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
      (v_panel->>'index')::int,
      v_path,
      (v_panel->>'width')::int,
      (v_panel->>'height')::int,
      (v_panel->>'byteSize')::int
    )
    on conflict (id) do nothing;

    get diagnostics v_row = row_count;
    v_inserted := v_inserted + v_row;
  end loop;

  update public.chapters set updated_at = now() where id = p_chapter_id;

  return v_inserted;
end;
$$;

revoke all on function public.register_panels(uuid, jsonb) from public;
grant execute on function public.register_panels(uuid, jsonb) to authenticated;
