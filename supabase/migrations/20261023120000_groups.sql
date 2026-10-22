-- Groups, memberships and invites.
--
-- Authorization model:
--   * Every write goes through a SECURITY DEFINER RPC. The tables themselves
--     only ever grant SELECT, so a signed-in client cannot insert a membership,
--     promote itself, or forge an invite even if it bypasses the UI.
--   * The helper functions are SECURITY DEFINER so a policy on `group_members`
--     can read `group_members` without recursing into itself.
--   * `is_platform_admin()` grants group *metadata* visibility only. It never
--     grants series/chapter content — that stays with group membership and
--     series assignment.
--
-- Custom SQLSTATEs (5 chars, letter-prefixed) let the server actions map a
-- failure without parsing prose:
--   HF001 forbidden          HF002 not found        HF003 already member
--   HF004 already invited    HF005 invitee missing  HF006 invalid role
--   HF007 owner immutable    HF008 invite not pending
--   HF009 invite not yours   HF010 invalid name     HF011 invalid currency
--   HF012 not a member

set search_path = public, extensions;

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

create table public.groups (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,
  slug             text        not null,
  currency         char(3)     not null default 'USD',
  icon_path        text,
  retention_policy text        not null default 'purge_on_approval',
  created_by       uuid        references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint groups_name_length
    check (char_length(name) between 2 and 60),
  constraint groups_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint groups_currency_supported
    check (currency in ('USD','EUR','GBP','CAD','AUD','JPY','KRW')),
  constraint groups_retention_supported
    check (retention_policy in ('purge_on_approval','keep')),
  constraint groups_slug_key unique (slug)
);

comment on table public.groups is
  'Tenant boundary. Created only by the platform admin through create_group().';
comment on column public.groups.icon_path is
  'Object path inside the private group-icons bucket. Null falls back to a monogram.';

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

create table public.group_members (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references public.groups (id) on delete cascade,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  role       text        not null,
  invited_by uuid        references public.profiles (id) on delete set null,
  joined_at  timestamptz not null default now(),

  constraint group_members_role_supported
    check (role in ('owner','manager','staff')),
  constraint group_members_group_user_key
    unique (group_id, user_id)
);

comment on table public.group_members is
  'One row per accepted membership. The only place a group role lives.';

-- Defense in depth: the RPCs already demote before they promote, but a stray
-- UPDATE must never leave a group with two Owners.
create unique index group_members_one_owner
  on public.group_members (group_id)
  where role = 'owner';

create index group_members_user_idx
  on public.group_members (user_id);

create table public.group_invites (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references public.groups (id) on delete cascade,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  role       text        not null,
  status     text        not null default 'pending',
  invited_by uuid        references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint group_invites_role_supported
    check (role in ('manager','staff')),
  constraint group_invites_status_supported
    check (status in ('pending','accepted','revoked'))
);

comment on table public.group_invites is
  'Invite for an existing account. Accepting creates the group_members row.';

-- One live invite per person per group; an answered invite does not block a
-- later re-invite.
create unique index group_invites_pending_key
  on public.group_invites (group_id, user_id)
  where status = 'pending';

create index group_invites_user_idx
  on public.group_invites (user_id, status);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

-- Every helper is SECURITY DEFINER with an empty search_path:
--   * DEFINER lets a policy on group_members read group_members without
--     re-entering its own policy (Postgres aborts with "infinite recursion").
--   * Empty search_path forces fully qualified names, so a caller cannot
--     shadow `group_members` with a temp table and change the answer.
--   * `auth.uid()` is read from the request JWT; DEFINER does not change it.

create or replace function public.is_group_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members m
    where m.group_id = p_group
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_group_role(p_group uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members m
    where m.group_id = p_group
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

-- Co-member profile visibility. `profiles` stays self-read-only for everyone
-- else; this only unlocks people you already share a group with.
create or replace function public.shares_group_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them on them.group_id = me.group_id
    where me.user_id = (select auth.uid())
      and them.user_id = p_user
  );
