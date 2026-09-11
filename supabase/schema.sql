-- MemoryCare foundation schema for Supabase.
-- Apply this file in the Supabase SQL editor or as a migration.

create extension if not exists pgcrypto;

create type public.app_role as enum ('patient', 'caregiver');
create type public.access_status as enum ('pending', 'active', 'revoked');
create type public.person_relationship as enum ('family', 'friend', 'caregiver', 'clinician', 'other');
create type public.mood_type as enum ('happy', 'calm', 'neutral', 'sad', 'worried');
create type public.reminder_category as enum ('medicine', 'meal', 'water', 'appointment', 'exercise', 'game', 'custom');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  display_name text not null default '',
  language text not null default 'en',
  avatar_path text,
  role_selected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  -- A caregiver may manage multiple patient rows. RLS still limits access to
  -- the owning auth.uid() or an active caregiver_patient link.
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  profile_photo_path text,
  date_of_birth date,
  notes text,
  share_with_caregiver boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.caregivers (
  id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  created_at timestamptz not null default now()
);

create table public.caregiver_patient (
  caregiver_id uuid not null references public.caregivers(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  status public.access_status not null default 'pending',
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (caregiver_id, patient_id)
);

create table public.person_memories (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  relationship public.person_relationship not null default 'other',
  nickname text,
  photo_path text,
  photo_paths text[] not null default '{}',
  notes text,
  voice_recording_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  game_type text not null,
  category text not null check (category in ('Memory', 'Attention', 'Sequence', 'Reasoning', 'Daily Routine')),
  level smallint not null check (level between 1 and 5),
  score smallint not null check (score between 0 and 100),
  accuracy smallint not null check (accuracy between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  mistakes integer not null default 0 check (mistakes >= 0),
  response_time_ms integer not null default 0 check (response_time_ms >= 0),
  completed boolean not null default false,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  played_at timestamptz not null default now(),
  client_id text,
  created_at timestamptz not null default now()
);

create table public.game_metrics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  metric_name text not null,
  metric_value numeric not null,
  metric_text text,
  created_at timestamptz not null default now(),
  unique (session_id, metric_name)
);

create table public.adaptive_difficulty_history (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  game_type text not null,
  previous_level smallint not null check (previous_level between 1 and 5),
  new_level smallint not null check (new_level between 1 and 5),
  score smallint not null check (score between 0 and 100),
  response_time_ms integer not null default 0,
  consistency_score smallint not null default 0 check (consistency_score between 0 and 100),
  created_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  title text not null,
  detail text not null default '',
  icon text not null default '🔔',
  time_local time not null,
  category public.reminder_category not null default 'custom',
  recurring boolean not null default false,
  repeat_days smallint[] not null default '{}',
  enabled boolean not null default true,
  scheduled_date date,
  assigned_person_id uuid references public.person_memories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminder_completions (
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  completed_on date not null,
  completed_at timestamptz not null default now(),
  primary key (reminder_id, completed_on)
);

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  person_id uuid references public.person_memories(id) on delete set null,
  name text not null,
  phone text not null,
  priority smallint not null default 1 check (priority > 0),
  created_at timestamptz not null default now()
);

create table public.patient_emergency_info (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  blood_group text,
  allergies text,
  medical_notes text,
  doctor_name text,
  doctor_phone text,
  emergency_number text,
  emergency_notes text,
  updated_at timestamptz not null default now()
);

-- Future AI job storage. Provider calls remain server-side and are not used by
-- the current frontend until an AI adapter is explicitly connected.
create table public.ai_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  source_type text not null check (source_type in ('video', 'progress')),
  source_reference text,
  provider text not null,
  model text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  request_id text not null,
  retry_count smallint not null default 0 check (retry_count >= 0),
  error_code text,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table public.ai_analysis_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.ai_analysis_jobs(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  provider text not null,
  model text,
  summary text,
  metrics jsonb not null default '{}'::jsonb,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index caregiver_patient_patient_idx on public.caregiver_patient(patient_id, status);
create index person_memories_patient_idx on public.person_memories(patient_id, created_at desc);
create index game_sessions_patient_played_idx on public.game_sessions(patient_id, played_at desc);
create index game_sessions_patient_type_played_idx on public.game_sessions(patient_id, game_type, played_at desc);
create index game_metrics_session_idx on public.game_metrics(session_id);
create index difficulty_history_patient_game_idx on public.adaptive_difficulty_history(patient_id, game_type, created_at desc);
create index reminders_patient_idx on public.reminders(patient_id);
create index reminders_patient_enabled_time_idx on public.reminders(patient_id, time_local) where enabled = true;
create index emergency_contacts_patient_idx on public.emergency_contacts(patient_id, priority);
create index ai_analysis_jobs_patient_created_idx on public.ai_analysis_jobs(patient_id, created_at desc);
create index ai_analysis_jobs_status_created_idx on public.ai_analysis_jobs(status, created_at desc);
create index ai_analysis_results_patient_created_idx on public.ai_analysis_results(patient_id, created_at desc);

-- Keep authorization helpers outside the exposed public schema. These helpers
-- are only called by RLS policies and always require an authenticated caller.
create schema if not exists private;

-- Hashed email/IP counters used only by the auth-otp Edge Function.  The
-- matching standalone migration makes this available to existing projects.
create table if not exists private.auth_rate_limits (
  subject_key text not null,
  action text not null,
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (subject_key, action)
);

drop function if exists public.consume_auth_rate_limit(text, text, integer, integer, integer);
create or replace function public.consume_auth_rate_limit(p_subject_key text, p_action_name text, p_max_attempts integer, p_window_seconds integer, p_lock_seconds integer)
returns boolean language plpgsql security definer set search_path = private, public, pg_temp
as $$
declare limit_row private.auth_rate_limits%rowtype;
begin
  if length(p_subject_key) < 32 or p_max_attempts < 1 or p_window_seconds < 1 or p_lock_seconds < 1 then raise exception 'Invalid rate limit request'; end if;
  insert into private.auth_rate_limits (subject_key, action, attempts) values (p_subject_key, p_action_name, 0) on conflict (subject_key, action) do nothing;
  select * into limit_row from private.auth_rate_limits where private.auth_rate_limits.subject_key = p_subject_key and private.auth_rate_limits.action = p_action_name for update;
  if limit_row.locked_until is not null and limit_row.locked_until > now() then return false; end if;
  if limit_row.window_started_at <= now() - make_interval(secs => p_window_seconds) then
    update private.auth_rate_limits set attempts = 1, window_started_at = now(), locked_until = null, updated_at = now() where private.auth_rate_limits.subject_key = p_subject_key and private.auth_rate_limits.action = p_action_name;
    return true;
  end if;
  if limit_row.attempts >= p_max_attempts then
    update private.auth_rate_limits set attempts = attempts + 1, locked_until = now() + make_interval(secs => p_lock_seconds), updated_at = now() where private.auth_rate_limits.subject_key = p_subject_key and private.auth_rate_limits.action = p_action_name;
    return false;
  end if;
  update private.auth_rate_limits set attempts = attempts + 1, updated_at = now() where private.auth_rate_limits.subject_key = p_subject_key and private.auth_rate_limits.action = p_action_name;
  return true;
end;
$$;
revoke all on table private.auth_rate_limits from public, anon, authenticated;
revoke all on function public.consume_auth_rate_limit(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text, text, integer, integer, integer) to service_role;

-- Short-lived server-side proof that a password check preceded an OTP.
create table if not exists private.auth_otp_challenges (
  challenge_id uuid primary key,
  email_key text not null,
  flow text not null check (flow in ('signup', 'login')),
  ip_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz
);
create index if not exists auth_otp_challenges_expiry_idx on private.auth_otp_challenges (expires_at);

create or replace function public.create_auth_otp_challenge(p_challenge_id uuid, p_email_key text, p_flow text, p_ip_key text)
returns void language plpgsql security definer set search_path = private, public, pg_temp
as $$
begin
  if p_flow not in ('signup', 'login') or length(p_email_key) < 32 or length(p_ip_key) < 32 then raise exception 'Invalid OTP challenge'; end if;
  insert into private.auth_otp_challenges (challenge_id, email_key, flow, ip_key) values (p_challenge_id, p_email_key, p_flow, p_ip_key);
end;
$$;

create or replace function public.get_auth_otp_challenge(p_challenge_id uuid, p_email_key text, p_flow text)
returns table (challenge_id uuid) language sql security definer set search_path = private, public, pg_temp
as $$
  select c.challenge_id from private.auth_otp_challenges c where c.challenge_id = p_challenge_id and c.email_key = p_email_key and c.flow = p_flow and c.consumed_at is null and c.expires_at > now();
$$;

create or replace function public.consume_auth_otp_challenge(p_challenge_id uuid, p_email_key text, p_flow text)
returns boolean language plpgsql security definer set search_path = private, public, pg_temp
as $$
begin
  update private.auth_otp_challenges c set consumed_at = now() where c.challenge_id = p_challenge_id and c.email_key = p_email_key and c.flow = p_flow and c.consumed_at is null and c.expires_at > now();
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
create or replace function private.can_access_patient(target_patient uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.patients p where p.id = target_patient and p.auth_user_id = auth.uid())
    or exists (
      select 1 from public.caregiver_patient cp
      where cp.patient_id = target_patient and cp.caregiver_id = auth.uid() and cp.status = 'active'
    )
  );
$$;
revoke all on function private.can_access_patient(uuid) from public;
grant execute on function private.can_access_patient(uuid) to authenticated;

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
revoke all on function private.handle_new_user() from public;

-- A first-time OAuth user may choose their application role. This function can
-- only ever modify auth.uid(); patient access still requires an active
-- caregiver_patient relationship and is protected by RLS.
create or replace function public.select_my_app_role(selected_role public.app_role)
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

create or replace function public.set_my_language(selected_language text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if selected_language not in ('en', 'hi', 'as', 'bn') then raise exception 'Unsupported language'; end if;
  update public.profiles set language = selected_language, updated_at = now() where id = auth.uid();
end;
$$;
revoke all on function public.set_my_language(text) from public;
grant execute on function public.set_my_language(text) to authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

-- Storage buckets. Files must use a patient-id prefix: <patient-id>/people/...
insert into storage.buckets (id, name, public)
values ('patient-media', 'patient-media', false)
on conflict (id) do nothing;

insert into public.games (slug, name, description) values
  ('picture-pairs', 'Picture Pairs', 'Match familiar pictures'),
  ('follow-the-sequence', 'Follow the Sequence', 'Repeat the displayed sequence'),
  ('daily-routine-ordering', 'Daily Routine Ordering', 'Put daily activities in order'),
  ('who-is-this-person', 'Who Is This Person?', 'Recognize a familiar person')
on conflict (slug) do update set name = excluded.name, description = excluded.description;

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.caregivers enable row level security;
alter table public.caregiver_patient enable row level security;
alter table public.person_memories enable row level security;
alter table public.games enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_metrics enable row level security;
alter table public.adaptive_difficulty_history enable row level security;
alter table public.reminders enable row level security;
alter table public.reminder_completions enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.patient_emergency_info enable row level security;
alter table public.ai_analysis_jobs enable row level security;
alter table public.ai_analysis_results enable row level security;

create policy "read own profile" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
-- Profile role and role_selected_at are intentionally not client-writable.
-- The one-time select_my_app_role RPC above is the only role mutation path.

create policy "patient owner or linked caregiver can read patients" on public.patients for select to authenticated
  using (private.can_access_patient(id));
create policy "patient owner manages patient" on public.patients for insert to authenticated
  with check ((select auth.uid()) = auth_user_id);
create policy "patient owner updates patient" on public.patients for update to authenticated
  using ((select auth.uid()) = auth_user_id) with check ((select auth.uid()) = auth_user_id);
create policy "patient owner deletes patient" on public.patients for delete to authenticated
  using ((select auth.uid()) = auth_user_id);

create policy "own caregiver profile" on public.caregivers for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "participants manage caregiver links" on public.caregiver_patient for all to authenticated
  using (
    (select auth.uid()) = caregiver_id
    or exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid())
  ) with check (
    (select auth.uid()) = caregiver_id
    or exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid())
  );

