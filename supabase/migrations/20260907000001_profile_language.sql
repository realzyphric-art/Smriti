-- Persist each authenticated user's chosen UI/speech language without allowing
-- clients to edit other profile fields.
create or replace function public.set_my_language(selected_language text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if selected_language not in ('en', 'hi', 'as', 'bn') then
    raise exception 'Unsupported language';
  end if;
  update public.profiles set language = selected_language, updated_at = now() where id = auth.uid();
end;
$$;

revoke all on function public.set_my_language(text) from public;
grant execute on function public.set_my_language(text) to authenticated;

-- New accounts receive the language selected before signup.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name, language, role_selected_at)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'requested_role' = 'caregiver' then 'caregiver'::public.app_role else 'patient'::public.app_role end,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.email, ''),
    case when new.raw_user_meta_data ->> 'language' in ('en', 'hi', 'as', 'bn') then new.raw_user_meta_data ->> 'language' else 'en' end,
    case when new.raw_user_meta_data ->> 'requested_role' in ('patient', 'caregiver') then now() else null end
  )
  on conflict (id) do nothing;
  if exists (select 1 from public.profiles where id = new.id and role = 'caregiver') then
    insert into public.caregivers (id) values (new.id) on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
