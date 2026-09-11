-- Restore the caregiver link RPCs used by Settings and the caregiver dashboard.

create or replace function public.list_patient_caregiver_links()
returns table (caregiver_id uuid, patient_id uuid, caregiver_name text, patient_name text, status text, created_at timestamptz, updated_at timestamptz)
language sql security definer set search_path = public, pg_temp
as $$
  select cp.caregiver_id, cp.patient_id, coalesce(nullif(c.display_name, ''), 'Caregiver'), p.name, cp.status::text, cp.created_at, cp.updated_at
  from public.caregiver_patient cp
  join public.patients p on p.id = cp.patient_id and p.auth_user_id = auth.uid()
  join public.profiles c on c.id = cp.caregiver_id;
$$;

create or replace function public.list_my_caregiver_links()
returns table (caregiver_id uuid, patient_id uuid, caregiver_name text, patient_name text, status text, created_at timestamptz, updated_at timestamptz)
language sql security definer set search_path = public, pg_temp
as $$
  select cp.caregiver_id, cp.patient_id, coalesce(nullif(c.display_name, ''), 'Caregiver'), p.name, cp.status::text, cp.created_at, cp.updated_at
  from public.caregiver_patient cp
  join public.patients p on p.id = cp.patient_id
  join public.profiles c on c.id = cp.caregiver_id
  where cp.caregiver_id = auth.uid();
$$;

create or replace function public.approve_caregiver_invite(p_caregiver_id uuid, p_patient_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.patients where id = p_patient_id and auth_user_id = auth.uid() and share_with_caregiver) then raise exception 'Enable caregiver sharing before approving an invite'; end if;
  update public.caregiver_patient set status = 'active', granted_by = auth.uid(), updated_at = now() where caregiver_id = p_caregiver_id and patient_id = p_patient_id and status = 'pending';
  if not found then raise exception 'That invitation is no longer pending'; end if;
end;
$$;

create or replace function public.revoke_caregiver_access(p_caregiver_id uuid, p_patient_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.patients where id = p_patient_id and auth_user_id = auth.uid()) then raise exception 'Patient owner access required'; end if;
  update public.caregiver_patient set status = 'revoked', updated_at = now() where caregiver_id = p_caregiver_id and patient_id = p_patient_id;
end;
$$;

create or replace function public.set_patient_sharing(p_patient_id uuid, enabled boolean)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.patients set share_with_caregiver = enabled, updated_at = now() where id = p_patient_id and auth_user_id = auth.uid();
  if not found then raise exception 'Patient owner access required'; end if;
end;
$$;

revoke all on function public.list_patient_caregiver_links() from public;
revoke all on function public.list_my_caregiver_links() from public;
revoke all on function public.approve_caregiver_invite(uuid, uuid) from public;
revoke all on function public.revoke_caregiver_access(uuid, uuid) from public;
revoke all on function public.set_patient_sharing(uuid, boolean) from public;
grant execute on function public.list_patient_caregiver_links() to authenticated;
grant execute on function public.list_my_caregiver_links() to authenticated;
grant execute on function public.approve_caregiver_invite(uuid, uuid) to authenticated;
grant execute on function public.revoke_caregiver_access(uuid, uuid) to authenticated;
grant execute on function public.set_patient_sharing(uuid, boolean) to authenticated;
