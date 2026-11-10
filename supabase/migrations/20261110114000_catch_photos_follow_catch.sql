-- A soft-deleted catch takes its photos with it (tombstones, so other devices drop the rows and files).
-- Covers catches whose photo rows never reached the deleting device (e.g. covers from before catch_photos).
create or replace function private.tombstone_catch_photos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.catch_photos set deleted_at = new.deleted_at
  where catch_id = new.id and deleted_at is null;
  return null;
end;
$$;
create trigger catches_tombstone_photos after update of deleted_at on public.catches
  for each row when (new.deleted_at is not null and old.deleted_at is null)
  execute function private.tombstone_catch_photos();