create policy "access people" on public.person_memories for select to authenticated using (private.can_access_patient(patient_id));
create policy "linked users manage people" on public.person_memories for insert to authenticated with check (private.can_access_patient(patient_id));
create policy "linked users update people" on public.person_memories for update to authenticated using (private.can_access_patient(patient_id)) with check (private.can_access_patient(patient_id));
create policy "linked users delete people" on public.person_memories for delete to authenticated using (private.can_access_patient(patient_id));

create policy "authenticated read games" on public.games for select to authenticated using (active = true);
create policy "access game sessions" on public.game_sessions for select to authenticated using (private.can_access_patient(patient_id));
create policy "patient creates game sessions" on public.game_sessions for insert to authenticated with check (exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()));
create policy "access game metrics" on public.game_metrics for select to authenticated using (exists (select 1 from public.game_sessions s where s.id = session_id and private.can_access_patient(s.patient_id)));
create policy "patient creates game metrics" on public.game_metrics for insert to authenticated with check (exists (select 1 from public.game_sessions s join public.patients p on p.id = s.patient_id where s.id = session_id and p.auth_user_id = auth.uid()));
create policy "access difficulty history" on public.adaptive_difficulty_history for select to authenticated using (private.can_access_patient(patient_id));
create policy "patient writes difficulty history" on public.adaptive_difficulty_history for insert to authenticated with check (exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()));

