-- Co-member and inviter profile visibility.
--
-- `profiles` is self-read plus platform admin by default. Groups need two more
-- narrow reads:
--
--   1. a roster: the people you already share a group with;
--   2. the inviter's name on a pending invite, before you are a member.
--
-- Both go through SECURITY DEFINER helpers so a policy on `profiles` never
-- reads `group_members`/`group_invites` under their own RLS (which would either
-- recurse or depend on the caller's memberships in the wrong direction).
--
-- Depends on: 20261023120000_groups.sql.

set search_path = public, extensions;

/* ------------------------------------------------------------------ */
/* Inviter lookup                                                      */
/* ------------------------------------------------------------------ */

create or replace function public.has_invited_me(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_invites i
    where i.invited_by = p_user
      and i.user_id = (select auth.uid())
      and i.status = 'pending'
  );
$$;

revoke all on function public.has_invited_me(uuid) from public;
grant execute on function public.has_invited_me(uuid) to authenticated;

/* ------------------------------------------------------------------ */
/* Policies                                                            */
/* ------------------------------------------------------------------ */

drop policy if exists profiles_select_co_member on public.profiles;

create policy profiles_select_co_member
  on public.profiles for select
  to authenticated
  using (public.shares_group_with(id));

comment on policy profiles_select_co_member on public.profiles is
  'Read profiles of people in a shared group. Pairs with profiles_select_self and profiles_select_admin.';

drop policy if exists profiles_select_inviter on public.profiles;

create policy profiles_select_inviter
  on public.profiles for select
  to authenticated
  using (public.has_invited_me(id));

comment on policy profiles_select_inviter on public.profiles is
  'Read the name of someone with a pending invite for you, before you join.';
