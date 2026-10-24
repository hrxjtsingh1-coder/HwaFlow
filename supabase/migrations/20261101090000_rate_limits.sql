-- Fixed-window rate limiting shared by the auth actions and the pipeline routes.
--
-- Serverless functions do not share memory, so an in-process counter would be
-- per-instance and useless. Postgres is already a dependency of every request,
-- so the counter lives here. The window is aligned to the epoch, which keeps
-- the key small and makes `retry_after` exact instead of an estimate.

create table if not exists public.rate_limits (
  bucket        text        not null,
  subject       text        not null,
  window_start  timestamptz not null,
  hits          integer     not null default 0,
  primary key (bucket, subject, window_start)
);

alter table public.rate_limits enable row level security;

-- No policies on purpose: only the SECURITY DEFINER function below may touch
-- this table, and it is the only code that should be able to.

create or replace function public.rate_limit_hit(
  p_bucket         text,
  p_subject        text,
  p_window_seconds integer,
  p_limit          integer
)
returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_hits  integer;
begin
  if p_window_seconds < 1 or p_limit < 1 then
    raise exception 'rate_limit_hit: window and limit must be positive';
  end if;

  v_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits as rl (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, v_start, 1)
  on conflict (bucket, subject, window_start)
    do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  -- Self-cleaning: anything older than an hour cannot affect any window we use.
  delete from public.rate_limits where window_start < now() - interval '1 hour';

  allowed := v_hits <= p_limit;
  remaining := greatest(p_limit - v_hits, 0);
  retry_after := greatest(
    ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - now())))::integer,
    1
  );
  return next;
end;
$$;

revoke all on function public.rate_limit_hit(text, text, integer, integer) from public;
grant execute on function public.rate_limit_hit(text, text, integer, integer)
  to anon, authenticated;
