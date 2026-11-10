-- Photo paths must be in the owner's own storage folder ("{user_id}/..."). Otherwise a user could point their own
-- public catch (or photo row) at another user's private file, and the storage read policy (which allows any
-- photo referenced by a visible catch) would expose it.
alter table public.catches
  add constraint catches_photo_path_owned check (photo_path is null or split_part(photo_path, '/', 1) = user_id::text);
alter table public.catch_photos
  add constraint catch_photos_path_owned check (split_part(path, '/', 1) = user_id::text);

-- A photo row can only be moved between your own catches.
drop policy catch_photos_update on public.catch_photos;
create policy catch_photos_update on public.catch_photos for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.catches c where c.id = catch_id and c.user_id = (select auth.uid()))
  );
