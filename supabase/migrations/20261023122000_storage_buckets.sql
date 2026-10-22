-- Private Storage buckets for content images.
--
-- All three buckets are created here so the app can reference them from Phase 1
-- onward, but only `group-icons` gets policies now: the `pages` and `covers`
-- policies call `can_view_chapter` / `can_view_series`, which do not exist
-- until the chapters and series migrations land.
--
-- Object `name` does not include the bucket, so:
--   group-icons/{group}/icon.webp          -> foldername[1] = group
--   covers/{group}/{series}/cover.webp     -> foldername[1] = group, [2] = series
--   pages/{group}/{chapter}/{panel}.webp   -> foldername[1] = group, [2] = chapter
--
-- Signed URLs are the only read path. Nothing here is public.

set search_path = public, extensions;

/* ------------------------------------------------------------------ */
/* Buckets                                                             */
/* ------------------------------------------------------------------ */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('pages',       'pages',       false, 10485760, array['image/webp']),
  ('covers',      'covers',      false,  5242880, array['image/webp','image/png','image/jpeg']),
  ('group-icons', 'group-icons', false,  5242880, array['image/webp','image/png','image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* ------------------------------------------------------------------ */
/* group-icons policies                                                */
/* ------------------------------------------------------------------ */

-- A group icon is visible to its members, to an invitee who has not accepted
-- yet (the invite card renders it), and to the platform admin. `is_platform_admin`
-- only unlocks metadata like this — never series or chapter content.
drop policy if exists "group_icons_read" on storage.objects;
create policy "group_icons_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'group-icons'
    and (
      public.group_role_for_path((storage.foldername(name))[1]) is not null
      or public.has_pending_group_invite_path((storage.foldername(name))[1])
      or public.is_platform_admin()
    )
  );

-- Writes are Owner-only. The platform admin is included because create_group
-- uploads the icon before the admin is a member of the new group.
drop policy if exists "group_icons_insert" on storage.objects;
create policy "group_icons_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'group-icons'
    and (
      public.group_role_for_path((storage.foldername(name))[1]) = 'owner'
      or public.is_platform_admin()
    )
  );

drop policy if exists "group_icons_update" on storage.objects;
create policy "group_icons_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'group-icons'
    and (
      public.group_role_for_path((storage.foldername(name))[1]) = 'owner'
      or public.is_platform_admin()
    )
  )
  with check (
    bucket_id = 'group-icons'
    and (
      public.group_role_for_path((storage.foldername(name))[1]) = 'owner'
      or public.is_platform_admin()
    )
  );

drop policy if exists "group_icons_delete" on storage.objects;
create policy "group_icons_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'group-icons'
    and (
      public.group_role_for_path((storage.foldername(name))[1]) = 'owner'
      or public.is_platform_admin()
    )
  );
