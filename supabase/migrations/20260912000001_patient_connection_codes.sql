-- Patient-owned connection codes.
-- A code only creates a pending invitation; the patient still approves access.

alter table public.patients
  add column if not exists caregiver_share_code text;

create unique index if not exists patients_caregiver_share_code_idx
  on public.patients (caregiver_share_code)
  where caregiver_share_code is not null;

create or replace function public.get_patient_share_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owned_patient_id uuid;
  existing_code text;
  next_code text;
begin
  select p.id, p.caregiver_share_code
    into owned_patient_id, existing_code
  from public.patients p
  where p.auth_user_id = auth.uid()
  order by p.created_at
  limit 1;

  if owned_patient_id is null then
    raise exception 'Patient owner access required';
  end if;
  if existing_code is not null then
    return existing_code;
  end if;

  loop
    next_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from public.patients p where p.caregiver_share_code = next_code
    );
  end loop;

  update public.patients
  set caregiver_share_code = next_code, updated_at = now()
  where id = owned_patient_id;
  return next_code;
end;
$$;

create or replace function public.request_caregiver_access_by_code(connection_code text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_patient uuid;
  normalized text := upper(trim(connection_code));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'caregiver') then
    raise exception 'Caregiver role required';
  end if;
  if normalized is null or normalized = '' then raise exception 'Enter the patient connection code'; end if;

  select p.id into target_patient
  from public.patients p
  where p.auth_user_id <> auth.uid()
    and upper(coalesce(p.caregiver_share_code, '')) = normalized
  limit 1;

  if target_patient is not null then
    insert into public.caregiver_patient (caregiver_id, patient_id, status, granted_by, updated_at)
    values (auth.uid(), target_patient, 'pending', null, now())
    on conflict (caregiver_id, patient_id) do update
      set status = 'pending', granted_by = null, updated_at = now();
  end if;

  -- Do not reveal whether a code exists before the patient approves it.
  return true;
end;
$$;

revoke all on function public.get_patient_share_code() from public;
revoke all on function public.request_caregiver_access_by_code(text) from public;
grant execute on function public.get_patient_share_code() to authenticated;
grant execute on function public.request_caregiver_access_by_code(text) to authenticated;
