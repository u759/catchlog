-- Which lakes have digital depth contours (BC Lake Bathymetric Maps, 26 lakes). The contours themselves are
-- Access Only: the phone fetches them from the BC WFS and keeps them on the device; we only store this flag.
alter table public.waterbodies add column if not exists has_contours boolean not null default false;

-- p_keys: published lake identifiers of key type p_key_type. Sets the flag on those lakes, clears it elsewhere.
create or replace function public.set_waterbody_contours(p_key_type text, p_keys text[])
returns integer language sql set search_path = '' as $$
  with hit as (
    select distinct k.waterbody_id from public.waterbody_keys k where k.key_type = p_key_type and k.key_value = any (p_keys)
  ), u as (
    update public.waterbodies w set has_contours = (w.id in (select waterbody_id from hit))
    where w.has_contours is distinct from (w.id in (select waterbody_id from hit))
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function public.set_waterbody_contours(text, text[]) from public, anon, authenticated;
grant execute on function public.set_waterbody_contours(text, text[]) to service_role;

insert into public.data_sources (key, name, region, licence, attribution, url, used_for, refresh_every, depends_on) values
  ('bc-lake-contours', 'BC Lake Bathymetric Maps (depth contours)', 'BC', 'Access Only (Province of British Columbia)',
   'Depth contours: BC Ministry of Water, Land and Resource Stewardship. Shown from the BC Data Catalogue, not rehosted. Not for navigation.',
   'https://catalogue.data.gov.bc.ca/dataset/bc-lake-bathymetric-maps', 'Depth contours on the map',
   interval '30 days', '{bc-fwa-lakes}')
on conflict (key) do nothing;
