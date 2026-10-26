-- OPTIONAL but recommended: implements the "purge originals on approval" policy
-- that docs/ARCHITECTURE.md already promises and groups.retention_policy already
-- stores, but that no code in the original repo actually performed.
--
-- Run with the rest of your migrations (`supabase db push`), then enable it in
-- HwaFlow with ENGINE_PURGE_SUPABASE_ORIGINALS=1. Without that env var this
-- function is never called, so applying this migration is safe.
--
-- It only flips metadata. The actual Storage objects are removed by
-- app/api/engine/jobs/[id]/approve/route.ts using the caller's own client, so
-- the existing "pages_delete" RLS policy still governs who can delete.

set search_path = public, extensions;

create or replace function public.purge_chapter_originals(p_chapter uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int := 0;
begin
  -- Managers/Owners only. can_manage_chapter() is already defined by the
  -- chapters migration and checks the caller's group role.
  if not public.can_manage_chapter(p_chapter) then
    raise exception 'Only a manager can purge chapter originals.'
      using errcode = 'HF001';
  end if;

  -- Respect the group's swappable retention policy. 'keep' = do nothing.
  if exists (
    select 1
    from public.chapters c
    join public.series s on s.id = c.series_id
    join public.groups g on g.id = s.group_id
    where c.id = p_chapter
      and coalesce(g.retention_policy, 'purge_on_approval') = 'keep'
  ) then
    return 0;
  end if;

  update public.chapter_pages
     set storage_state = 'purged'
   where chapter_id = p_chapter
     and storage_state = 'stored';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_chapter_originals(uuid) from public;
grant execute on function public.purge_chapter_originals(uuid) to authenticated;
