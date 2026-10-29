-- Full-resolution chapter pages are stored as lossless PNGs.
-- Keep legacy WebP objects readable, and enforce the same page/byte limits used
-- by the HwaFlow upload action and XianScan bridge before rows enter a chapter.
-- This migration is included for source/deployment consistency; it has not been
-- applied from this workspace.

update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/png', 'image/webp']
 where id = 'pages';

create or replace function public.guard_chapter_page_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pages int;
  v_bytes bigint;
begin
  if new.byte_size is null or new.byte_size <= 0 or new.byte_size > 10485760 then
    raise exception 'A chapter page must be between 1 byte and 10 MiB.'
      using errcode = '23514';
  end if;

  -- Serialize competing uploads for one chapter, then count all other page
  -- rows. Direct RPC/storage callers cannot race past the app-side preflight.
  perform 1
    from public.chapters c
   where c.id = new.chapter_id
   for update;

  select count(*), coalesce(sum(p.byte_size), 0)
    into v_pages, v_bytes
    from public.chapter_pages p
   where p.chapter_id = new.chapter_id
     and p.id is distinct from new.id;

  if v_pages >= 20 then
    raise exception 'A chapter holds at most 20 pages.'
      using errcode = '23514';
  end if;

  if v_bytes + new.byte_size > 83886080 then
    raise exception 'A chapter cannot exceed 80 MiB of original pages.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_chapter_page_budget() from public;

drop trigger if exists chapter_pages_engine_budget on public.chapter_pages;
create trigger chapter_pages_engine_budget
before insert or update of chapter_id, byte_size on public.chapter_pages
for each row execute function public.guard_chapter_page_budget();
