-- Central production diagnostics. Events are write-only for normal users and
-- readable only by explicitly provisioned system administrators.
create schema if not exists private;

create table if not exists private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

revoke all on table private.admin_users from public, anon, authenticated;

create or replace function private.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select auth.uid() is not null
    and exists (select 1 from private.admin_users where user_id = auth.uid());
$$;

revoke all on function private.is_system_admin() from public, anon, authenticated;
grant execute on function private.is_system_admin() to authenticated;

create or replace function public.is_my_system_admin()
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select private.is_system_admin();
$$;

revoke all on function public.is_my_system_admin() from public, anon;
grant execute on function public.is_my_system_admin() to authenticated;

create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  severity text not null check (severity in ('debug', 'info', 'warning', 'error', 'critical')),
  event_type text not null check (length(event_type) between 1 and 80),
  feature text not null default 'unknown' check (length(feature) between 1 and 80),
  route text,
  action text,
  message text not null check (length(message) between 1 and 1000),
  error_code text,
  http_status integer check (http_status is null or http_status between 100 and 599),
  stack_trace text,
  request_id text,
  user_id uuid references auth.users(id) on delete set null,
  session_state text,
  device text,
  browser text,
  os text,
  app_version text,
  environment text not null default 'unknown',
  fingerprint text not null check (length(fingerprint) between 1 and 160),
  metadata jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists system_events_created_at_idx on public.system_events (created_at desc);
create index if not exists system_events_severity_idx on public.system_events (severity, created_at desc);
create index if not exists system_events_event_type_idx on public.system_events (event_type, created_at desc);
create index if not exists system_events_feature_idx on public.system_events (feature, created_at desc);
create index if not exists system_events_user_id_idx on public.system_events (user_id, created_at desc);
create index if not exists system_events_resolved_idx on public.system_events (resolved, created_at desc);
create index if not exists system_events_request_id_idx on public.system_events (request_id);
create index if not exists system_events_fingerprint_idx on public.system_events (fingerprint, created_at desc);

alter table public.system_events enable row level security;

revoke all on table public.system_events from public;
grant insert on table public.system_events to anon, authenticated;
grant insert on table public.system_events to service_role;
grant select, update on table public.system_events to authenticated;

drop policy if exists "diagnostics can be submitted" on public.system_events;
create policy "diagnostics can be submitted" on public.system_events
  for insert to anon, authenticated
  with check (
    resolved = false
    and resolved_at is null
    and resolved_by is null
    and (user_id is null or user_id = auth.uid())
  );

drop policy if exists "system admins can read diagnostics" on public.system_events;
create policy "system admins can read diagnostics" on public.system_events
  for select to authenticated
  using (private.is_system_admin());

drop policy if exists "system admins can resolve diagnostics" on public.system_events;
create policy "system admins can resolve diagnostics" on public.system_events
  for update to authenticated
  using (private.is_system_admin())
  with check (private.is_system_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.system_events;
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;

-- After creating an account, provision an administrator explicitly with:
-- insert into private.admin_users (user_id) values ('<auth-user-uuid>');
