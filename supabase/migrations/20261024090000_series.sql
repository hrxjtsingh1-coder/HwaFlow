-- Series, multi-day release schedule, and assignments.
--
-- A series belongs to one group and can release on 1–7 weekdays. Assignments
-- are who works on it; Owners and Managers see every series in their group
-- regardless, Staff only the ones assigned to them. Writes are RPC-only, the
-- same rule as groups: RLS exposes reads, the functions enforce roles.
--
-- Weekdays are 0 = Monday … 6 = Sunday, matching the workspace UI.

set search_path = public, extensions;

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

create table public.series (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups(id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 80),
  genre             text check (genre is null or char_length(genre) <= 32),
  description       text check (description is null or char_length(description) <= 600),
  cover_path        text,
  source_language   text not null check (source_language in ('ko','ja','zh')),
  reading_direction text not null default 'ttb'
                      check (reading_direction in ('ttb','rtl','ltr')),
  rate_amount       numeric(10,2) not null default 0 check (rate_amount >= 0),
  archived          boolean not null default false,
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index series_group_id_idx on public.series(group_id, created_at desc);
create index series_archived_idx on public.series(group_id, archived);

create table public.series_release_days (
  series_id uuid not null references public.series(id) on delete cascade,
  weekday   smallint not null check (weekday between 0 and 6),
  primary key (series_id, weekday)
);

create table public.series_assignments (
  series_id   uuid not null references public.series(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  primary key (series_id, user_id)
);

create index series_assignments_user_idx
  on public.series_assignments(user_id, series_id);

/* ------------------------------------------------------------------ */
/* Access helpers                                                      */
/* ------------------------------------------------------------------ */

-- All helpers are SECURITY DEFINER with an empty search_path: they read tables
-- whose own RLS would otherwise recurse, and fully qualified names stop a
-- caller from shadowing a table through search_path.

create or replace function public.is_series_assignee(p_series uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.series_assignments a
    where a.series_id = p_series
      and a.user_id = (select auth.uid())
  );
$$;

-- Owner/Manager of the series' group, or an assigned member. Used for the
-- "can touch this series' work" checks that chapters will build on.
create or replace function public.can_work_on_series(p_series uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.series s
    where s.id = p_series
      and s.archived = false
      and (
        exists (
          select 1
          from public.group_members m
          where m.group_id = s.group_id
            and m.user_id = (select auth.uid())
            and m.role in ('owner','manager')
        )
        or exists (
          select 1
          from public.series_assignments a
          where a.series_id = s.id
            and a.user_id = (select auth.uid())
        )
      )
  );
$$;

-- Read access. Archived series are hidden from every read path; unarchive is
-- not a surface yet, so this keeps the list honest.
create or replace function public.can_view_series(p_series uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.series s
    where s.id = p_series
      and s.archived = false
      and (
        exists (
          select 1
          from public.group_members m
          where m.group_id = s.group_id
            and m.user_id = (select auth.uid())
            and m.role in ('owner','manager')
        )
        or exists (
          select 1
          from public.series_assignments a
          where a.series_id = s.id
            and a.user_id = (select auth.uid())
        )
      )
  );
$$;

-- Editing metadata, assignments and covers is Owner/Manager only.
create or replace function public.can_edit_series(p_series uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.series s
    where s.id = p_series
      and s.archived = false
      and exists (
        select 1
        from public.group_members m
        where m.group_id = s.group_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner','manager')
      )
  );
$$;

-- Text variants for Storage policies. Casting a malformed folder name to uuid
-- would raise inside a policy and fail the whole Storage request, so compare
-- text and simply deny.
create or replace function public.can_view_series_path(
  p_group text,
  p_series text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.series s
    where s.group_id::text = p_group
      and s.id::text = p_series
      and s.archived = false
      and (
        exists (
          select 1
          from public.group_members m
          where m.group_id = s.group_id
            and m.user_id = (select auth.uid())
            and m.role in ('owner','manager')
        )
        or exists (
          select 1
          from public.series_assignments a
          where a.series_id = s.id
            and a.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function public.can_edit_series_path(
  p_group text,
  p_series text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.series s
    where s.group_id::text = p_group
      and s.id::text = p_series
      and s.archived = false
      and exists (
        select 1
        from public.group_members m
        where m.group_id = s.group_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner','manager')
      )
  );
$$;

/* ------------------------------------------------------------------ */
/* Row level security                                                  */
/* ------------------------------------------------------------------ */

alter table public.series enable row level security;
alter table public.series_release_days enable row level security;
alter table public.series_assignments enable row level security;

create policy series_select_visible
  on public.series for select
  to authenticated
  using (public.can_view_series(id));

create policy series_release_days_select_visible
  on public.series_release_days for select
  to authenticated
  using (public.can_view_series(series_id));

create policy series_assignments_select_visible
  on public.series_assignments for select
  to authenticated
  using (public.can_view_series(series_id));

-- No INSERT/UPDATE/DELETE policies: writes are RPC-only.
revoke all on table public.series, public.series_release_days, public.series_assignments
  from anon, authenticated;
grant select on table public.series, public.series_release_days, public.series_assignments
  to authenticated;

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

create or replace function public.assert_valid_release_days(p_days smallint[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_days is null or cardinality(p_days) = 0 then
    raise exception 'Pick at least one release day.' using errcode = 'HF014';
  end if;

  if cardinality(p_days) > 7 then
    raise exception 'A series can release on at most seven days.' using errcode = 'HF014';
  end if;

  if exists (select 1 from unnest(p_days) d where d is null or d < 0 or d > 6) then
    raise exception 'Pick a valid release day.' using errcode = 'HF014';
  end if;

  if (select count(distinct d) from unnest(p_days) d) <> cardinality(p_days) then
    raise exception 'A release day can only be picked once.' using errcode = 'HF014';
  end if;
end;
$$;

create or replace function public.assert_valid_assignees(
  p_group_id uuid,
  p_user_ids uuid[]
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) uid
    where not exists (
      select 1
      from public.group_members m
      where m.group_id = p_group_id and m.user_id = uid
    )
  ) then
    raise exception 'Everyone assigned must be a member of this group.'
      using errcode = 'HF012';
  end if;

  if exists (
    select 1
    from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = any (coalesce(p_user_ids, '{}'::uuid[]))
      and m.role = 'owner'
  ) then
    raise exception 'The Owner cannot be assigned to a series.'
      using errcode = 'HF001';
  end if;
end;
$$;

/* ------------------------------------------------------------------ */
/* create_series                                                       */
/* ------------------------------------------------------------------ */

create or replace function public.create_series(
  p_group_id        uuid,
  p_title           text,
  p_genre           text,
  p_description     text,
  p_source_language text,
  p_rate_amount     numeric,
  p_release_days    smallint[],
  p_assignee_ids    uuid[]
)
returns public.series
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid := (select auth.uid());
  v_title     text;
  v_genre     text;
  v_description text;
  v_direction text;
  v_series    public.series;
begin
  if not public.has_group_role(p_group_id, array['owner','manager']) then
    raise exception 'Only an Owner or Manager can create a series.'
      using errcode = 'HF001';
  end if;

  v_title := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  if char_length(v_title) < 2 then
    raise exception 'Give the series a title with at least 2 characters.'
      using errcode = 'HF013';
  end if;
  if char_length(v_title) > 80 then
    raise exception 'Keep the title to 80 characters or fewer.'
      using errcode = 'HF013';
  end if;

  if p_release_days is null then
    raise exception 'Pick at least one release day.' using errcode = 'HF014';
  end if;
  perform public.assert_valid_release_days(p_release_days);

  if coalesce(p_rate_amount, 0) < 0 or coalesce(p_rate_amount, 0) > 9999.99 then
    raise exception 'Keep the rate at 9999.99 or less.' using errcode = 'HF015';
  end if;

  if p_source_language is null or p_source_language not in ('ko','ja','zh') then
    raise exception 'Pick a supported source language.'
      using errcode = 'HF016';
  end if;

  v_genre := nullif(btrim(coalesce(p_genre, '')), '');
  if v_genre is not null and char_length(v_genre) > 32 then
    raise exception 'Keep the genre to 32 characters or fewer.'
      using errcode = 'HF017';
  end if;

  v_description := nullif(btrim(coalesce(p_description, '')), '');
  if v_description is not null and char_length(v_description) > 600 then
    raise exception 'Keep the description to 600 characters or fewer.'
      using errcode = 'HF018';
  end if;

  perform public.assert_valid_assignees(p_group_id, p_assignee_ids);

  v_direction := case p_source_language when 'ja' then 'rtl' else 'ttb' end;

  insert into public.series (
    group_id, title, genre, description, source_language, reading_direction,
    rate_amount, created_by
  )
  values (
    p_group_id, v_title, v_genre, v_description, p_source_language, v_direction,
    coalesce(p_rate_amount, 0), v_actor
  )
  returning * into v_series;

  insert into public.series_release_days (series_id, weekday)
  select v_series.id, d from unnest(p_release_days) d;

  insert into public.series_assignments (series_id, user_id, assigned_by)
  select v_series.id, uid, v_actor
  from (
    select distinct u as uid
    from unnest(coalesce(p_assignee_ids, '{}'::uuid[])) u
  ) picked;

  return v_series;
end;
$$;

/* ------------------------------------------------------------------ */
/* update_series                                                       */
/* ------------------------------------------------------------------ */

create or replace function public.update_series(
  p_series_id       uuid,
  p_title           text,
  p_genre           text,
  p_description     text,
  p_source_language text,
  p_rate_amount     numeric,
  p_release_days    smallint[]
)
returns public.series
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row       public.series;
  v_title     text;
  v_genre     text;
  v_description text;
  v_direction text;
begin
  select * into v_row from public.series where id = p_series_id for update;
  if v_row.id is null then
    raise exception 'That series no longer exists.' using errcode = 'HF002';
  end if;

  if not public.has_group_role(v_row.group_id, array['owner','manager']) then
    raise exception 'Only an Owner or Manager can edit this series.'
      using errcode = 'HF001';
  end if;

  v_title := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  if char_length(v_title) < 2 then
    raise exception 'Give the series a title with at least 2 characters.'
      using errcode = 'HF013';
  end if;
  if char_length(v_title) > 80 then
    raise exception 'Keep the title to 80 characters or fewer.'
      using errcode = 'HF013';
  end if;

  if p_release_days is null then
    raise exception 'Pick at least one release day.' using errcode = 'HF014';
  end if;
  perform public.assert_valid_release_days(p_release_days);

  if coalesce(p_rate_amount, 0) < 0 or coalesce(p_rate_amount, 0) > 9999.99 then
    raise exception 'Keep the rate at 9999.99 or less.' using errcode = 'HF015';
  end if;

  if p_source_language is null or p_source_language not in ('ko','ja','zh') then
    raise exception 'Pick a supported source language.'
      using errcode = 'HF016';
  end if;

  v_genre := nullif(btrim(coalesce(p_genre, '')), '');
  if v_genre is not null and char_length(v_genre) > 32 then
    raise exception 'Keep the genre to 32 characters or fewer.'
      using errcode = 'HF017';
  end if;

  v_description := nullif(btrim(coalesce(p_description, '')), '');
  if v_description is not null and char_length(v_description) > 600 then
    raise exception 'Keep the description to 600 characters or fewer.'
      using errcode = 'HF018';
  end if;

  v_direction := case p_source_language when 'ja' then 'rtl' else 'ttb' end;

  update public.series
     set title = v_title,
         genre = v_genre,
         description = v_description,
         source_language = p_source_language,
         reading_direction = v_direction,
         rate_amount = coalesce(p_rate_amount, 0),
         updated_at = now()
   where id = p_series_id
  returning * into v_row;

  delete from public.series_release_days where series_id = p_series_id;
  insert into public.series_release_days (series_id, weekday)
  select p_series_id, d from unnest(p_release_days) d;

  return v_row;
end;
$$;

/* ------------------------------------------------------------------ */
/* set_series_assignments                                              */
/* ------------------------------------------------------------------ */

create or replace function public.set_series_assignments(
  p_series_id uuid,
  p_user_ids  uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   public.series;
  v_actor uuid := (select auth.uid());
begin
  select * into v_row from public.series where id = p_series_id;
  if v_row.id is null then
    raise exception 'That series no longer exists.' using errcode = 'HF002';
  end if;

  if not public.has_group_role(v_row.group_id, array['owner','manager']) then
    raise exception 'Only an Owner or Manager can change assignments.'
      using errcode = 'HF001';
  end if;

  perform public.assert_valid_assignees(v_row.group_id, p_user_ids);

  delete from public.series_assignments
  where series_id = p_series_id
    and user_id <> all (coalesce(p_user_ids, '{}'::uuid[]));

  insert into public.series_assignments (series_id, user_id, assigned_by)
  select p_series_id, uid, v_actor
  from (
    select distinct u as uid
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) u
  ) picked
  where not exists (
    select 1
    from public.series_assignments a
    where a.series_id = p_series_id and a.user_id = picked.uid
  );
end;
$$;

/* ------------------------------------------------------------------ */
/* set_series_cover                                                    */
/* ------------------------------------------------------------------ */

create or replace function public.set_series_cover(
  p_series_id uuid,
  p_path      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.series;
begin
  select * into v_row from public.series where id = p_series_id;
  if v_row.id is null then
    raise exception 'That series no longer exists.' using errcode = 'HF002';
  end if;

  if not public.has_group_role(v_row.group_id, array['owner','manager']) then
    raise exception 'Only an Owner or Manager can change the cover.'
      using errcode = 'HF001';
  end if;

  if p_path is not null
     and p_path not like v_row.group_id::text || '/' || v_row.id::text || '/%'
  then
    raise exception 'That cover path is not valid for this series.'
      using errcode = 'HF019';
  end if;

  update public.series
     set cover_path = p_path,
         updated_at = now()
   where id = p_series_id;
end;
$$;

/* ------------------------------------------------------------------ */
/* Membership removal clears assignments                               */
/* ------------------------------------------------------------------ */

-- Replaces the Phase 1 body: a removed member must not keep a series in their
-- calendar. The FK would not do this because the profile still exists.
create or replace function public.remove_group_member(
  p_group_id uuid,
  p_user_id  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target text;
begin
  if not public.has_group_role(p_group_id, array['owner']) then
    raise exception 'Only the Owner can remove members.' using errcode = 'HF001';
  end if;

  select m.role into v_target
  from public.group_members m
  where m.group_id = p_group_id and m.user_id = p_user_id;

  if v_target is null then
    raise exception 'That person is not a member.' using errcode = 'HF012';
  end if;

  if v_target = 'owner' then
    raise exception 'The Owner cannot be removed. Transfer ownership first.'
      using errcode = 'HF007';
  end if;

  delete from public.series_assignments a
  using public.series s
  where a.series_id = s.id
    and s.group_id = p_group_id
    and a.user_id = p_user_id;

  delete from public.group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

/* ------------------------------------------------------------------ */
/* Storage policies for covers                                         */
/* ------------------------------------------------------------------ */

drop policy if exists "covers_read" on storage.objects;
create policy "covers_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'covers'
    and public.can_view_series_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

drop policy if exists "covers_insert" on storage.objects;
create policy "covers_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'covers'
    and public.can_edit_series_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

drop policy if exists "covers_update" on storage.objects;
create policy "covers_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'covers'
    and public.can_edit_series_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  )
  with check (
    bucket_id = 'covers'
    and public.can_edit_series_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

drop policy if exists "covers_delete" on storage.objects;
create policy "covers_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'covers'
    and public.can_edit_series_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

/* ------------------------------------------------------------------ */
/* Privileges                                                          */
/* ------------------------------------------------------------------ */

revoke all on function public.is_series_assignee(uuid) from public;
revoke all on function public.can_work_on_series(uuid) from public;
revoke all on function public.can_view_series(uuid) from public;
revoke all on function public.can_edit_series(uuid) from public;
revoke all on function public.can_view_series_path(text, text) from public;
revoke all on function public.can_edit_series_path(text, text) from public;
revoke all on function public.assert_valid_release_days(smallint[]) from public;
revoke all on function public.assert_valid_assignees(uuid, uuid[]) from public;
revoke all on function public.create_series(uuid, text, text, text, text, numeric, smallint[], uuid[]) from public;
revoke all on function public.update_series(uuid, text, text, text, text, numeric, smallint[]) from public;
revoke all on function public.set_series_assignments(uuid, uuid[]) from public;
revoke all on function public.set_series_cover(uuid, text) from public;

grant execute on function public.is_series_assignee(uuid) to authenticated;
grant execute on function public.can_work_on_series(uuid) to authenticated;
grant execute on function public.can_view_series(uuid) to authenticated;
grant execute on function public.can_edit_series(uuid) to authenticated;
grant execute on function public.can_view_series_path(text, text) to authenticated;
grant execute on function public.can_edit_series_path(text, text) to authenticated;
grant execute on function public.assert_valid_release_days(smallint[]) to authenticated;
grant execute on function public.assert_valid_assignees(uuid, uuid[]) to authenticated;
grant execute on function public.create_series(uuid, text, text, text, text, numeric, smallint[], uuid[]) to authenticated;
grant execute on function public.update_series(uuid, text, text, text, text, numeric, smallint[]) to authenticated;
grant execute on function public.set_series_assignments(uuid, uuid[]) to authenticated;
grant execute on function public.set_series_cover(uuid, text) to authenticated;