create policy "access reminders" on public.reminders for select to authenticated using (private.can_access_patient(patient_id));
create policy "linked users manage reminders" on public.reminders for all to authenticated using (private.can_access_patient(patient_id)) with check (private.can_access_patient(patient_id));
create policy "access reminder completions" on public.reminder_completions for select to authenticated using (exists (select 1 from public.reminders r where r.id = reminder_id and private.can_access_patient(r.patient_id)));
create policy "linked users manage reminder completions" on public.reminder_completions for all to authenticated using (exists (select 1 from public.reminders r where r.id = reminder_id and private.can_access_patient(r.patient_id))) with check (exists (select 1 from public.reminders r where r.id = reminder_id and private.can_access_patient(r.patient_id)));

create policy "access emergency contacts" on public.emergency_contacts for select to authenticated using (private.can_access_patient(patient_id));
create policy "linked users manage emergency contacts" on public.emergency_contacts for all to authenticated using (private.can_access_patient(patient_id)) with check (private.can_access_patient(patient_id));
create policy "access emergency info" on public.patient_emergency_info for select to authenticated using (private.can_access_patient(patient_id));
create policy "linked users manage emergency info" on public.patient_emergency_info for all to authenticated using (private.can_access_patient(patient_id)) with check (private.can_access_patient(patient_id));

create policy "authorized users read ai jobs" on public.ai_analysis_jobs for select to authenticated
  using (private.can_access_patient(patient_id));
create policy "authorized users read ai results" on public.ai_analysis_results for select to authenticated
  using (private.can_access_patient(patient_id));

create policy "patient media read" on storage.objects for select to authenticated
  using (bucket_id = 'patient-media' and private.can_access_patient(split_part(name, '/', 1)::uuid));
create policy "patient media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'patient-media' and private.can_access_patient(split_part(name, '/', 1)::uuid));
create policy "patient media update" on storage.objects for update to authenticated
  using (bucket_id = 'patient-media' and private.can_access_patient(split_part(name, '/', 1)::uuid))
  with check (bucket_id = 'patient-media' and private.can_access_patient(split_part(name, '/', 1)::uuid));
create policy "patient media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'patient-media' and private.can_access_patient(split_part(name, '/', 1)::uuid));
