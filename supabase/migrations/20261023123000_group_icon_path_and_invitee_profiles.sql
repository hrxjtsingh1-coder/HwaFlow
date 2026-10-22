-- Two corrections needed by the Phase 1 app layer.
--
-- 1. `set_group_icon` required the object path to start with `group-icons/`,
--    but a Storage object name never includes the bucket. The bucket is
--    `group-icons`; the object is `{group}/icon.webp`. The old check would
--    reject every real upload, and the Storage policies (which read
--    `storage.foldername(name)[1]` as the group id) would reject the
--    bucket-prefixed alternative.
--
-- 2. A manager's "Pending invites" list shows the invitee's @username. The
--    invitee is not a member yet, so `profiles_select_co_member` does not
--    apply and the embed comes back null. This grants the narrowest read:
--    the profile of someone who has a *pending* invite to a group the caller
--    manages.
--
-- Depends on: 20261023120000_groups.sql, 20261023121000_profiles_co_member.sql.

set search_path = public, extensions;

/* ------------------------------------------------------------------ */
/* set_group_icon: object path is relative to the bucket               */
/* ------------------------------------------------------------------ */

create or replace function public.set_group_icon(
  p_group_id uuid,
  p_path     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_platform_admin()
    or public.has_group_role(p_group_id, array['owner'])
  ) then
    raise exception 'Only the group Owner can change its icon.'
      using errcode = 'HF001';
  end if;

  -- `p_path` is a Storage object name: {group_id}/icon.webp. The bucket name
  -- is supplied separately to storage.from(), so it must not appear here.
  if p_path is not null
     and p_path not like p_group_id::text || '/%' then
    raise exception 'That icon path does not belong to this group.'
      using errcode = 'HF012';
  end if;

  update public.groups set icon_path = p_path where id = p_group_id;
  if not found then
    raise exception 'That group no longer exists.' using errcode = 'HF002';
  end if;
end;
$$;

comment on function public.set_group_icon(uuid, text) is
  'Sets groups.icon_path. Path is a Storage object name relative to the group-icons bucket.';

/* ------------------------------------------------------------------ */
/* Pending invitee profiles                                            */
/* ------------------------------------------------------------------ */

create or replace function public.is_pending_invitee_of_managed_group(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_invites i
    where i.user_id = p_user
      and i.status = 'pending'
      and public.has_group_role(i.group_id, array['owner','manager'])
  );
$$;

comment on function public.is_pending_invitee_of_managed_group(uuid) is
  'True when p_user has a pending invite to a group the caller owns or manages.';

revoke all on function public.is_pending_invitee_of_managed_group(uuid) from public;
grant execute on function public.is_pending_invitee_of_managed_group(uuid) to authenticated;

drop policy if exists profiles_select_pending_invitee on public.profiles;

create policy profiles_select_pending_invitee
  on public.profiles for select
  to authenticated
  using (public.is_pending_invitee_of_managed_group(id));

comment on policy profiles_select_pending_invitee on public.profiles is
  'Lets an Owner or Manager read the name of someone with a pending invite to their group.';
