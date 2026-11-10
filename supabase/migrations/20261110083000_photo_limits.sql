-- Photos are compressed on the phone (≤1440 px, JPEG 72% ≈ 150–250 KB) before upload.
-- Cap uploads at 5 MB so a bad client can't fill the free-tier storage.
update storage.buckets set file_size_limit = 5 * 1024 * 1024 where id = 'catch-photos';
