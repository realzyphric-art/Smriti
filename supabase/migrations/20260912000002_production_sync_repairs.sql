-- Production repair migration for environments that received the feature tables
-- before the diagnostics, sync-status, and retry policies were applied.

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

create table if not exists public.patient_sync_status (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  last_synced_at timestamptz,
  last_synced_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.patient_sync_status enable row level security;
drop policy if exists "read patient sync status" on public.patient_sync_status;
create policy "read patient sync status" on public.patient_sync_status
  for select to authenticated using (private.can_access_patient(patient_id));
drop policy if exists "patient updates sync status" on public.patient_sync_status;
create policy "patient updates sync status" on public.patient_sync_status
  for all to authenticated
  using (exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()));

create or replace function public.touch_patient_sync(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.patients where id = p_patient_id and auth_user_id = auth.uid()) then
    raise exception 'Patient owner access required';
  end if;
  insert into public.patient_sync_status(patient_id, last_synced_at, last_synced_by, updated_at)
  values (p_patient_id, now(), auth.uid(), now())
  on conflict (patient_id) do update
    set last_synced_at = excluded.last_synced_at,
        last_synced_by = excluded.last_synced_by,
        updated_at = now();
end;
$$;

revoke all on function public.touch_patient_sync(uuid) from public;
grant execute on function public.touch_patient_sync(uuid) to authenticated;

-- The client uses upsert for retry-safe session and metric writes. These
-- owner-only update policies allow a failed retry to finish without allowing
-- caregivers to rewrite a patient's gameplay history.
drop policy if exists "patient updates game sessions" on public.game_sessions;
create policy "patient updates game sessions" on public.game_sessions
  for update to authenticated
  using (exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()));

drop policy if exists "patient updates game metrics" on public.game_metrics;
create policy "patient updates game metrics" on public.game_metrics
  for update to authenticated
  using (exists (
    select 1 from public.game_sessions s
    join public.patients p on p.id = s.patient_id
    where s.id = session_id and p.auth_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.game_sessions s
    join public.patients p on p.id = s.patient_id
    where s.id = session_id and p.auth_user_id = auth.uid()
  ));
