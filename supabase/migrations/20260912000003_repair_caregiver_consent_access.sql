-- Keep caregiver reads behind both an active link and patient consent.
-- This repairs older deployments whose access helper only checked link status.

create or replace function private.can_access_patient(target_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.patients p
      where p.id = target_patient and p.auth_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.caregiver_patient cp
      join public.patients p on p.id = cp.patient_id
      where cp.patient_id = target_patient
        and cp.caregiver_id = auth.uid()
        and cp.status = 'active'
        and p.share_with_caregiver = true
    )
  );
$$;

revoke all on function private.can_access_patient(uuid) from public;
grant execute on function private.can_access_patient(uuid) to authenticated;