$$;

-- An invitee is not a member yet, but the invite card still needs the group's
-- name and icon. This is the narrowest possible pre-membership read.
create or replace function public.has_pending_group_invite(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_invites i
    where i.group_id = p_group
      and i.user_id = (select auth.uid())
      and i.status = 'pending'
  );
$$;

-- Text variants for Storage policies. `storage.foldername()` yields text, and
-- casting it to uuid would raise on a malformed path instead of simply denying.
create or replace function public.group_role_for_path(p_group text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.group_members m
  where m.group_id::text = p_group
    and m.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.has_pending_group_invite_path(p_group text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_invites i
    where i.group_id::text = p_group
      and i.user_id = (select auth.uid())
      and i.status = 'pending'
  );
$$;

/* ------------------------------------------------------------------ */
/* Row level security                                                  */
/* ------------------------------------------------------------------ */

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;

-- Members see their groups; invitees see the group they were invited to; the
-- platform admin sees every group for the admin list. No INSERT/UPDATE/DELETE
-- policy exists on purpose — every write is an RPC.
create policy groups_select_visible
  on public.groups for select
  to authenticated
  using (
    public.is_group_member(id)
    or public.has_pending_group_invite(id)
    or public.is_platform_admin()
  );

create policy group_members_select_visible
  on public.group_members for select
  to authenticated
  using (
    public.is_group_member(group_id)
    or public.is_platform_admin()
  );

create policy group_invites_select_visible
  on public.group_invites for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_group_role(group_id, array['owner','manager'])
  );

/* ------------------------------------------------------------------ */
/* Grants                                                              */
/* ------------------------------------------------------------------ */

-- RLS filters rows; grants decide reachability. Both are required. Column-level
-- restrictions are unnecessary here because no write grant exists at all.
revoke all on table public.groups, public.group_members, public.group_invites
  from anon, authenticated;

grant select on table public.groups, public.group_members, public.group_invites
  to authenticated;

grant all on table public.groups, public.group_members, public.group_invites
  to service_role;

/* ------------------------------------------------------------------ */
/* RPCs                                                                */
/* ------------------------------------------------------------------ */

-- Platform admin creates a group and its first Owner in one transaction.
-- The slug is generated here, not in the client, so two tabs cannot pick the
-- same slug and the client never needs to read the whole group list first.
create or replace function public.create_group(
  p_name     text,
  p_currency text,
  p_owner_id uuid
)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name     text;
  v_base     text;
  v_slug     text;
  v_suffix   integer := 1;
  v_currency text;
  v_group    public.groups;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = 'HF001';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Only the platform admin can create groups.'
      using errcode = 'HF001';
  end if;

  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Group names must be 2 to 60 characters.'
      using errcode = 'HF010';
  end if;

  v_currency := upper(btrim(coalesce(p_currency, 'USD')));
  if v_currency not in ('USD','EUR','GBP','CAD','AUD','JPY','KRW') then
    raise exception 'Pick a supported currency.' using errcode = 'HF011';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_owner_id and p.is_active
  ) then
    raise exception 'No active account with that username.'
      using errcode = 'HF005';
  end if;

  -- ASCII slug: names with no Latin characters fall back to "group".
  v_base := left(
    btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-'),
    48
  );
  if v_base = '' then
    v_base := 'group';
  end if;

  v_slug := v_base;
  while exists (select 1 from public.groups g where g.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix;
  end loop;

  insert into public.groups (name, slug, currency, created_by)
  values (v_name, v_slug, v_currency, (select auth.uid()))
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role, invited_by)
  values (v_group.id, p_owner_id, 'owner', (select auth.uid()));

  return v_group;
end;
$$;

comment on function public.create_group(text, text, uuid) is
  'Platform admin only. Inserts the group and its Owner membership atomically.';

