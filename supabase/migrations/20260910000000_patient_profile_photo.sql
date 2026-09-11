-- Add the patient avatar field for existing Smriti deployments.
alter table public.patients
  add column if not exists profile_photo_path text;
