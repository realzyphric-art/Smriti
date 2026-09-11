-- Ensure every email/password or OAuth signup receives its application profile.
-- Some existing projects were created from an older schema where this trigger
-- was never installed, leaving auth.users rows that the app cannot hydrate.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name, language, role_selected_at)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'requested_role' = 'caregiver'
      then 'caregiver'::public.app_role
      else 'patient'::public.app_role
    end,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.email, ''),
    case when new.raw_user_meta_data ->> 'language' in ('en', 'hi', 'as', 'bn')
      then new.raw_user_meta_data ->> 'language'
      else 'en'
    end,
    case when new.raw_user_meta_data ->> 'requested_role' in ('patient', 'caregiver')
      then now()
      else null
    end
  )
  on conflict (id) do nothing;

  if exists (select 1 from public.profiles where id = new.id and role = 'caregiver')
     and to_regclass('public.caregivers') is not null then
    execute 'insert into public.caregivers (id) values ($1) on conflict (id) do nothing'
      using new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

-- Backfill accounts created while the trigger was missing. Existing profiles
-- are preserved, and backfilled accounts still go through role selection.
insert into public.profiles (id, role, display_name, language, role_selected_at)
select
  u.id,
  case when u.raw_user_meta_data ->> 'requested_role' = 'caregiver'
    then 'caregiver'::public.app_role
    else 'patient'::public.app_role
  end,
  coalesce(u.raw_user_meta_data ->> 'display_name', u.raw_user_meta_data ->> 'full_name', u.email, ''),
  case when u.raw_user_meta_data ->> 'language' in ('en', 'hi', 'as', 'bn')
    then u.raw_user_meta_data ->> 'language'
    else 'en'
  end,
  case when u.raw_user_meta_data ->> 'requested_role' in ('patient', 'caregiver')
    then now()
    else null
  end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Older deployments also missed the role-selection RPC. Keep the argument as
-- text so it works with the original text-based profiles.role column.
drop function if exists public.select_my_app_role(text);
do $$
begin
  if to_regtype('public.app_role') is not null then
    execute 'drop function if exists public.select_my_app_role(public.app_role)';
  end if;
end;
$$;

create function public.select_my_app_role(selected_role text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_patient_id uuid;
  role_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if selected_role not in ('patient', 'caregiver') then raise exception 'Unsupported application role'; end if;

  select udt_name into role_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'role';

  if role_type = 'app_role' then
    execute 'update public.profiles set role = $1::public.app_role, role_selected_at = now() where id = auth.uid() and role_selected_at is null'
      using selected_role;
  else
    update public.profiles
    set role = selected_role, role_selected_at = now()
    where id = auth.uid() and role_selected_at is null;
  end if;
  if not found then raise exception 'Your application role has already been selected'; end if;

  if selected_role = 'patient' then
    select p.id into selected_patient_id
    from public.patients p
    where p.auth_user_id = auth.uid()
    order by p.created_at
    limit 1;
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

revoke all on function public.select_my_app_role(text) from public;
grant execute on function public.select_my_app_role(text) to authenticated;