-- Icon upload happens after the row exists (the path needs the id), so this is
-- a second, narrow call rather than an oversized create_group signature.
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

  if p_path is not null
     and p_path not like 'group-icons/' || p_group_id::text || '/%' then
    raise exception 'That icon path does not belong to this group.'
      using errcode = 'HF012';
  end if;

  update public.groups set icon_path = p_path where id = p_group_id;
  if not found then
    raise exception 'That group no longer exists.' using errcode = 'HF002';
  end if;
end;
$$;

create or replace function public.invite_group_member(
  p_group_id uuid,
  p_user_id  uuid,
  p_role     text
)
returns public.group_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role   text;
  v_invite public.group_invites;
begin
  v_role := (
    select m.role
    from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = (select auth.uid())
  );

  if v_role is null or v_role not in ('owner','manager') then
    raise exception 'Only an Owner or Manager can invite members.'
      using errcode = 'HF001';
  end if;

  if p_role is null or p_role not in ('manager','staff') then
    raise exception 'Pick a valid role.' using errcode = 'HF006';
  end if;

  if v_role = 'manager' and p_role <> 'staff' then
    raise exception 'Managers can add Staff. Only the Owner promotes to Manager.'
      using errcode = 'HF001';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.is_active
  ) then
    raise exception 'No active account with that username.'
      using errcode = 'HF005';
  end if;

  if exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = p_user_id
  ) then
    raise exception 'That person is already a member of this group.'
      using errcode = 'HF003';
  end if;

  if exists (
    select 1 from public.group_invites i
    where i.group_id = p_group_id
      and i.user_id = p_user_id
      and i.status = 'pending'
  ) then
    raise exception 'There is already a pending invite for that username.'
      using errcode = 'HF004';
  end if;

  insert into public.group_invites (group_id, user_id, role, invited_by)
  values (p_group_id, p_user_id, p_role, (select auth.uid()))
  returning * into v_invite;

  return v_invite;
end;
$$;

create or replace function public.accept_group_invite(p_invite_id uuid)
returns public.group_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.group_invites;
  v_member public.group_members;
begin
  -- The status flip is the lock: only one caller can move pending -> accepted.
  update public.group_invites
     set status = 'accepted'
   where id = p_invite_id
     and user_id = (select auth.uid())
     and status = 'pending'
  returning * into v_invite;

  if v_invite.id is null then
    raise exception 'That invite is no longer available.'
      using errcode = 'HF002';
  end if;

  select * into v_member
  from public.group_members
  where group_id = v_invite.group_id
    and user_id = v_invite.user_id;

  if v_member.id is null then
    insert into public.group_members (group_id, user_id, role, invited_by)
    values (v_invite.group_id, v_invite.user_id, v_invite.role, v_invite.invited_by)
    returning * into v_member;
  end if;

  return v_member;
end;
$$;

create or replace function public.revoke_group_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.group_invites;
  v_role   text;
begin
  select * into v_invite
  from public.group_invites
  where id = p_invite_id;

  if v_invite.id is null then
    raise exception 'That invite no longer exists.' using errcode = 'HF002';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'That invite has already been answered.'
      using errcode = 'HF008';
  end if;

  v_role := (
    select m.role
    from public.group_members m
    where m.group_id = v_invite.group_id
      and m.user_id = (select auth.uid())
  );

  if v_role is null or v_role not in ('owner','manager') then
    raise exception 'Only an Owner or Manager can revoke invites.'
      using errcode = 'HF001';
  end if;

  if v_role = 'manager'
     and v_invite.invited_by is distinct from (select auth.uid()) then
    raise exception 'Managers can only revoke invites they sent.'
      using errcode = 'HF009';
  end if;

  update public.group_invites
     set status = 'revoked'
   where id = p_invite_id;
end;
$$;

-- The invitee's side of the same decision. Separate from revoke so the role
-- check never has to special-case "this is the person it was sent to".
create or replace function public.decline_group_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.group_invites
     set status = 'revoked'
   where id = p_invite_id
     and user_id = (select auth.uid())
     and status = 'pending';

  if not found then
    raise exception 'That invite is no longer available.'
      using errcode = 'HF002';
  end if;
end;
$$;

