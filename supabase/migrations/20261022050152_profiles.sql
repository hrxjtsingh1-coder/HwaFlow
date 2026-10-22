-- profiles — the identity table everything else hangs off.
--
-- Mirrors `profiles` in docs/ARCHITECTURE.md §6, plus this migration carries
-- the two functions the RLS policies depend on (`is_platform_admin`,
-- `set_updated_at`) and the trigger that turns a Supabase Auth signup into a
-- profile row.
--
-- Assumed auth flow (ARCHITECTURE.md assumption #6): usernames are the real
-- identity and Supabase Auth's email-based signup is fed a synthetic address:
--
--   signUp({
--     email: `${username}@users.internal`,
--     password,
--     options: { data: { username, display_name } },
--   })
--
-- The metadata arrives in auth.users.raw_user_meta_data and the trigger below
-- copies it across. No email is stored on the profile: the synthetic address
-- is an implementation detail of the auth layer, never application data.
--
-- Deferred on purpose, not forgotten:
--   * Roster visibility (Owner/Manager reading every member's profile) and
--     invite-by-username lookup need `group_members`, so they land in the
--     groups migration as SECURITY DEFINER helpers rather than a broad
--     "everyone can read every profile" policy here.
--   * `is_active` is stored but not yet enforced in any policy. A deactivated
--     user holding a live session can still read until session enforcement
--     lands with the auth swap.

set search_path = public, extensions;

/* ------------------------------------------------------------------ */
/* Extensions                                                          */
/* ------------------------------------------------------------------ */

-- `citext` gives case-insensitive uniqueness to usernames, which is what
-- ARCHITECTURE.md §6 asks for. Installed into `extensions` rather than
-- `public` to keep the app schema free of extension objects; the
-- `set search_path` above makes the bare `citext` type name resolve.
create extension if not exists citext with schema extensions;

/* ------------------------------------------------------------------ */
/* profiles                                                            */
/* ------------------------------------------------------------------ */

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  username          citext      not null,
  display_name      text        not null,
  avatar_path       text,
  is_platform_admin boolean     not null default false,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Mirrors USERNAME_PATTERN in lib/auth.ts. citext already makes the unique
  -- index case-insensitive; the regex additionally rejects uppercase and
  -- punctuation so a stored username always matches what the UI renders.
  constraint profiles_username_key unique (username),
  constraint profiles_username_format
    check (username::text ~ '^[a-z0-9_]{3,24}$'),

  -- Mirrors validateDisplayName in lib/auth.ts.
  constraint profiles_display_name_length
    check (char_length(display_name) between 2 and 40)
);

comment on table public.profiles is
  'One row per auth user. Username is the real identity; the auth email is synthetic.';
comment on column public.profiles.is_platform_admin is
  'Platform-level admin. Replaces the hardcoded "noddy" username check in the preview build.';
comment on column public.profiles.is_active is
  'Admin deactivate/reactivate. Not yet enforced in RLS — see the header note.';

/* ------------------------------------------------------------------ */
/* updated_at                                                          */
/* ------------------------------------------------------------------ */

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/* signup -> profile                                                   */
/* ------------------------------------------------------------------ */

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta_username text;
  meta_display  text;
begin
  meta_username := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  meta_display  := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));

  if meta_username = '' then
    raise exception
      'signUp metadata is missing "username"; pass options.data.username'
      using errcode = '22023';
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    meta_username,
    -- The register form validates display_name, but a bare signUp call would
    -- otherwise violate profiles_display_name_length. Falling back to the
    -- username keeps the trigger honest without silently inventing a name.
    case when meta_display = '' then meta_username else meta_display end
  );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Copies username/display_name out of auth signup metadata into public.profiles. A duplicate username surfaces as unique violation 23505, which the register action maps to "username-taken".';

-- Some Supabase projects ship a template trigger with this name; drop first so
-- the migration is re-runnable against a project that has one.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* ------------------------------------------------------------------ */
/* is_platform_admin()                                                 */
/* ------------------------------------------------------------------ */

-- Every admin policy calls this. SECURITY DEFINER is the point: the function
-- runs as the table owner, which bypasses RLS, so a policy *on profiles* can
-- read profiles without recursion. Without it, evaluating the policy would
-- re-enter the policy and Postgres aborts with "infinite recursion detected".
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function public.is_platform_admin() is
  'True when the caller has profiles.is_platform_admin. SECURITY DEFINER to avoid recursive policy evaluation.';

/* ------------------------------------------------------------------ */
/* RLS                                                                 */
/* ------------------------------------------------------------------ */

alter table public.profiles enable row level security;

-- Read your own profile. `(select auth.uid())` is hoisted to an InitPlan and
-- evaluated once per query instead of once per row.
create policy profiles_select_self
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

-- The platform admin can read every profile (user list, deactivate/reactivate).
create policy profiles_select_admin
  on public.profiles for select
  to authenticated
  using (public.is_platform_admin());

-- Edit your own display name and avatar.
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT policy: rows are created only by handle_new_user(), which runs as
-- the definer and bypasses both RLS and grants. A client inserting a profile
-- directly is denied, which is what keeps `is_platform_admin` unforgeable.
--
-- No DELETE policy either: profiles go away by cascading from auth.users.

/* ------------------------------------------------------------------ */
/* Grants                                                              */
/* ------------------------------------------------------------------ */

-- RLS filters rows; grants decide whether the table is reachable at all, and
-- Postgres checks grants first. Both are needed.
--
-- The column-level UPDATE grant is a security boundary, not tidiness: RLS
-- cannot restrict *which columns* an UPDATE touches, so without it a signed-in
-- user could set is_platform_admin = true on their own row and pass every
-- admin policy afterwards. Column grants close that hole.
revoke all on table public.profiles from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_path) on table public.profiles to authenticated;

-- service_role bypasses RLS but still needs the table grant. Admin deactivation
-- and other back-office writes go through the secret-key client for this reason.
grant all on table public.profiles to service_role;
