-- The app's Data sources screen reads public.data_sources (synced to the phone like other reference data),
-- so attribution lives in one place. Sources without an adapter (map tiles, weather, the species list) are
-- rows with enabled = false.
alter table public.data_sources
  add column if not exists used_for text,
  add column if not exists updated_at timestamptz not null default now();
comment on column public.data_sources.enabled is 'false = not refreshed by sync-sources (attribution only, or paused).';
comment on column public.data_sources.used_for is 'What the app uses this source for (shown on the Data sources screen).';
comment on column public.data_sources.updated_at is 'Changes only when the displayed fields change, so phones re-download only then.';

-- Only the displayed fields move updated_at (the runner updates state/locks every minute).
create or replace function private.data_sources_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or (new.name, new.used_for, new.licence, new.attribution, new.url)
                         is distinct from (old.name, old.used_for, old.licence, old.attribution, old.url) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
create trigger data_sources_touch before insert or update on public.data_sources
  for each row execute function private.data_sources_touch();

grant select (used_for, updated_at) on public.data_sources to authenticated;

update public.data_sources set used_for = v.used_for from (values
  ('bc-fwa-lakes', 'Lake names and outlines'),
  ('bc-lake-surveys', 'Lake depths'),
  ('bc-depth-maps', 'Official lake depth maps (PDF, not for navigation)'),
  ('bc-fish-observations', 'Fish species recorded in each lake'),
  ('bc-fish-codes', 'Links BC fish records to species'),
  ('fishbase', 'Names, families, length–weight formulas, sizes, habitat, diet, spawning, ID features'),
  ('wiki-species', 'Species summaries and photos (credited on each species page)')
) as v(key, used_for) where data_sources.key = v.key;

insert into public.data_sources (key, name, region, licence, attribution, url, used_for, enabled) values
  ('wild-species-2020', 'Wild Species 2020', null, 'Open Government Licence – Canada',
   'Canadian Endangered Species Conservation Council (2022). Wild Species 2020: The General Status of Species in Canada.',
   'https://www.canada.ca/en/environment-climate-change/services/species-risk-public-registry/general-status/wild-species-2020.html',
   'Fish species occurring in Canada and their provinces/oceans', false),
  ('openfreemap', 'OpenFreeMap / OpenStreetMap', null, 'ODbL (map data); OpenMapTiles',
   'OpenFreeMap © OpenMapTiles. Data © OpenStreetMap contributors.', 'https://openfreemap.org', 'Map tiles', false),
  ('open-meteo', 'Open-Meteo', null, 'CC BY 4.0 (free tier, non-commercial)', 'Weather data by Open-Meteo.com.',
   'https://open-meteo.com', 'Weather at catch time', false)
on conflict (key) do nothing;

create or replace function public.reference_version(p_table text)
returns text language plpgsql stable security invoker set search_path = '' as $$
declare v text;
begin
  if p_table not in ('species', 'species_profiles', 'waterbodies', 'waterbody_species', 'data_sources') then
    raise exception 'unknown reference table %', p_table;
  end if;
  execute format('select count(*)::text || '':'' || coalesce(max(updated_at)::text, '''') from public.%I', p_table) into v;
  return v;
end;
$$;

-- Species photos: re-fetch with standard Wikimedia thumbnail sizes (500 px cards, 960 px species page).
update public.data_sources set state = '{}', last_success_at = null where key = 'wiki-species' and running_since is null;
