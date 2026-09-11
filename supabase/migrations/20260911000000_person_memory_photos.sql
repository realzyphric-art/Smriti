-- Allow up to three familiar-person photos while keeping the original photo_path
-- column for backwards compatibility with existing clients.
alter table if exists public.person_memories
  add column if not exists photo_paths text[] not null default '{}';

update public.person_memories
set photo_paths = array[photo_path]
where photo_path is not null
  and cardinality(photo_paths) = 0;
