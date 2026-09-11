-- Future AI job storage only. No frontend feature uses these tables yet.
-- Provider calls should be made by a trusted Edge Function or backend that
-- owns private credentials and writes status transitions explicitly.

create table if not exists public.ai_analysis_jobs (
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

create table if not exists public.ai_analysis_results (
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

create index if not exists ai_analysis_jobs_patient_created_idx
  on public.ai_analysis_jobs(patient_id, created_at desc);
create index if not exists ai_analysis_jobs_status_created_idx
  on public.ai_analysis_jobs(status, created_at desc);
create index if not exists ai_analysis_results_patient_created_idx
  on public.ai_analysis_results(patient_id, created_at desc);

alter table public.ai_analysis_jobs enable row level security;
alter table public.ai_analysis_results enable row level security;

drop policy if exists "authorized users read ai jobs" on public.ai_analysis_jobs;
create policy "authorized users read ai jobs" on public.ai_analysis_jobs
  for select to authenticated
  using (private.can_access_patient(patient_id) or private.is_system_admin());

drop policy if exists "authorized users read ai results" on public.ai_analysis_results;
create policy "authorized users read ai results" on public.ai_analysis_results
  for select to authenticated
  using (private.can_access_patient(patient_id) or private.is_system_admin());

-- Deliberately no client insert/update/delete policies: trusted server-side
-- processing owns job creation and status transitions.
