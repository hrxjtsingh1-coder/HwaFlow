-- Corrects two lint findings in upsert_glossary_terms:
--   * `v_seen text[] := '{}'` was inferred as text; initialise it as an array.
--   * `p_chapter_id` was unused. It now proves the chapter belongs to the
--     series, so a mismatched payload is rejected instead of silently applied.

set search_path = public, extensions;

create or replace function public.upsert_glossary_terms(
  p_series_id  uuid,
  p_chapter_id uuid,
  p_terms      jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate jsonb;
  v_source    text;
  v_target    text;
  v_category  text;
  v_existing  public.glossary_terms;
  v_seen      text[] := array[]::text[];
  v_key       text;
  v_written   integer := 0;
begin
  if not public.can_work_on_series(p_series_id) then
    raise exception 'You don''t have access to this series.' using errcode = 'HF001';
  end if;

  if p_chapter_id is not null and not exists (
    select 1
    from public.chapters c
    where c.id = p_chapter_id
      and c.series_id = p_series_id
  ) then
    raise exception 'That chapter is not in this series.' using errcode = 'HF030';
  end if;

  for v_candidate in
    select * from jsonb_array_elements(coalesce(p_terms, '[]'::jsonb))
  loop
    v_source := public.clean_term(v_candidate->>'sourceTerm');
    v_target := public.clean_term(v_candidate->>'targetTerm');
    if v_source = '' or v_target = '' then continue; end if;
    if char_length(v_source) > 60 or char_length(v_target) > 60 then continue; end if;

    v_key := lower(v_source);
    if v_key = any(v_seen) then continue; end if;
    v_seen := array_append(v_seen, v_key);

    v_category := public.glossary_category(v_candidate->>'category');

    select * into v_existing
    from public.glossary_terms
    where series_id = p_series_id
      and lower(source_term) = v_key;

    if v_existing.id is not null then
      if 'manual' = any(v_existing.origins) or v_existing.status = 'dismissed' then
        continue;
      end if;

      update public.glossary_terms
         set target_term = v_target,
             category = v_category,
             updated_at = now()
       where id = v_existing.id;
      v_written := v_written + 1;
      continue;
    end if;

    insert into public.glossary_terms (
      series_id, source_term, target_term, category, origins, created_by
    )
    values (p_series_id, v_source, v_target, v_category, array['auto'], null);
    v_written := v_written + 1;
  end loop;

  return v_written;
end;
$$;

revoke all on function public.upsert_glossary_terms(uuid, uuid, jsonb) from public;
grant execute on function public.upsert_glossary_terms(uuid, uuid, jsonb) to authenticated;
