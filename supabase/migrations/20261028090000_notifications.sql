-- Recipient-scoped notifications. Rows are only ever created by SECURITY DEFINER
-- code (the assignment trigger below); a recipient can read their own rows and
-- flip `read`.

set search_path = public, extensions;

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null,
  href       text,
  tone       text not null default 'mint'
               check (tone in ('mint','lavender','peach','sky')),
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read) on table public.notifications to authenticated;

-- No INSERT policy: rows come from the trigger / definer functions only.

/* ------------------------------------------------------------------ */
/* Assignment notifications                                            */
/* ------------------------------------------------------------------ */

create or replace function public.notify_series_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_group text;
begin
  -- Assigning yourself is not news.
  if NEW.assigned_by is not null and NEW.assigned_by = NEW.user_id then
    return NEW;
  end if;

  select s.title, g.name
    into v_title, v_group
  from public.series s
  join public.groups g on g.id = s.group_id
  where s.id = NEW.series_id;

  if v_title is null then return NEW; end if;

  insert into public.notifications (user_id, kind, title, body, href, tone)
  values (
    NEW.user_id,
    'series-assigned',
    'New series assignment',
    format('You were assigned to "%s" in %s.', v_title, v_group),
    '/series/' || NEW.series_id::text,
    'lavender'
  );

  return NEW;
end;
$$;

drop trigger if exists series_assignments_notify on public.series_assignments;
create trigger series_assignments_notify
  after insert on public.series_assignments
  for each row
  execute function public.notify_series_assignee();

/* ------------------------------------------------------------------ */
/* Privileges                                                          */
/* ------------------------------------------------------------------ */

revoke all on function public.notify_series_assignee() from public;
