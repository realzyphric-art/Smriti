-- Restore the feature tables used by the current client on older projects
-- that only have patients, profiles, and system_events.
create schema if not exists private;

create table if not exists public.caregivers (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.caregiver_patient (
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (caregiver_id, patient_id)
);

create table if not exists public.person_memories (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  name text not null,
  relationship text not null default 'other',
  nickname text,
  photo_path text,
  photo_paths text[] not null default '{}',
  notes text,
  voice_recording_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  game_type text not null,
  category text not null,
  level smallint not null default 1,
  score smallint not null default 0,
  accuracy smallint not null default 0,
  attempts integer not null default 0,
  mistakes integer not null default 0,
  response_time_ms integer not null default 0,
  completed boolean not null default false,
  duration_seconds integer not null default 0,
  played_at timestamptz not null default now(),
  client_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.game_metrics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  metric_name text not null,
  metric_value numeric not null,
  metric_text text,
  created_at timestamptz not null default now(),
  unique (session_id, metric_name)
);

create table if not exists public.adaptive_difficulty_history (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  game_type text not null,
  previous_level smallint not null default 1,
  new_level smallint not null default 1,
  score smallint not null default 0,
  response_time_ms integer not null default 0,
  consistency_score smallint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  title text not null,
  detail text not null default '',
  icon text not null default '🔔',
  time_local time not null,
  category text not null default 'custom',
  recurring boolean not null default false,
  repeat_days smallint[] not null default '{}',
  enabled boolean not null default true,
  scheduled_date date,
  assigned_person_id uuid references public.person_memories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reminder_completions (
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  completed_on date not null,
  completed_at timestamptz not null default now(),
  primary key (reminder_id, completed_on)
);

create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  person_id uuid references public.person_memories(id) on delete set null,
  name text not null,
  phone text not null,
  priority smallint not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_emergency_info (
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
    select 1 from public.caregiver_patient cp
    where cp.patient_id = target_patient
      and cp.caregiver_id = auth.uid()
      and cp.status = 'active'
  );
$$;

revoke all on function private.can_access_patient(uuid) from public;
grant execute on function private.can_access_patient(uuid) to authenticated;

insert into public.games (slug, name, description) values
  ('picture-pairs', 'Picture Pairs', 'Match familiar pictures'),
  ('follow-the-sequence', 'Follow the Sequence', 'Repeat the displayed sequence'),
  ('daily-routine-ordering', 'Daily Routine Ordering', 'Put daily activities in order'),
  ('who-is-this-person', 'Who Is This Person?', 'Recognize a familiar person')
on conflict (slug) do update set name = excluded.name, description = excluded.description;

grant select, insert, update, delete on all tables in schema public to authenticated;
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

drop policy if exists "access people" on public.person_memories;
create policy "access people" on public.person_memories for select to authenticated using (private.can_access_patient(patient_id));
drop policy if exists "manage people" on public.person_memories;
create policy "manage people" on public.person_memories for all to authenticated using (private.can_access_patient(patient_id)) with check (private.can_access_patient(patient_id));

drop policy if exists "read active games" on public.games;
create policy "read active games" on public.games for select to authenticated using (active = true);

drop policy if exists "access game sessions" on public.game_sessions;
create policy "access game sessions" on public.game_sessions for select to authenticated using (private.can_access_patient(patient_id));
drop policy if exists "create game sessions" on public.game_sessions;
create policy "create game sessions" on public.game_sessions for insert to authenticated with check (private.can_access_patient(patient_id));

drop policy if exists "access game metrics" on public.game_metrics;
create policy "access game metrics" on public.game_metrics for select to authenticated using (exists (select 1 from public.game_sessions s where s.id = session_id and private.can_access_patient(s.patient_id)));
drop policy if exists "create game metrics" on public.game_metrics;
create policy "create game metrics" on public.game_metrics for insert to authenticated with check (exists (select 1 from public.game_sessions s where s.id = session_id and private.can_access_patient(s.patient_id)));

drop policy if exists "access difficulty history" on public.adaptive_difficulty_history;
create policy "access difficulty history" on public.adaptive_difficulty_history for select to authenticated using (private.can_access_patient(patient_id));
drop policy if exists "create difficulty history" on public.adaptive_difficulty_history;
create policy "create difficulty history" on public.adaptive_difficulty_history for insert to authenticated with check (private.can_access_patient(patient_id));

drop policy if exists "access reminders" on public.reminders;
create policy "access reminders" on public.reminders for all to authenticated using (private.can_access_patient(patient_id)) with check (private.can_access_patient(patient_id));
drop policy if exists "access reminder completions" on public.reminder_completions;
create policy "access reminder completions" on public.reminder_completions for all to authenticated using (exists (select 1 from public.reminders r where r.id = reminder_id and private.can_access_patient(r.patient_id))) with check (exists (select 1 from public.reminders r where r.id = reminder_id and private.can_access_patient(r.patient_id)));

drop policy if exists "access emergency contacts" on public.emergency_contacts;
create policy "access emergency contacts" on public.emergency_contacts for all to authenticated using (private.can_access_patient(patient_id)) with check (private.can_access_patient(patient_id));
drop policy if exists "access emergency info" on public.patient_emergency_info;
create policy "access emergency info" on public.patient_emergency_info for all to authenticated using (private.can_access_patient(patient_id)) with check (private.can_access_patient(patient_id));

drop policy if exists "manage own caregiver links" on public.caregiver_patient;
create policy "manage own caregiver links" on public.caregiver_patient for all to authenticated using (caregiver_id = auth.uid() or exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid())) with check (caregiver_id = auth.uid() or exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()));
