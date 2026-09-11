-- Server-enforced, privacy-preserving counters for the public auth-otp Edge Function.
-- Keys are SHA-256 digests generated in the function; raw email addresses and IPs
-- are never stored here.
create schema if not exists private;

create table if not exists private.auth_rate_limits (
  subject_key text not null,
  action text not null,
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (subject_key, action)
);

create or replace function public.consume_auth_rate_limit(
  subject_key text,
  action_name text,
  max_attempts integer,
  window_seconds integer,
  lock_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  limit_row private.auth_rate_limits%rowtype;
begin
  if length(subject_key) < 32 or max_attempts < 1 or window_seconds < 1 or lock_seconds < 1 then
    raise exception 'Invalid rate limit request';
  end if;

  insert into private.auth_rate_limits (subject_key, action, attempts)
  values (subject_key, action_name, 0)
  on conflict (subject_key, action) do nothing;

  select * into limit_row
  from private.auth_rate_limits
  where private.auth_rate_limits.subject_key = consume_auth_rate_limit.subject_key
    and private.auth_rate_limits.action = consume_auth_rate_limit.action_name
  for update;

  if limit_row.locked_until is not null and limit_row.locked_until > now() then
    return false;
  end if;

  if limit_row.window_started_at <= now() - make_interval(secs => window_seconds) then
    update private.auth_rate_limits
    set attempts = 1, window_started_at = now(), locked_until = null, updated_at = now()
    where private.auth_rate_limits.subject_key = consume_auth_rate_limit.subject_key
      and private.auth_rate_limits.action = consume_auth_rate_limit.action_name;
    return true;
  end if;

  if limit_row.attempts >= max_attempts then
    update private.auth_rate_limits
    set attempts = attempts + 1, locked_until = now() + make_interval(secs => lock_seconds), updated_at = now()
    where private.auth_rate_limits.subject_key = consume_auth_rate_limit.subject_key
      and private.auth_rate_limits.action = consume_auth_rate_limit.action_name;
    return false;
  end if;

  update private.auth_rate_limits
  set attempts = attempts + 1, updated_at = now()
  where private.auth_rate_limits.subject_key = consume_auth_rate_limit.subject_key
    and private.auth_rate_limits.action = consume_auth_rate_limit.action_name;
  return true;
end;
$$;

revoke all on table private.auth_rate_limits from public, anon, authenticated;
revoke all on function public.consume_auth_rate_limit(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text, text, integer, integer, integer) to service_role;