create or replace function public.change_group_member_role(
  p_group_id uuid,
  p_user_id  uuid,
  p_role     text
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
    raise exception 'Only the Owner can change roles.' using errcode = 'HF001';
  end if;

  if p_role is null or p_role not in ('manager','staff') then
    raise exception 'Pick Manager or Staff.' using errcode = 'HF006';
  end if;

  select m.role into v_target
  from public.group_members m
  where m.group_id = p_group_id and m.user_id = p_user_id;

  if v_target is null then
    raise exception 'That person is not a member.' using errcode = 'HF012';
  end if;

  if v_target = 'owner' then
    raise exception 'The Owner''s role can only change through a transfer.'
      using errcode = 'HF007';
  end if;

  if v_target = p_role then
    return;
  end if;

  update public.group_members
     set role = p_role
   where group_id = p_group_id and user_id = p_user_id;
end;
$$;

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

  -- Series assignments are cleared in Phase 2, when that table exists. A
  -- membership row cannot outlive the group, and no series exists yet.
  delete from public.group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.transfer_group_ownership(
  p_group_id      uuid,
  p_user_id       uuid,
  p_outgoing_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current uuid;
  v_target  text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only the platform admin can change a group''s Owner.'
      using errcode = 'HF001';
  end if;

  if p_outgoing_role is null or p_outgoing_role not in ('manager','staff') then
    raise exception 'Pick Manager or Staff.' using errcode = 'HF006';
  end if;

  select m.user_id into v_current
  from public.group_members m
  where m.group_id = p_group_id and m.role = 'owner';

  if v_current is null then
    raise exception 'This group has no Owner to transfer.' using errcode = 'HF002';
  end if;

  if v_current = p_user_id then
    return;
  end if;

  select m.role into v_target
  from public.group_members m
  where m.group_id = p_group_id and m.user_id = p_user_id;

  if v_target is null then
    raise exception 'That person is not a member.' using errcode = 'HF012';
  end if;

  -- Demote first: the partial unique index forbids two Owners even briefly.
  update public.group_members
     set role = p_outgoing_role
   where group_id = p_group_id and user_id = v_current;

  update public.group_members
     set role = 'owner'
   where group_id = p_group_id and user_id = p_user_id;
end;
$$;

/* ------------------------------------------------------------------ */
/* Function grants                                                     */
/* ------------------------------------------------------------------ */

revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.has_group_role(uuid, text[]) from public;
revoke all on function public.shares_group_with(uuid) from public;
revoke all on function public.has_pending_group_invite(uuid) from public;
revoke all on function public.group_role_for_path(text) from public;
revoke all on function public.has_pending_group_invite_path(text) from public;
revoke all on function public.create_group(text, text, uuid) from public;
revoke all on function public.set_group_icon(uuid, text) from public;
revoke all on function public.invite_group_member(uuid, uuid, text) from public;
revoke all on function public.accept_group_invite(uuid) from public;
revoke all on function public.revoke_group_invite(uuid) from public;
revoke all on function public.decline_group_invite(uuid) from public;
revoke all on function public.change_group_member_role(uuid, uuid, text) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.transfer_group_ownership(uuid, uuid, text) from public;

grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.has_group_role(uuid, text[]) to authenticated;
grant execute on function public.shares_group_with(uuid) to authenticated;
grant execute on function public.has_pending_group_invite(uuid) to authenticated;
grant execute on function public.group_role_for_path(text) to authenticated;
grant execute on function public.has_pending_group_invite_path(text) to authenticated;
grant execute on function public.create_group(text, text, uuid) to authenticated;
grant execute on function public.set_group_icon(uuid, text) to authenticated;
grant execute on function public.invite_group_member(uuid, uuid, text) to authenticated;
grant execute on function public.accept_group_invite(uuid) to authenticated;
grant execute on function public.revoke_group_invite(uuid) to authenticated;
grant execute on function public.decline_group_invite(uuid) to authenticated;
grant execute on function public.change_group_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid, text) to authenticated;
