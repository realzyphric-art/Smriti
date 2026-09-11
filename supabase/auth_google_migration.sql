-- Apply this once to an existing MemoryCare Supabase project after schema.sql.
-- It preserves roles already chosen by existing users and enables the Google
-- OAuth first-sign-in flow for new users.

alter table public.profiles add column if not exists role_selected_at timestamptz;
-- Caregivers can manage more than one patient. RLS remains the authorization
-- boundary for every patient query and mutation.
alter table public.patients drop constraint if exists patients_auth_user_id_key;
alter table public.reminders alter column category set default 'custom'::public.reminder_category;
drop policy if exists "update own profile fields" on public.profiles;
update public.profiles
set role_selected_at = coalesce(role_selected_at, created_at, now())
where role_selected_at is null;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name, role_selected_at)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'requested_role' = 'caregiver' then 'caregiver'::public.app_role else 'patient'::public.app_role end,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.email, ''),
    case when new.raw_user_meta_data ->> 'requested_role' in ('patient', 'caregiver') then now() else null end
  ) on conflict (id) do nothing;
  if exists (select 1 from public.profiles where id = new.id and role = 'caregiver') then
    insert into public.caregivers (id) values (new.id) on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- Ensure both email/password and Google-created auth users receive an app
-- profile. Recreating the trigger is safe for existing projects.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop function if exists public.select_my_app_role(public.app_role);

create function public.select_my_app_role(selected_role public.app_role)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  selected_patient_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.profiles
  set role = selected_role, role_selected_at = now()
  where id = auth.uid() and role_selected_at is null;
  if not found then raise exception 'Your application role has already been selected'; end if;
  if selected_role = 'caregiver' then
    insert into public.caregivers (id) values (auth.uid()) on conflict (id) do nothing;
  else
    select p.id into selected_patient_id from public.patients p
    where p.auth_user_id = auth.uid() order by p.created_at limit 1;
    if selected_patient_id is null then
      insert into public.patients (auth_user_id, name)
      select auth.uid(), coalesce(nullif(trim(display_name), ''), 'My profile')
      from public.profiles where id = auth.uid()
      returning id into selected_patient_id;
    end if;
  end if;
  return selected_patient_id;
end;
$$;

revoke all on function public.select_my_app_role(public.app_role) from public;
grant execute on function public.select_my_app_role(public.app_role) to authenticated;
