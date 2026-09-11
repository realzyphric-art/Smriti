-- Short-lived server-side proof that a password check preceded an OTP.
-- The browser receives only the random challenge id; raw email/IP values are
-- never stored in this table.
create table if not exists private.auth_otp_challenges (
  challenge_id uuid primary key,
  email_key text not null,
  flow text not null check (flow in ('signup', 'login')),
  ip_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz
);

create index if not exists auth_otp_challenges_expiry_idx
  on private.auth_otp_challenges (expires_at);

create or replace function public.create_auth_otp_challenge(
  p_challenge_id uuid,
  p_email_key text,
  p_flow text,
  p_ip_key text
)
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if p_flow not in ('signup', 'login') or length(p_email_key) < 32 or length(p_ip_key) < 32 then
    raise exception 'Invalid OTP challenge';
  end if;
  insert into private.auth_otp_challenges (challenge_id, email_key, flow, ip_key)
  values (p_challenge_id, p_email_key, p_flow, p_ip_key);
end;
$$;

create or replace function public.get_auth_otp_challenge(
  p_challenge_id uuid,
  p_email_key text,
  p_flow text
)
returns table (challenge_id uuid)
language sql
security definer
set search_path = private, public, pg_temp
as $$
  select c.challenge_id
  from private.auth_otp_challenges c
  where c.challenge_id = p_challenge_id
    and c.email_key = p_email_key
    and c.flow = p_flow
    and c.consumed_at is null
    and c.expires_at > now();
$$;

create or replace function public.consume_auth_otp_challenge(
  p_challenge_id uuid,
  p_email_key text,
  p_flow text
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  update private.auth_otp_challenges c
  set consumed_at = now()
  where c.challenge_id = p_challenge_id
    and c.email_key = p_email_key
    and c.flow = p_flow
    and c.consumed_at is null
    and c.expires_at > now();
  return found;
end;
$$;

revoke all on table private.auth_otp_challenges from public, anon, authenticated;
revoke all on function public.create_auth_otp_challenge(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.get_auth_otp_challenge(uuid, text, text) from public, anon, authenticated;
revoke all on function public.consume_auth_otp_challenge(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_auth_otp_challenge(uuid, text, text, text) to service_role;
grant execute on function public.get_auth_otp_challenge(uuid, text, text) to service_role;
grant execute on function public.consume_auth_otp_challenge(uuid, text, text) to service_role;
