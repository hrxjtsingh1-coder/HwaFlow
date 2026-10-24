-- Focus time: how long a member had HwaFlow open, per day.
--
-- The dashboard used to keep this in localStorage, which meant a second device
-- started at zero and clearing site data erased the week. One row per member
-- per day fixes both: reads are RLS-scoped to the owner, and every write goes
-- through `log_focus_time`, which validates the day and refuses anything bigger
-- than a single long tick.

set search_path = public, extensions;

create table if not exists public.focus_time (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  seconds    int  not null default 0 check (seconds >= 0 and seconds <= 86400),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists focus_time_day_idx on public.focus_time(day);

alter table public.focus_time enable row level security;

-- Each member reads only their own time. There is no admin surface for it.
drop policy if exists "focus_time read own" on public.focus_time;
create policy "focus_time read own" on public.focus_time
  for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy: the only writer is the function below.

create or replace function public.log_focus_time(p_day date, p_seconds int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
begin
  if auth.uid() is null then
    raise exception 'Sign in to log time.' using errcode = 'HF001';
  end if;

  -- A client tick is 30s. 600 gives room for a backlog after a long pause,
  -- while a stuck loop still cannot claim an hour in one call.
  if p_seconds is null or p_seconds <= 0 or p_seconds > 600 then
    raise exception 'Each log must be between 1 and 600 seconds.'
      using errcode = 'HF002';
  end if;

  -- A browser a day ahead of UTC is still the viewer's today, so allow ±1 day
  -- either side of the server date and nothing older than the visible week.
  if p_day > current_date + 1 or p_day < current_date - 8 then
    raise exception 'That day is outside the current week.' using errcode = 'HF002';
  end if;

  insert into public.focus_time (user_id, day, seconds)
  values (auth.uid(), p_day, p_seconds)
  on conflict (user_id, day) do update
    set seconds = least(public.focus_time.seconds + excluded.seconds, 86400),
        updated_at = now()
  returning seconds into v_total;

  return v_total;
end;
$$;

revoke all on function public.log_focus_time(date, int) from public;
grant execute on function public.log_focus_time(date, int) to authenticated;
