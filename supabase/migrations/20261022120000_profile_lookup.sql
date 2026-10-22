-- Username directory helpers.
--
-- Two narrow SECURITY DEFINER functions instead of a broad "authenticated can
-- select all profiles" policy. `profiles` stays self-read-only (plus the
-- platform admin); the register form and the invite flow get exactly the two
-- facts they need and nothing else.
--
-- Why a function rather than RLS: an invite has to resolve a username the
-- caller does not yet share a group with - that is what inviting means. Any
-- policy broad enough to allow that would hand every signed-in user the entire
-- profile table. A function keeps the shape of the answer fixed: id, username,
-- display name. No email ever lives in profiles to leak in the first place.
--
-- Both functions run with `search_path = ''` and compare `p.username::text`
-- rather than relying on citext's `=` operator, which lives in `extensions`
-- and therefore is not resolvable with an empty search path.

set search_path = public, extensions;

/* ------------------------------------------------------------------ */
/* username_available()                                                */
/* ------------------------------------------------------------------ */

-- Callable while signed out: the register form checks availability as the
-- user types. It reveals existence only, which signup inherently does anyway.
create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles p
    where p.username::text = lower(btrim(candidate))
  );
$$;

comment on function public.username_available(text) is
  'True when no profile uses the username. Reveals existence only; safe for anon.';

revoke all on function public.username_available(text) from PUBLIC;
grant execute on function public.username_available(text) to anon, authenticated;

/* ------------------------------------------------------------------ */
/* profile_lookup()                                                    */
/* ------------------------------------------------------------------ */

-- Signed-in only. Backs the group-owner picker and the invite drawer.
-- `is_active` is filtered here so a deactivated account cannot be invited.
create or replace function public.profile_lookup(candidate text)
returns table (id uuid, username text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username::text, p.display_name
  from public.profiles p
  where p.username::text = lower(btrim(candidate))
    and p.is_active
  limit 1;
$$;

comment on function public.profile_lookup(text) is
  'Resolves one active profile for invite/ownership flows. Signed-in callers only.';

revoke all on function public.profile_lookup(text) from PUBLIC;
grant execute on function public.profile_lookup(text) to authenticated;
