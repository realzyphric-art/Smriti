-- Fix the original rate-limit function's parameter/column ambiguity.
-- PostgreSQL cannot resolve values such as subject_key when the function
-- parameter has the same name as the target table column.
drop function if exists public.consume_auth_rate_limit(text, text, integer, integer, integer);

create or replace function public.consume_auth_rate_limit(
  p_subject_key text,
  p_action_name text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_lock_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  limit_row private.auth_rate_limits%rowtype;
begin
  if length(p_subject_key) < 32 or p_max_attempts < 1 or p_window_seconds < 1 or p_lock_seconds < 1 then
    raise exception 'Invalid rate limit request';
  end if;

  insert into private.auth_rate_limits (subject_key, action, attempts)
  values (p_subject_key, p_action_name, 0)
  on conflict (subject_key, action) do nothing;

  select * into limit_row
  from private.auth_rate_limits
  where private.auth_rate_limits.subject_key = p_subject_key
    and private.auth_rate_limits.action = p_action_name
  for update;

  if limit_row.locked_until is not null and limit_row.locked_until > now() then
    return false;
  end if;

  if limit_row.window_started_at <= now() - make_interval(secs => p_window_seconds) then
    update private.auth_rate_limits
    set attempts = 1, window_started_at = now(), locked_until = null, updated_at = now()
    where private.auth_rate_limits.subject_key = p_subject_key
      and private.auth_rate_limits.action = p_action_name;
    return true;
  end if;

  if limit_row.attempts >= p_max_attempts then
    update private.auth_rate_limits
    set attempts = attempts + 1, locked_until = now() + make_interval(secs => p_lock_seconds), updated_at = now()
    where private.auth_rate_limits.subject_key = p_subject_key
      and private.auth_rate_limits.action = p_action_name;
    return false;
  end if;

  update private.auth_rate_limits
  set attempts = attempts + 1, updated_at = now()
  where private.auth_rate_limits.subject_key = p_subject_key
    and private.auth_rate_limits.action = p_action_name;
  return true;
end;
$$;

revoke all on function public.consume_auth_rate_limit(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text, text, integer, integer, integer) to service_role;
