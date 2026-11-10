-- Satellite view: EOX Sentinel-2 cloudless 2025 imagery with OpenFreeMap labels on top. The style JSON is
-- published to a public Storage bucket by the sync-sources adapter 'eox-s2cloudless' (rebuilt monthly), so the
-- app and its offline downloads use one HTTPS style URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('map-styles', 'map-styles', true, 1048576, array['application/json'])
on conflict (id) do nothing;

insert into public.data_sources (key, name, region, licence, attribution, url, used_for, refresh_every) values
  ('eox-s2cloudless', 'Sentinel-2 cloudless 2025 (EOX)', null, 'CC BY-NC-SA 4.0 (non-commercial)',
   'EOxCloudless 2025 https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
   'https://cloudless.eox.at', 'Satellite view', interval '30 days')
on conflict (key) do nothing;
