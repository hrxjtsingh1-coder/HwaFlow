-- Chapters, panel metadata, text blocks and the status audit trail.
--
-- Same shape as groups and series: RLS exposes reads to anyone who can work on
-- the chapter's series, every write goes through a SECURITY DEFINER RPC, and
-- the functions enforce the status matrix. Panels are metadata plus a Storage
-- object path; the browser uploads the WebP directly and registers the row.

set search_path = public, extensions;

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

-- `if not exists` guards make this file safe to re-run after a failed push
-- where the CLI did not wrap the whole file in one transaction.
create table if not exists public.chapters (
  id             uuid primary key default gen_random_uuid(),
  series_id      uuid not null references public.series(id) on delete cascade,
  number         numeric(10,2) not null check (number > 0 and number <= 99999),
  title          text check (title is null or char_length(title) <= 80),
  status         text not null default 'draft'
                   check (status in ('draft','processing','ready','submitted','approved','rejected')),
  rate_snapshot  numeric(10,2),
  submitted_by   uuid references public.profiles(id),
  submitted_at   timestamptz,
  approved_by    uuid references public.profiles(id),
  approved_at    timestamptz,
  rejection_note text,
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (series_id, number)
);

create index if not exists chapters_series_idx on public.chapters(series_id, number);
create index if not exists chapters_status_idx on public.chapters(status, approved_at);

create table if not exists public.chapter_pages (
  id            uuid primary key,                    -- client-generated for direct uploads
  chapter_id    uuid not null references public.chapters(id) on delete cascade,
  page_index    int not null check (page_index >= 0),
  original_path text not null,
  width         int not null check (width > 0),
  height        int not null check (height > 0),
  byte_size     int not null check (byte_size > 0),
  storage_state text not null default 'stored'
                  check (storage_state in ('stored','purged')),
  created_at    timestamptz not null default now(),
  unique (chapter_id, page_index)
);

create index if not exists chapter_pages_chapter_idx on public.chapter_pages(chapter_id, page_index);

create table if not exists public.text_blocks (
  id               uuid primary key default gen_random_uuid(),
  page_id          uuid not null references public.chapter_pages(id) on delete cascade,
  chapter_id       uuid not null references public.chapters(id) on delete cascade,
  block_index      int not null check (block_index >= 0),
  bbox             jsonb,
  source_text      text not null default '',
  base_translation text not null default '',
  final_text       text not null default '',
  confidence       numeric,
  is_edited        boolean not null default false,
  edited_by        uuid references public.profiles(id),
  edited_at        timestamptz,
  unique (page_id, block_index)
);

create index if not exists text_blocks_chapter_idx on public.text_blocks(chapter_id, block_index);

