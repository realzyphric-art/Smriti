-- Store patient context used to personalize activity suggestions.
alter table public.patients add column if not exists interests text;
