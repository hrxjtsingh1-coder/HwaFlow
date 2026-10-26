-- Phase 3 — keep the engine's finished pages.
--
-- The engine emits PNG; `pages` only accepts image/webp because the browser
-- uploads originals there. Finished pages get their own private bucket, and
-- `chapter_pages.clean_path` points at it.
--
-- `original_path` is never rewritten: text extraction still OCRs the raw art,
-- not the typeset page. The viewer prefers the render when one exists.
--
-- `chapter_pages` has a SELECT policy only (writes go through RPCs), so the
-- path is set through `set_chapter_page_render()` below.

set search_path = public, extensions;

/* ------------------------------------------------------------------ */
/* Bucket                                                              */
/* ------------------------------------------------------------------ */

-- 25 MB covers a 1600x2400 PNG with margin; the engine's pages are far smaller.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('renders', 'renders', false, 26214400, array['image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table public.chapter_pages
  add column if not exists clean_path text;

comment on column public.chapter_pages.clean_path is
  'Object path in the renders bucket for the engine''s finished page. Null until a run is applied. original_path is never rewritten.';

/* ------------------------------------------------------------------ */
/* Policies — renders/{group}/{chapter}/{page}.png                     */
/* ------------------------------------------------------------------ */

drop policy if exists "renders_select" on storage.objects;
create policy "renders_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'renders'
    and public.can_view_chapter_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

drop policy if exists "renders_insert" on storage.objects;
create policy "renders_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'renders'
    and public.can_edit_chapter_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

drop policy if exists "renders_update" on storage.objects;
create policy "renders_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'renders'
    and public.can_edit_chapter_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  )
  with check (
    bucket_id = 'renders'
    and public.can_edit_chapter_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

drop policy if exists "renders_delete" on storage.objects;
create policy "renders_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'renders'
    and public.can_edit_chapter_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

/* ------------------------------------------------------------------ */
/* RPC                                                                 */
/* ------------------------------------------------------------------ */

create or replace function public.set_chapter_page_render(
  p_page_id uuid,
  p_path    text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chapter uuid;
begin
  select chapter_id into v_chapter
  from public.chapter_pages
  where id = p_page_id;

  if v_chapter is null then
    raise exception 'That panel no longer exists.' using errcode = 'HF002';
  end if;

  if not public.can_edit_chapter(v_chapter) then
    raise exception 'You don''t have access to this chapter.' using errcode = 'HF001';
  end if;

  update public.chapter_pages
     set clean_path = nullif(btrim(p_path), '')
   where id = p_page_id;

  update public.chapters set updated_at = now() where id = v_chapter;
end;
$$;

revoke all on function public.set_chapter_page_render(uuid, text) from public;
grant execute on function public.set_chapter_page_render(uuid, text) to authenticated;