create table if not exists public.chapter_status_events (
  id         uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  from_status text,
  to_status  text not null,
  actor_id   uuid not null references public.profiles(id),
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists chapter_status_events_chapter_idx
  on public.chapter_status_events(chapter_id, created_at);

/* ------------------------------------------------------------------ */
/* Access helpers                                                      */
/* ------------------------------------------------------------------ */

create or replace function public.can_view_chapter(p_chapter uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chapters c
    where c.id = p_chapter
      and public.can_work_on_series(c.series_id)
  );
$$;

-- Same predicate today: "can work" already means Owner/Manager or assigned
-- Staff. Kept as its own name so a future read-only role can diverge.
create or replace function public.can_edit_chapter(p_chapter uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_chapter(p_chapter);
$$;

create or replace function public.can_manage_chapter(p_chapter uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chapters c
    join public.series s on s.id = c.series_id
    where c.id = p_chapter
      and s.archived = false
      and public.has_group_role(s.group_id, array['owner','manager'])
  );
$$;

-- Text variants for Storage policies. Casting a malformed folder name to uuid
-- would raise inside a policy and fail the whole request, so compare text.
create or replace function public.can_view_chapter_path(
  p_group text,
  p_chapter text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chapters c
    join public.series s on s.id = c.series_id
    where s.group_id::text = p_group
      and c.id::text = p_chapter
      and s.archived = false
      and public.can_work_on_series(c.series_id)
  );
$$;

create or replace function public.can_edit_chapter_path(
  p_group text,
  p_chapter text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_chapter_path(p_group, p_chapter);
$$;

/* ------------------------------------------------------------------ */
/* Row level security                                                  */
/* ------------------------------------------------------------------ */

alter table public.chapters enable row level security;
alter table public.chapter_pages enable row level security;
alter table public.text_blocks enable row level security;
alter table public.chapter_status_events enable row level security;

drop policy if exists chapters_select_visible on public.chapters;
create policy chapters_select_visible
  on public.chapters for select
  to authenticated
  using (public.can_view_chapter(id));

drop policy if exists chapter_pages_select_visible on public.chapter_pages;
create policy chapter_pages_select_visible
  on public.chapter_pages for select
  to authenticated
  using (public.can_view_chapter(chapter_id));

drop policy if exists text_blocks_select_visible on public.text_blocks;
create policy text_blocks_select_visible
  on public.text_blocks for select
  to authenticated
  using (public.can_view_chapter(chapter_id));

drop policy if exists chapter_status_events_select_visible on public.chapter_status_events;
create policy chapter_status_events_select_visible
  on public.chapter_status_events for select
  to authenticated
  using (public.can_view_chapter(chapter_id));

revoke all on table public.chapters, public.chapter_pages, public.text_blocks,
  public.chapter_status_events from anon, authenticated;

grant select on table public.chapters, public.chapter_pages, public.text_blocks,
  public.chapter_status_events to authenticated;

-- No INSERT/UPDATE/DELETE policies: writes are RPC-only.

/* ------------------------------------------------------------------ */
/* create_chapter                                                      */
/* ------------------------------------------------------------------ */

create or replace function public.create_chapter(p_series_id uuid)
returns public.chapters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_number  numeric(10,2);
  v_chapter public.chapters;
begin
  if not public.can_work_on_series(p_series_id) then
    raise exception 'You need access to this series to create chapters.'
      using errcode = 'HF001';
  end if;

  select coalesce(max(number), 0) + 1 into v_number
  from public.chapters
  where series_id = p_series_id;

  insert into public.chapters (series_id, number, created_by)
  values (p_series_id, v_number, v_actor)
  returning * into v_chapter;

  insert into public.chapter_status_events (chapter_id, from_status, to_status, actor_id)
  values (v_chapter.id, null, 'draft', v_actor);

  return v_chapter;
end;
$$;

/* ------------------------------------------------------------------ */
/* update_chapter_details                                              */
/* ------------------------------------------------------------------ */

create or replace function public.update_chapter_details(
  p_chapter_id uuid,
  p_number     numeric,
  p_title      text
)
returns public.chapters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chapter public.chapters;
  v_title   text;
begin
  select * into v_chapter from public.chapters where id = p_chapter_id for update;
  if v_chapter.id is null then
    raise exception 'That chapter no longer exists.' using errcode = 'HF002';
  end if;

  if not public.can_edit_chapter(p_chapter_id) then
    raise exception 'You don''t have access to this chapter.' using errcode = 'HF001';
  end if;

  if p_number is not null then
    if p_number <= 0 or p_number > 99999 then
      raise exception 'Chapter numbers start at 1 and stay under 99999.'
        using errcode = 'HF020';
    end if;
    -- numeric(10,2) already rounds; reject a third decimal explicitly.
    if round(p_number, 2) <> p_number then
      raise exception 'Use at most two decimal places.' using errcode = 'HF020';
    end if;
  end if;

  if p_title is not null then
    v_title := btrim(regexp_replace(p_title, '\s+', ' ', 'g'));
    if char_length(v_title) > 80 then
      raise exception 'Keep the title to 80 characters or fewer.'
        using errcode = 'HF022';
    end if;
  end if;

  update public.chapters
     set number = coalesce(p_number, number),
         title = case when p_title is null then title
                      when v_title = '' then null
                      else v_title end,
         updated_at = now()
   where id = p_chapter_id
  returning * into v_chapter;

  return v_chapter;
end;
$$;

/* ------------------------------------------------------------------ */
/* set_chapter_status                                                  */
/* ------------------------------------------------------------------ */

create or replace function public.set_chapter_status(
  p_chapter_id uuid,
  p_next       text,
  p_note       text
)
returns public.chapters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chapter  public.chapters;
  v_group    uuid;
  v_rate     numeric(10,2);
  v_mode     text;
  v_actor    uuid := (select auth.uid());
  v_from     text;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_now      timestamptz := now();
begin
  -- A record variable cannot share an INTO list with scalars, so the chapter
  -- is locked first and the series values are read separately.
  select * into v_chapter
  from public.chapters
  where id = p_chapter_id
  for update;

  if v_chapter.id is null then
    raise exception 'That chapter no longer exists.' using errcode = 'HF002';
  end if;

  select s.group_id, s.rate_amount
    into v_group, v_rate
  from public.series s
  where s.id = v_chapter.series_id;

  if p_next not in ('draft','processing','ready','submitted','approved','rejected') then
    raise exception 'That is not a chapter status.' using errcode = 'HF024';
  end if;

  v_from := v_chapter.status;

  -- Exact parity with canTransition() in the old browser store.
  v_mode := case
    when v_chapter.status = 'draft' and p_next = 'processing' then 'edit'
    when v_chapter.status = 'processing' and p_next in ('ready','draft') then 'edit'
    when v_chapter.status = 'ready' and p_next in ('submitted','processing') then 'edit'
    when v_chapter.status = 'submitted' and p_next in ('approved','rejected') then 'manage'
    when v_chapter.status = 'approved' and p_next = 'submitted' then 'manage'
    when v_chapter.status = 'rejected' and p_next in ('draft','submitted') then 'edit'
    else null
  end;

  if v_mode is null then
    raise exception 'A % chapter can''t move to %.',
      v_chapter.status, p_next using errcode = 'HF024';
  end if;

  if v_mode = 'manage' then
    if not public.has_group_role(v_group, array['owner','manager']) then
      raise exception 'Only an Owner or Manager can approve, reject or reopen a chapter.'
        using errcode = 'HF001';
    end if;
  elsif not public.can_edit_chapter(p_chapter_id) then
    raise exception 'You don''t have access to this chapter.' using errcode = 'HF001';
  end if;

  if p_next = 'submitted' then
    if not exists (
      select 1 from public.chapter_pages where chapter_id = p_chapter_id
    ) or not exists (
      select 1 from public.text_blocks
      where chapter_id = p_chapter_id and btrim(final_text) <> ''
    ) then
      raise exception 'Translate at least one panel before submitting.'
        using errcode = 'HF023';
    end if;
  end if;

  if p_next = 'submitted' and not (v_chapter.status = 'approved' and v_chapter.rate_snapshot is not null) then
    v_chapter.rate_snapshot := round(coalesce(v_rate, 0), 2);
  end if;

  if p_next = 'submitted' and v_chapter.status <> 'approved' then
    v_chapter.submitted_by := v_actor;
    v_chapter.submitted_at := v_now;
  end if;

  if p_next = 'submitted' then
    v_chapter.rejection_note := null;
  end if;

  if p_next = 'approved' then
    v_chapter.approved_by := v_actor;
    v_chapter.approved_at := v_now;
  end if;

  if p_next = 'rejected' then
    v_chapter.approved_by := null;
    v_chapter.approved_at := null;
    v_chapter.rejection_note := v_note;
  end if;

  if v_chapter.status = 'approved' and p_next <> 'approved' then
    v_chapter.approved_by := null;
    v_chapter.approved_at := null;
  end if;

  update public.chapters
     set status = p_next,
         rate_snapshot = v_chapter.rate_snapshot,
         submitted_by = v_chapter.submitted_by,
         submitted_at = v_chapter.submitted_at,
         approved_by = v_chapter.approved_by,
         approved_at = v_chapter.approved_at,
         rejection_note = v_chapter.rejection_note,
         updated_at = v_now
   where id = p_chapter_id
  returning * into v_chapter;

  insert into public.chapter_status_events (chapter_id, from_status, to_status, actor_id, note)
  values (p_chapter_id, v_from, p_next, v_actor, v_note);

  return v_chapter;
end;
$$;

/* ------------------------------------------------------------------ */
/* delete_chapter                                                      */
/* ------------------------------------------------------------------ */

-- Rows cascade; the action removes Storage objects first using paths it read
-- before calling this.
create or replace function public.delete_chapter(p_chapter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_chapter(p_chapter_id) then
    raise exception 'Only an Owner or Manager can delete a chapter.'
      using errcode = 'HF001';
  end if;

  delete from public.chapters where id = p_chapter_id;
end;
$$;

/* ------------------------------------------------------------------ */
/* Text blocks                                                         */
/* ------------------------------------------------------------------ */

-- Replaces the whole block set for one panel. Called by extraction.
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
    );

  for v_block in
    select * from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb))
  loop
    insert into public.text_blocks (
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
      set bbox             = excluded.bbox,
          source_text      = excluded.source_text,
          base_translation = excluded.base_translation,
          final_text       = excluded.final_text,
          confidence       = excluded.confidence;
  end loop;

  update public.chapters set updated_at = now() where id = p_chapter_id;
end;
$$;

-- Pipeline text stages. Never marks a block as human-edited.
create or replace function public.update_block_pipeline_text(
  p_chapter_id uuid,
  p_updates    jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_update jsonb;
begin
  if not public.can_edit_chapter(p_chapter_id) then
    raise exception 'You don''t have access to this chapter.' using errcode = 'HF001';
  end if;

  for v_update in
    select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb))
  loop
    update public.text_blocks
       set base_translation = coalesce(v_update->>'baseTranslation', base_translation),
           final_text       = coalesce(v_update->>'finalText', final_text)
     where id = (v_update->>'blockId')::uuid
       and chapter_id = p_chapter_id;
  end loop;

  update public.chapters set updated_at = now() where id = p_chapter_id;
end;
$$;

-- Human edit from the workspace. Sets the Edited chip exactly once.
create or replace function public.update_block_text(
  p_block_id   uuid,
  p_final_text text
)
returns public.text_blocks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block   public.text_blocks;
  v_text    text := btrim(coalesce(p_final_text, ''));
  v_actor   uuid := (select auth.uid());
begin
  select * into v_block from public.text_blocks where id = p_block_id for update;
  if v_block.id is null then
    raise exception 'That bubble no longer exists.' using errcode = 'HF002';
  end if;

  if not public.can_edit_chapter(v_block.chapter_id) then
    raise exception 'You don''t have access to this chapter.' using errcode = 'HF001';
  end if;

  if char_length(v_text) > 4000 then
    raise exception 'Keep a bubble under 4000 characters.' using errcode = 'HF025';
  end if;

  if v_text = v_block.final_text then
    return v_block;
  end if;

  update public.text_blocks
     set final_text = v_text,
         is_edited = true,
         edited_by = v_actor,
         edited_at = now()
   where id = p_block_id
  returning * into v_block;

  update public.chapters set updated_at = now() where id = v_block.chapter_id;

  return v_block;
end;
$$;

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

-- Browser uploads each WebP first, then registers the metadata. Per-file
-- failures are the caller's problem; a successful subset is inserted.
create or replace function public.register_panels(
  p_chapter_id uuid,
  p_panels     jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_panel  jsonb;
  v_group  uuid;
  v_path   text;
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
  end loop;

  update public.chapters set updated_at = now() where id = p_chapter_id;
end;
$$;

create or replace function public.remove_panel(
  p_chapter_id uuid,
  p_page_id    uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_chapter(p_chapter_id) then
    raise exception 'You don''t have access to this chapter.' using errcode = 'HF001';
  end if;

  delete from public.chapter_pages
  where id = p_page_id and chapter_id = p_chapter_id;

  -- Two phases so the unique (chapter_id, page_index) constraint never sees
  -- two rows with the same index mid-update.
  update public.chapter_pages
     set page_index = page_index + 10000
   where chapter_id = p_chapter_id;

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
end;
$$;

/* ------------------------------------------------------------------ */
/* Storage policies for pages                                          */
/* ------------------------------------------------------------------ */

drop policy if exists "pages_read" on storage.objects;
create policy "pages_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'pages'
    and public.can_view_chapter_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

drop policy if exists "pages_insert" on storage.objects;
create policy "pages_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pages'
    and public.can_edit_chapter_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

drop policy if exists "pages_update" on storage.objects;
create policy "pages_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'pages'
    and public.can_edit_chapter_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  )
  with check (
    bucket_id = 'pages'
    and public.can_edit_chapter_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

drop policy if exists "pages_delete" on storage.objects;
create policy "pages_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'pages'
    and public.can_edit_chapter_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

/* ------------------------------------------------------------------ */
/* Privileges                                                          */
/* ------------------------------------------------------------------ */

revoke all on function public.can_view_chapter(uuid) from public;
revoke all on function public.can_edit_chapter(uuid) from public;
revoke all on function public.can_manage_chapter(uuid) from public;
revoke all on function public.can_view_chapter_path(text, text) from public;
revoke all on function public.can_edit_chapter_path(text, text) from public;
revoke all on function public.create_chapter(uuid) from public;
revoke all on function public.update_chapter_details(uuid, numeric, text) from public;
revoke all on function public.set_chapter_status(uuid, text, text) from public;
revoke all on function public.delete_chapter(uuid) from public;
revoke all on function public.set_panel_blocks(uuid, uuid, jsonb) from public;
revoke all on function public.update_block_pipeline_text(uuid, jsonb) from public;
revoke all on function public.update_block_text(uuid, text) from public;
revoke all on function public.register_panels(uuid, jsonb) from public;
revoke all on function public.remove_panel(uuid, uuid) from public;

grant execute on function public.can_view_chapter(uuid) to authenticated;
grant execute on function public.can_edit_chapter(uuid) to authenticated;
grant execute on function public.can_manage_chapter(uuid) to authenticated;
grant execute on function public.can_view_chapter_path(text, text) to authenticated;
grant execute on function public.can_edit_chapter_path(text, text) to authenticated;
grant execute on function public.create_chapter(uuid) to authenticated;
grant execute on function public.update_chapter_details(uuid, numeric, text) to authenticated;
grant execute on function public.set_chapter_status(uuid, text, text) to authenticated;
grant execute on function public.delete_chapter(uuid) to authenticated;
grant execute on function public.set_panel_blocks(uuid, uuid, jsonb) to authenticated;
grant execute on function public.update_block_pipeline_text(uuid, jsonb) to authenticated;
grant execute on function public.update_block_text(uuid, text) to authenticated;
grant execute on function public.register_panels(uuid, jsonb) to authenticated;
grant execute on function public.remove_panel(uuid, uuid) to authenticated;
