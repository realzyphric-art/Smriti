-- Consent-based patient/caregiver sharing.
-- Caregivers request access; only the patient can approve or revoke it.

create or replace function private.can_access_patient(target_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1 from public.patients p
    where p.id = target_patient and p.auth_user_id = auth.uid()
  ) or exists (
    select 1
    from public.caregiver_patient cp
    join public.patients p on p.id = cp.patient_id
    where cp.patient_id = target_patient
      and cp.caregiver_id = auth.uid()
      and cp.status = 'active'
      and p.share_with_caregiver = true
  );
$$;

-- A pending link is the invitation. The caregiver never receives patient data
-- merely by creating it; all data policies use can_access_patient().
drop policy if exists "manage own caregiver links" on public.caregiver_patient;
drop policy if exists "participants manage caregiver links" on public.caregiver_patient;
drop policy if exists "read caregiver links" on public.caregiver_patient;
create policy "read caregiver links" on public.caregiver_patient
  for select to authenticated
  using (
    caregiver_id = (select auth.uid())
    or exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = (select auth.uid()))
  );

create or replace function public.request_caregiver_access(patient_identifier text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_patient uuid;
  normalized text := lower(trim(patient_identifier));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'caregiver') then
    raise exception 'Caregiver role required';
  end if;
  if normalized is null or normalized = '' then raise exception 'Enter the patient username'; end if;

  select p.id into target_patient
  from public.patients p
  join auth.users u on u.id = p.auth_user_id
  where p.auth_user_id <> auth.uid()
    and (
      lower(coalesce(u.raw_user_meta_data ->> 'username', '')) = normalized
      or lower(coalesce(u.email, '')) = normalized
      or lower(split_part(coalesce(u.email, ''), '@', 1)) = normalized
    )
  order by p.created_at
  limit 1;

  if target_patient is not null then
    insert into public.caregiver_patient (caregiver_id, patient_id, status, granted_by, updated_at)
    values (auth.uid(), target_patient, 'pending', null, now())
    on conflict (caregiver_id, patient_id) do update
      set status = 'pending', granted_by = null, updated_at = now();
  end if;

  -- Keep the response non-identifying; the caregiver only learns whether an
  -- invitation was sent, never whether an account exists.
  return true;
end;
$$;

create or replace function public.list_patient_caregiver_links()
returns table (
  caregiver_id uuid,
  patient_id uuid,
  caregiver_name text,
  patient_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select cp.caregiver_id, cp.patient_id,
    coalesce(nullif(c.display_name, ''), 'Caregiver') as caregiver_name,
    p.name as patient_name, cp.status::text, cp.created_at, cp.updated_at
  from public.caregiver_patient cp
  join public.patients p on p.id = cp.patient_id and p.auth_user_id = auth.uid()
  join public.profiles c on c.id = cp.caregiver_id;
$$;

create or replace function public.list_my_caregiver_links()
returns table (
  caregiver_id uuid,
  patient_id uuid,
  caregiver_name text,
  patient_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select cp.caregiver_id, cp.patient_id,
    coalesce(nullif(c.display_name, ''), 'Caregiver') as caregiver_name,
    p.name as patient_name, cp.status::text, cp.created_at, cp.updated_at
  from public.caregiver_patient cp
  join public.patients p on p.id = cp.patient_id
  join public.profiles c on c.id = cp.caregiver_id
  where cp.caregiver_id = auth.uid();
$$;

create or replace function public.approve_caregiver_invite(p_caregiver_id uuid, p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.patients where id = p_patient_id and auth_user_id = auth.uid() and share_with_caregiver) then
    raise exception 'Enable caregiver sharing before approving an invite';
  end if;
  update public.caregiver_patient
  set status = 'active', granted_by = auth.uid(), updated_at = now()
  where caregiver_id = p_caregiver_id and patient_id = p_patient_id and status = 'pending';
  if not found then raise exception 'That invitation is no longer pending'; end if;
end;
$$;

create or replace function public.revoke_caregiver_access(p_caregiver_id uuid, p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.patients where id = p_patient_id and auth_user_id = auth.uid()) then
    raise exception 'Patient owner access required';
  end if;
  update public.caregiver_patient
  set status = 'revoked', updated_at = now()
  where caregiver_id = p_caregiver_id and patient_id = p_patient_id;
end;
$$;

create or replace function public.set_patient_sharing(p_patient_id uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.patients set share_with_caregiver = enabled, updated_at = now()
  where id = p_patient_id and auth_user_id = auth.uid();
  if not found then raise exception 'Patient owner access required'; end if;
end;
$$;

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
  on conflict (patient_id) do update set last_synced_at = excluded.last_synced_at, last_synced_by = excluded.last_synced_by, updated_at = now();
end;
$$;

create unique index if not exists game_sessions_patient_client_idx
  on public.game_sessions(patient_id, client_id);

revoke all on function public.request_caregiver_access(text) from public;
revoke all on function public.list_patient_caregiver_links() from public;
revoke all on function public.list_my_caregiver_links() from public;
revoke all on function public.approve_caregiver_invite(uuid, uuid) from public;
revoke all on function public.revoke_caregiver_access(uuid, uuid) from public;
revoke all on function public.set_patient_sharing(uuid, boolean) from public;
revoke all on function public.touch_patient_sync(uuid) from public;
grant execute on function public.request_caregiver_access(text) to authenticated;
grant execute on function public.list_patient_caregiver_links() to authenticated;
grant execute on function public.list_my_caregiver_links() to authenticated;
grant execute on function public.approve_caregiver_invite(uuid, uuid) to authenticated;
grant execute on function public.revoke_caregiver_access(uuid, uuid) to authenticated;
grant execute on function public.set_patient_sharing(uuid, boolean) to authenticated;
grant execute on function public.touch_patient_sync(uuid) to authenticated;
