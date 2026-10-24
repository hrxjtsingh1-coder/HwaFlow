-- Two currencies, kept honest.
--
-- A group prices its work in `groups.currency`. A member reads every amount in
-- `profiles.display_currency`. The bridge is `fx_rates`, one row per currency
-- against USD, refreshed from Frankfurter (ECB data) by the server and never by
-- a browser.
--
-- Chapters already snapshot `rate_snapshot` when they are submitted. They now
-- also snapshot `rate_currency`, so an approved chapter stays worth what it was
-- worth when it was earned even after the group switches currency. Everything
-- still in flight converts with the group.

set search_path = public, extensions;

/* ------------------------------------------------------------------ */
/* Allowed currencies                                                  */
/* ------------------------------------------------------------------ */

-- Mirrors CURRENCIES in lib/money.ts. Zero-decimal currencies (JPY, KRW) are
-- formatted without cents, which is why the list is explicit instead of "any
-- ISO code".
create or replace function public.is_supported_currency(p_currency text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_currency in ('USD','EUR','GBP','CAD','AUD','JPY','KRW');
$$;

/* ------------------------------------------------------------------ */
/* profiles.display_currency                                           */
/* ------------------------------------------------------------------ */

alter table public.profiles
  add column if not exists display_currency char(3) not null default 'USD';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_display_currency_check'
  ) then
    alter table public.profiles
      add constraint profiles_display_currency_check
      check (public.is_supported_currency(btrim(display_currency)));
  end if;
end $$;

comment on column public.profiles.display_currency is
  'The currency this member reads amounts in. Independent of any group currency.';

-- Column-granted UPDATE: without the grant the field is unreachable, and with a
-- table-wide grant a member could flip is_platform_admin instead.
grant update (display_currency) on table public.profiles to authenticated;

/* ------------------------------------------------------------------ */
/* chapters.rate_currency                                              */
/* ------------------------------------------------------------------ */

alter table public.chapters
  add column if not exists rate_currency char(3);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chapters_rate_currency_check'
  ) then
    alter table public.chapters
      add constraint chapters_rate_currency_check
      check (rate_currency is null or public.is_supported_currency(btrim(rate_currency)));
  end if;
end $$;

comment on column public.chapters.rate_currency is
  'Currency rate_snapshot was taken in. Null means it predates the switch and follows the group.';

-- Existing snapshots were taken in the group's currency at the time.
update public.chapters c
   set rate_currency = btrim(g.currency)
  from public.series s
  join public.groups g on g.id = s.group_id
 where s.id = c.series_id
   and c.rate_snapshot is not null
   and c.rate_currency is null;

/* ------------------------------------------------------------------ */
/* fx_rates                                                            */
/* ------------------------------------------------------------------ */

create table if not exists public.fx_rates (
  currency   char(3) primary key check (public.is_supported_currency(btrim(currency))),
  per_usd    numeric(14,6) not null check (per_usd > 0),
  fetched_at timestamptz not null default now()
);

comment on table public.fx_rates is
  'Units of `currency` per 1 USD. Written only by the server from Frankfurter; read by authenticated users.';

alter table public.fx_rates enable row level security;

drop policy if exists "fx_rates read" on public.fx_rates;
create policy "fx_rates read" on public.fx_rates
  for select
  to authenticated
  using (true);

grant select on table public.fx_rates to authenticated;
grant all on table public.fx_rates to service_role;

-- USD is the base and always exactly 1; seeding it keeps every division safe.
insert into public.fx_rates (currency, per_usd)
values ('USD', 1)
on conflict (currency) do nothing;

/* ------------------------------------------------------------------ */
/* set_chapter_status: snapshot the currency too                       */
/* ------------------------------------------------------------------ */

create or replace function public.set_chapter_status(
  p_chapter_id uuid,
  p_next       text,
  p_note       text
)
returns public.chapters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chapter  public.chapters;
  v_group    uuid;
  v_rate     numeric(10,2);
  v_currency text;
  v_mode     text;
  v_actor    uuid := (select auth.uid());
  v_from     text;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_now      timestamptz := now();
