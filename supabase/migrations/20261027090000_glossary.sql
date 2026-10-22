-- Per-series glossary. Scope is the series, not the chapter: one decision keeps
-- "Jihun" from becoming "Jihoon" four chapters later.
--
-- Provenance is part of the contract. A human-added term is `manual` and the
-- pipeline may never overwrite it. Detected terms are `auto`, dismissible, and
-- excluded from prompts once dismissed.

set search_path = public, extensions;

create table public.glossary_terms (
  id          uuid primary key default gen_random_uuid(),
  series_id   uuid not null references public.series(id) on delete cascade,
  source_term text not null check (char_length(source_term) between 1 and 60),
  target_term text not null check (char_length(target_term) between 1 and 60),
  category    text not null check (
                category in ('character','place','honorific','item','term')
              ),
  origins     text[] not null default '{}' check (
                origins <@ array['auto','manual']::text[]
              ),
  status      text not null default 'active'
                check (status in ('active','dismissed')),
  notes       text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (series_id, source_term)
);

-- Case-insensitive uniqueness, matching termKey() in the old browser store.
create unique index glossary_terms_series_source_key
  on public.glossary_terms(series_id, lower(source_term));

create index glossary_terms_series_idx
  on public.glossary_terms(series_id, status);

alter table public.glossary_terms enable row level security;

create policy glossary_terms_select_visible
  on public.glossary_terms for select
  to authenticated
  using (public.can_view_series(series_id));

revoke all on table public.glossary_terms from anon, authenticated;
grant select on table public.glossary_terms to authenticated;

-- No INSERT/UPDATE/DELETE policies: writes are RPC-only.

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

create or replace function public.glossary_category(p_value text)
returns text
language sql
immutable
as $$
  select case
    when p_value in ('character','place','honorific','item','term') then p_value
    else 'term'
  end;
$$;

create or replace function public.clean_term(p_value text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g'));
$$;

/* ------------------------------------------------------------------ */
/* Manual terms                                                        */
/* ------------------------------------------------------------------ */

create or replace function public.add_glossary_term(
  p_series_id   uuid,
  p_source_term text,
  p_target_term text,
  p_category    text
)
returns public.glossary_terms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source  text := public.clean_term(p_source_term);
  v_target  text := public.clean_term(p_target_term);
  v_category text := public.glossary_category(p_category);
  v_term    public.glossary_terms;
  v_actor   uuid := (select auth.uid());
begin
  if not public.can_work_on_series(p_series_id) then
    raise exception 'You don''t have access to this series.' using errcode = 'HF001';
  end if;

  if v_source = '' or char_length(v_source) > 60 then
    raise exception 'Add a term of 60 characters or fewer.' using errcode = 'HF030';
  end if;

  if v_target = '' or char_length(v_target) > 60 then
    raise exception 'Add a translation of 60 characters or fewer.' using errcode = 'HF030';
  end if;

  select * into v_term
  from public.glossary_terms
  where series_id = p_series_id
    and lower(source_term) = lower(v_source)
  for update;

  if v_term.id is not null then
    -- Promoting an auto term is the documented path. A second manual
    -- definition of the same source is an edit, not a new row.
    if 'manual' = any(v_term.origins) and v_term.status = 'active' then
      raise exception 'That term is already in the glossary — edit it instead.'
        using errcode = 'HF031';
    end if;

    update public.glossary_terms
       set source_term = v_source,
           target_term = v_target,
           category = v_category,
           origins = array['manual'],
           status = 'active',
           created_by = coalesce(created_by, v_actor),
           updated_at = now()
     where id = v_term.id
    returning * into v_term;

    return v_term;
  end if;

  insert into public.glossary_terms (
    series_id, source_term, target_term, category, origins, created_by
  )
  values (
    p_series_id, v_source, v_target, v_category, array['manual'], v_actor
  )
  returning * into v_term;

  return v_term;
end;
$$;

create or replace function public.update_glossary_term(
  p_term_id     uuid,
  p_target_term text,
  p_category    text
)
returns public.glossary_terms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term   public.glossary_terms;
  v_target text;
begin
  select * into v_term
  from public.glossary_terms
  where id = p_term_id
  for update;

  if v_term.id is null then
    raise exception 'That term no longer exists.' using errcode = 'HF002';
  end if;

  if not public.can_work_on_series(v_term.series_id) then
    raise exception 'You don''t have access to this series.' using errcode = 'HF001';
  end if;

  v_target := public.clean_term(p_target_term);
  if v_target = '' or char_length(v_target) > 60 then
    raise exception 'Add a translation of 60 characters or fewer.' using errcode = 'HF030';
  end if;

  update public.glossary_terms
     set target_term = v_target,
         category = public.glossary_category(p_category),
         -- A human edit makes an auto term manual: the next run must not
         -- overwrite the wording they chose.
         origins = array['manual'],
         updated_at = now()
   where id = p_term_id
  returning * into v_term;

  return v_term;
end;
$$;

create or replace function public.set_glossary_status(
  p_term_id uuid,
  p_status  text
)
returns public.glossary_terms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term public.glossary_terms;
begin
  select * into v_term
  from public.glossary_terms
  where id = p_term_id
  for update;

  if v_term.id is null then
    raise exception 'That term no longer exists.' using errcode = 'HF002';
  end if;

  if not public.can_work_on_series(v_term.series_id) then
    raise exception 'You don''t have access to this series.' using errcode = 'HF001';
  end if;

  if p_status not in ('active','dismissed') then
    raise exception 'That is not a term status.' using errcode = 'HF030';
  end if;

  if v_term.status = p_status then return v_term; end if;

  update public.glossary_terms
     set status = p_status,
         updated_at = now()
   where id = p_term_id
  returning * into v_term;

  return v_term;
end;
$$;

/* ------------------------------------------------------------------ */
/* Auto terms                                                          */
/* ------------------------------------------------------------------ */

-- Called once per chapter run with the proofread pass's `terms` array.
--   - never overwrites a manual term
--   - never revives a dismissed term
--   - collapses duplicates inside the same payload
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

/* ------------------------------------------------------------------ */
/* Privileges                                                          */
/* ------------------------------------------------------------------ */

revoke all on function public.glossary_category(text) from public;
revoke all on function public.clean_term(text) from public;
revoke all on function public.add_glossary_term(uuid, text, text, text) from public;
revoke all on function public.update_glossary_term(uuid, text, text) from public;
revoke all on function public.set_glossary_status(uuid, text) from public;
revoke all on function public.upsert_glossary_terms(uuid, uuid, jsonb) from public;

grant execute on function public.glossary_category(text) to authenticated;
grant execute on function public.clean_term(text) to authenticated;
grant execute on function public.add_glossary_term(uuid, text, text, text) to authenticated;
grant execute on function public.update_glossary_term(uuid, text, text) to authenticated;
grant execute on function public.set_glossary_status(uuid, text) to authenticated;
grant execute on function public.upsert_glossary_terms(uuid, uuid, jsonb) to authenticated;
