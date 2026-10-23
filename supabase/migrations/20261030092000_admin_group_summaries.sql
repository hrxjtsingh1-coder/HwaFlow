-- Metadata counts for the platform admin.
--
-- The admin console may show how many series and chapters a group owns, but it
-- must never read their titles, covers or pages. RLS already enforces that:
-- `can_view_series` only passes for a group's owner/manager or an assigned
-- staff member, so a plain select from `series` returns zero rows for the
-- admin and the grid rendered "0 series" for every group.
--
-- This function counts without exposing content. It is platform-admin only and
-- returns aggregates for every group in one round trip, so the grid does not
-- need an N+1.

create or replace function public.admin_group_summaries()
returns table (
  group_id      uuid,
  member_count  int,
  series_count  int,
  chapter_count int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only the platform admin can read group metadata.'
      using errcode = 'HF001';
  end if;

  return query
    select
      g.id,
      (select count(*)::int
         from public.group_members m
        where m.group_id = g.id),
      (select count(*)::int
         from public.series s
        where s.group_id = g.id),
      (select count(*)::int
         from public.chapters c
         join public.series s on s.id = c.series_id
        where s.group_id = g.id)
    from public.groups g;
end;
$$;

revoke all on function public.admin_group_summaries() from public;
grant execute on function public.admin_group_summaries() to authenticated;