begin
  select * into v_chapter
  from public.chapters
  where id = p_chapter_id
  for update;

  if v_chapter.id is null then
    raise exception 'That chapter no longer exists.' using errcode = 'HF002';
  end if;

  select s.group_id, s.rate_amount, btrim(g.currency)
    into v_group, v_rate, v_currency
  from public.series s
  join public.groups g on g.id = s.group_id
  where s.id = v_chapter.series_id;

  if p_next not in ('draft','processing','ready','submitted','approved','rejected') then
    raise exception 'That is not a chapter status.' using errcode = 'HF024';
  end if;

  v_from := v_chapter.status;

  v_mode := case
    when v_chapter.status = 'draft' and p_next = 'processing' then 'edit'
    when v_chapter.status = 'processing' and p_next in ('ready','draft') then 'edit'
    when v_chapter.status = 'ready' and p_next in ('submitted','processing') then 'edit'
    when v_chapter.status = 'submitted' and p_next in ('approved','rejected') then 'manage'
    when v_chapter.status = 'approved' and p_next = 'submitted' then 'manage'
    when v_chapter.status = 'rejected' and p_next in ('draft','submitted') then 'edit'
    else null
  end;

  if v_mode is null then
    raise exception 'A % chapter can''t move to %.',
      v_chapter.status, p_next using errcode = 'HF024';
  end if;

  if v_mode = 'manage' then
    if not public.has_group_role(v_group, array['owner','manager']) then
      raise exception 'Only an Owner or Manager can approve, reject or reopen a chapter.'
        using errcode = 'HF001';
    end if;
  elsif not public.can_edit_chapter(p_chapter_id) then
    raise exception 'You don''t have access to this chapter.' using errcode = 'HF001';
  end if;

  if p_next = 'submitted' then
    if not exists (
      select 1 from public.chapter_pages where chapter_id = p_chapter_id
    ) or not exists (
      select 1 from public.text_blocks
      where chapter_id = p_chapter_id and btrim(final_text) <> ''
    ) then
      raise exception 'Translate at least one panel before submitting.'
        using errcode = 'HF023';
    end if;
  end if;

  -- Reopening an approved chapter keeps the money it was earned at; a fresh
  -- submission takes the group's currency of that moment.
  if p_next = 'submitted' and not (v_chapter.status = 'approved' and v_chapter.rate_snapshot is not null) then
    v_chapter.rate_snapshot := round(coalesce(v_rate, 0), 2);
    v_chapter.rate_currency := v_currency;
  end if;

  if p_next = 'submitted' and v_chapter.status <> 'approved' then
    v_chapter.submitted_by := v_actor;
    v_chapter.submitted_at := v_now;
  end if;

  if p_next = 'submitted' then
    v_chapter.rejection_note := null;
  end if;

  if p_next = 'approved' then
    v_chapter.approved_by := v_actor;
    v_chapter.approved_at := v_now;
  end if;

  if p_next = 'rejected' then
    v_chapter.approved_by := null;
    v_chapter.approved_at := null;
    v_chapter.rejection_note := v_note;
  end if;

  if v_chapter.status = 'approved' and p_next <> 'approved' then
    v_chapter.approved_by := null;
    v_chapter.approved_at := null;
  end if;

  update public.chapters
     set status = p_next,
         rate_snapshot = v_chapter.rate_snapshot,
         rate_currency = v_chapter.rate_currency,
         submitted_by = v_chapter.submitted_by,
         submitted_at = v_chapter.submitted_at,
         approved_by = v_chapter.approved_by,
         approved_at = v_chapter.approved_at,
         rejection_note = v_chapter.rejection_note,
         updated_at = v_now
   where id = p_chapter_id
  returning * into v_chapter;

  insert into public.chapter_status_events (chapter_id, from_status, to_status, actor_id, note)
  values (p_chapter_id, v_from, p_next, v_actor, v_note);

  return v_chapter;
end;
$$;

/* ------------------------------------------------------------------ */
/* set_group_currency                                                  */
/* ------------------------------------------------------------------ */

-- Owner-only. Prices are converted here, not in the browser, so the factor
-- comes from the stored rates and cannot be supplied by the caller.
create or replace function public.set_group_currency(
  p_group_id uuid,
  p_currency text
)
returns table (converted_series int, converted_chapters int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_old      text;
  v_from     numeric(14,6);
  v_to       numeric(14,6);
  v_factor   numeric(14,6);
  v_series   int;
  v_chapters int;
begin
  if not public.is_supported_currency(v_currency) then
    raise exception 'That currency is not supported.' using errcode = 'HF025';
  end if;

  select btrim(g.currency) into v_old
  from public.groups g
  where g.id = p_group_id;

  if v_old is null then
    raise exception 'That group no longer exists.' using errcode = 'HF002';
  end if;

  if not public.has_group_role(p_group_id, array['owner']) then
    raise exception 'Only an Owner can change the group currency.' using errcode = 'HF001';
  end if;

  if v_old = v_currency then
    return query select 0, 0;
    return;
  end if;

  select r.per_usd into v_from from public.fx_rates r where btrim(r.currency) = v_old;
  select r.per_usd into v_to   from public.fx_rates r where btrim(r.currency) = v_currency;

  if v_from is null or v_to is null then
    raise exception 'Exchange rates are not available yet. Try again in a moment.'
      using errcode = 'HF027';
  end if;

  v_factor := v_to / v_from;

  with changed as (
    update public.series s
       set rate_amount = round(s.rate_amount * v_factor, 2)
     where s.group_id = p_group_id
    returning 1
  )
  select count(*)::int into v_series from changed;

  -- In-flight work follows the group. Approved work keeps what it was paid.
  with changed as (
    update public.chapters c
       set rate_snapshot = round(c.rate_snapshot * v_factor, 2),
           rate_currency = v_currency
      from public.series s
     where s.id = c.series_id
       and s.group_id = p_group_id
       and c.status <> 'approved'
       and c.rate_snapshot is not null
    returning 1
  )
  select count(*)::int into v_chapters from changed;

  update public.groups set currency = v_currency where id = p_group_id;

  return query select v_series, v_chapters;
end;
$$;

revoke all on function public.set_group_currency(uuid, text) from public;
grant execute on function public.set_group_currency(uuid, text) to authenticated;

/* ------------------------------------------------------------------ */
/* change_username                                                     */
/* ------------------------------------------------------------------ */

-- The username is the identity and the auth email is derived from it, so both
-- move together or not at all. Returns the stored (lowercased) username.
create or replace function public.change_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := (select auth.uid());
  v_new text := lower(btrim(coalesce(p_username, '')));
  v_old text;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = 'HF001';
  end if;

  if v_new !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Use 3-24 lowercase letters, numbers or underscores.'
      using errcode = 'HF025';
  end if;

  select p.username::text into v_old from public.profiles p where p.id = v_me;
  if v_old is null then
    raise exception 'Profile not found.' using errcode = 'HF002';
  end if;
  if v_new = v_old then
    return v_old;
  end if;

  -- 23505 from either statement means the name is taken; the action maps it.
  update public.profiles set username = v_new where id = v_me;
  update auth.users
     set email = v_new || '@users.internal',
         email_change = ''
   where id = v_me;

  return v_new;
end;
$$;

revoke all on function public.change_username(text) from public;
grant execute on function public.change_username(text) to authenticated;
