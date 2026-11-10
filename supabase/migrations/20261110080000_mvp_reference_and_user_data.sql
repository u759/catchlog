-- MVP: species collection & profiles, waterbodies (lakes) with source adapters, tackle (gear),
-- saved spots, and scheduled source refreshes. Region-agnostic: BC is the first set of adapters.

create extension if not exists postgis with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ── species: collection numbering ─────────────────────────────────────────
alter table public.species add column dex_no integer;
with ordered as (
  select id, row_number() over (
    order by in_canada desc, order_name nulls last, family nulls last, scientific_name) as n
  from public.species
)
update public.species s set dex_no = o.n from ordered o where o.id = s.id;
create unique index species_dex_no_idx on public.species (dex_no);

-- Alternate names/codes that map to a species (source codes, old spellings, other providers).
create table public.species_aliases (
  alias_type text not null,          -- e.g. 'bc-fish-code', 'scientific', 'fishial'
  alias      text not null,
  species_id text not null references public.species (id) on delete cascade,
  primary key (alias_type, alias)
);

-- Rich, read-only species content (FishBase + Wikipedia/Wikidata/Commons). See scripts/build-species-profiles.py.
create table public.species_profiles (
  species_id        text primary key references public.species (id) on delete cascade,
  summary           text,            -- Wikipedia lead (CC BY-SA 4.0)
  summary_url       text,
  habitat           text,            -- FishBase species.Comments
  environment       text,            -- FishBase DemersPelag (e.g. benthopelagic)
  migration         text,            -- FishBase AnaCat (e.g. anadromous)
  depth_min_m       integer,
  depth_max_m       integer,
  temp_pref_min_c   real,
  temp_pref_max_c   real,
  spawning_months   integer[],       -- 1..12
  feeding           text,
  diet              text,
  id_features       text,
  max_weight_g      integer,
  longevity_years   real,
  iucn_status       text,
  canada_status     text,            -- native / introduced (FishBase country table, Canada)
  canada_notes      text,
  image_url         text,
  image_thumb_url   text,
  image_author      text,
  image_license     text,
  image_page_url    text,
  wikidata_id       text,
  updated_at        timestamptz not null default now()
);

-- ── waterbodies (general; filled by source adapters) ─────────────────────
create table public.waterbodies (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,               -- adapter key, e.g. 'bc-fwa-lakes'
  source_id     text not null,               -- id within that source
  region        text not null,               -- 'BC', later 'ON', ...
  kind          text not null default 'lake' check (kind in ('lake', 'reservoir', 'river', 'wetland', 'coastal')),
  name          text,
  area_ha       double precision,
  max_depth_m   double precision,
  mean_depth_m  double precision,
  depth_maps    jsonb not null default '[]',  -- [{ "title", "url", "source", "licence" }]
  lat           double precision,             -- point on surface (labels, offline nearest)
  lng           double precision,
  bbox          double precision[],           -- [west, south, east, north]
  geom          extensions.geography(MultiPolygon, 4326),
  attributes    jsonb not null default '{}',
  updated_at    timestamptz not null default now(),
  unique (source, source_id)
);
create index waterbodies_geom_idx on public.waterbodies using gist (geom);
create index waterbodies_updated_idx on public.waterbodies (updated_at, id);

-- Cross-source identifiers for a waterbody (e.g. BC 1:50K code), used to join other datasets.
create table public.waterbody_keys (
  key_type     text not null,
  key_value    text not null,
  waterbody_id uuid not null references public.waterbodies (id) on delete cascade,
  primary key (key_type, key_value, waterbody_id)
);
create index waterbody_keys_wb_idx on public.waterbody_keys (waterbody_id);

create table public.waterbody_species (
  waterbody_id   uuid not null references public.waterbodies (id) on delete cascade,
  species_id     text not null references public.species (id) on delete cascade,
  source         text not null,
  observations   integer not null default 0,
  first_observed date,
  last_observed  date,
  updated_at     timestamptz not null default now(),
  primary key (waterbody_id, species_id, source)
);
create index waterbody_species_species_idx on public.waterbody_species (species_id);
create index waterbody_species_updated_idx on public.waterbody_species (updated_at);

-- ── data sources + refresh jobs (driven by the sync-sources Edge Function) ─
create table public.data_sources (
  key              text primary key,
  name             text not null,
  region           text,
  licence          text not null,
  attribution      text not null,
  url              text,
  refresh_every    interval not null default interval '30 days',
  enabled          boolean not null default true,
  depends_on       text[] not null default '{}',
  state            jsonb not null default '{}',   -- adapter cursor while a run is in progress
  running_since    timestamptz,
  last_success_at  timestamptz,
  last_attempt_at  timestamptz,
  last_error       text,
  last_row_count   integer
);

-- ── user data: gear (tackle box) and saved spots ──────────────────────────
create table public.gear (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category    text not null,          -- lure taxonomy key (app), e.g. 'soft-plastic'
  subtype     text,
  brand       text,
  name        text not null,
  color       text,
  size        text,
  weight_g    real,
  hook_size   text,
  quantity    integer,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index gear_user_updated_idx on public.gear (user_id, updated_at, id);

create table public.spots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name          text not null,
  lat           double precision not null,
  lng           double precision not null,
  depth_m       real,
  notes         text,
  waterbody_id  uuid,                 -- soft reference (reference data may be reloaded)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index spots_user_updated_idx on public.spots (user_id, updated_at, id);

alter table public.catches add column gear_id uuid;        -- soft reference to gear
alter table public.catches add column waterbody_id uuid;   -- set by trigger from lat/lng

create trigger gear_updated_at before insert or update on public.gear
  for each row execute function private.set_updated_at();
create trigger spots_updated_at before insert or update on public.spots
  for each row execute function private.set_updated_at();
create trigger species_profiles_updated_at before insert or update on public.species_profiles
  for each row execute function private.set_updated_at();
create trigger waterbodies_updated_at before insert or update on public.waterbodies
  for each row execute function private.set_updated_at();
create trigger waterbody_species_updated_at before insert or update on public.waterbody_species
  for each row execute function private.set_updated_at();

-- Which waterbody contains (or is within 300 m of) a point.
create or replace function public.waterbody_at(p_lat double precision, p_lng double precision)
returns uuid language sql stable set search_path = '' as $$
  with pt as (select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g)
  select coalesce(
    (select w.id from public.waterbodies w, pt where extensions.st_covers(w.geom, pt.g) order by w.area_ha nulls last limit 1),
    (select w.id from public.waterbodies w, pt where extensions.st_dwithin(w.geom, pt.g, 300)
       order by extensions.st_distance(w.geom, pt.g) limit 1)
  );
$$;
grant execute on function public.waterbody_at(double precision, double precision) to authenticated;

-- Catches and spots get their waterbody from their coordinates on the server (exact polygons).
create or replace function private.assign_waterbody()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lat is not null and new.lng is not null
     and (tg_op = 'INSERT' or new.lat is distinct from old.lat or new.lng is distinct from old.lng
          or new.waterbody_id is null) then
    new.waterbody_id := coalesce(public.waterbody_at(new.lat, new.lng), new.waterbody_id);
  end if;
  return new;
end;
$$;
create trigger catches_assign_waterbody before insert or update on public.catches
  for each row execute function private.assign_waterbody();
create trigger spots_assign_waterbody before insert or update on public.spots
  for each row execute function private.assign_waterbody();

-- Version string per reference table: clients skip downloading when unchanged.
create or replace function public.reference_version(p_table text)
returns text language plpgsql stable security invoker set search_path = '' as $$
declare v text;
begin
  if p_table not in ('species', 'species_profiles', 'waterbodies', 'waterbody_species') then
    raise exception 'unknown reference table %', p_table;
  end if;
  execute format('select count(*)::text || '':'' || coalesce(max(updated_at)::text, '''') from public.%I', p_table) into v;
  return v;
end;
$$;
grant execute on function public.reference_version(text) to authenticated;

-- ── RLS + grants ───────────────────────────────────────────────────────────
alter table public.species_aliases   enable row level security;
alter table public.species_profiles  enable row level security;
alter table public.waterbodies       enable row level security;
alter table public.waterbody_keys    enable row level security;
alter table public.waterbody_species enable row level security;
alter table public.data_sources      enable row level security;
alter table public.gear              enable row level security;
alter table public.spots             enable row level security;

-- Reference data: readable by signed-in users, written only by the server (service role).
create policy species_aliases_read on public.species_aliases for select to authenticated using (true);
create policy species_profiles_read on public.species_profiles for select to authenticated using (true);
create policy waterbodies_read on public.waterbodies for select to authenticated using (true);
create policy waterbody_keys_read on public.waterbody_keys for select to authenticated using (true);
create policy waterbody_species_read on public.waterbody_species for select to authenticated using (true);
create policy data_sources_read on public.data_sources for select to authenticated using (true);
grant select on public.species_aliases, public.species_profiles, public.waterbodies, public.waterbody_keys,
  public.waterbody_species to authenticated;
grant select (key, name, region, licence, attribution, url, last_success_at) on public.data_sources to authenticated;

-- Own gear and spots only (private).
create policy gear_own on public.gear for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy spots_own on public.spots for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.gear, public.spots to authenticated;

-- Server-side writers used by the sync-sources Edge Function (service role only).
revoke all on function private.assign_waterbody() from public, anon, authenticated;

-- ── adapter write API (service role only; called by the sync-sources Edge Function) ─────────
-- service_role does not get table privileges by default in this project.
grant select, insert, update, delete on public.species_aliases, public.species_profiles, public.waterbodies,
  public.waterbody_keys, public.waterbody_species, public.data_sources to service_role;

create table private.observation_staging (
  source      text not null,
  key_type    text not null,
  key_value   text not null,
  alias_type  text not null,
  alias       text not null,
  n           integer not null,
  first_obs   date,
  last_obs    date,
  primary key (source, key_type, key_value, alias_type, alias)
);
grant usage on schema private to service_role;
grant all on private.observation_staging to service_role;

-- rows: [{ source_id, name, kind, area_ha, geometry (GeoJSON), keys: {key_type: value}, attributes }]
-- Geometry is simplified (~10 m) and stored as geography; label point + bbox are derived.
create or replace function public.upsert_waterbodies(p_source text, p_region text, p_rows jsonb)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  with src as (
    select r->>'source_id' as source_id, r->>'name' as name, coalesce(r->>'kind', 'lake') as kind,
           (r->>'area_ha')::double precision as area_ha,
           extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
             extensions.st_simplifypreservetopology(
               extensions.st_setsrid(extensions.st_geomfromgeojson(r->'geometry'), 4326), 0.0001)), 3)) as g,
           coalesce(r->'attributes', '{}'::jsonb) as attributes, r->'keys' as keys
    from jsonb_array_elements(p_rows) r
  ), src2 as (
    select s.*, md5(extensions.st_asbinary(s.g)) as geom_md5 from src s
    where s.g is not null and not extensions.st_isempty(s.g)
  ), up as (
    insert into public.waterbodies as w (source, source_id, region, kind, name, area_ha, lat, lng, bbox, geom, attributes)
    select p_source, s.source_id, p_region, s.kind, s.name, s.area_ha,
           extensions.st_y(extensions.st_pointonsurface(s.g)), extensions.st_x(extensions.st_pointonsurface(s.g)),
           array[extensions.st_xmin(s.g), extensions.st_ymin(s.g), extensions.st_xmax(s.g), extensions.st_ymax(s.g)],
           s.g::extensions.geography, s.attributes || jsonb_build_object('geom_md5', s.geom_md5)
    from src2 s
    on conflict (source, source_id) do update set
      name = excluded.name, kind = excluded.kind, area_ha = excluded.area_ha, lat = excluded.lat, lng = excluded.lng,
      bbox = excluded.bbox, geom = excluded.geom, attributes = w.attributes || excluded.attributes
    where (w.name, w.kind, w.area_ha, w.attributes->>'geom_md5')
          is distinct from (excluded.name, excluded.kind, excluded.area_ha, excluded.attributes->>'geom_md5')
    returning w.id, w.source_id
  )
  select count(*) into n from up;

  insert into public.waterbody_keys (key_type, key_value, waterbody_id)
  select k.key, k.value, w.id
  from jsonb_array_elements(p_rows) r
  join public.waterbodies w on w.source = p_source and w.source_id = r->>'source_id'
  cross join lateral jsonb_each_text(coalesce(r->'keys', '{}'::jsonb)) k
  where k.value is not null and k.value <> ''
  on conflict do nothing;
  return n;
end;
$$;

-- rows: [{ key_type, key_value, alias_type, alias, n, first, last }] — additive while a run is in progress.
create or replace function public.stage_observations(p_source text, p_rows jsonb)
returns integer language sql set search_path = '' as $$
  with i as (
  insert into private.observation_staging as o (source, key_type, key_value, alias_type, alias, n, first_obs, last_obs)
  select p_source, r->>'key_type', r->>'key_value', r->>'alias_type', r->>'alias', (r->>'n')::int,
         (r->>'first')::date, (r->>'last')::date
  from jsonb_array_elements(p_rows) r
  on conflict (source, key_type, key_value, alias_type, alias) do update set
    n = o.n + excluded.n,
    first_obs = least(o.first_obs, excluded.first_obs),
    last_obs = greatest(o.last_obs, excluded.last_obs)
  returning 1)
  select count(*)::int from i;
$$;

-- Replaces this source's waterbody_species from the staged observations, then clears staging.
-- Unchanged rows are left alone so clients only re-download real changes.
create or replace function public.finalize_observations(p_source text)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  create temp table _ws on commit drop as
  select k.waterbody_id, a.species_id, sum(o.n)::int as observations, min(o.first_obs) as first_observed,
         max(o.last_obs) as last_observed
  from private.observation_staging o
  join public.waterbody_keys k on k.key_type = o.key_type and k.key_value = o.key_value
  join public.species_aliases a on a.alias_type = o.alias_type and a.alias = o.alias
  where o.source = p_source
  group by k.waterbody_id, a.species_id;

  delete from public.waterbody_species ws
  where ws.source = p_source
    and not exists (select 1 from _ws t where t.waterbody_id = ws.waterbody_id and t.species_id = ws.species_id);

  insert into public.waterbody_species as ws (waterbody_id, species_id, source, observations, first_observed, last_observed)
  select waterbody_id, species_id, p_source, observations, first_observed, last_observed from _ws
  on conflict (waterbody_id, species_id, source) do update set
    observations = excluded.observations, first_observed = excluded.first_observed, last_observed = excluded.last_observed
  where (ws.observations, ws.first_observed, ws.last_observed)
        is distinct from (excluded.observations, excluded.first_observed, excluded.last_observed);

  select count(*) into n from public.waterbody_species where source = p_source;
  delete from private.observation_staging where source = p_source;
  return n;
end;
$$;

-- rows: [{ key_type, key_value, max_depth_m, mean_depth_m }] — keeps the deepest survey per waterbody.
create or replace function public.set_waterbody_depths(p_rows jsonb)
returns integer language sql set search_path = '' as $$
  with d as (
    select k.waterbody_id, max((r->>'max_depth_m')::double precision) as max_d,
           max((r->>'mean_depth_m')::double precision) as mean_d
    from jsonb_array_elements(p_rows) r
    join public.waterbody_keys k on k.key_type = r->>'key_type' and k.key_value = r->>'key_value'
    group by k.waterbody_id
  )
  , u as (
  update public.waterbodies w set
    max_depth_m = greatest(coalesce(w.max_depth_m, 0), d.max_d),
    mean_depth_m = coalesce(d.mean_d, w.mean_depth_m)
  from d where w.id = d.waterbody_id
    and (w.max_depth_m is distinct from greatest(coalesce(w.max_depth_m, 0), d.max_d)
         or w.mean_depth_m is distinct from coalesce(d.mean_d, w.mean_depth_m))
  returning 1)
  select count(*)::int from u;
$$;

-- rows: [{ key_type, key_value, title, url }] — replaces maps from p_source on each waterbody.
create or replace function public.set_waterbody_depth_maps(p_source text, p_licence text, p_rows jsonb)
returns integer language sql set search_path = '' as $$
  with m as (
    select k.waterbody_id,
           jsonb_agg(distinct jsonb_build_object('title', r->>'title', 'url', r->>'url', 'source', p_source, 'licence', p_licence)) as maps
    from jsonb_array_elements(p_rows) r
    join public.waterbody_keys k on k.key_type = r->>'key_type' and k.key_value = r->>'key_value'
    group by k.waterbody_id
  ), merged as (
    select w.id, coalesce((select jsonb_agg(e) from jsonb_array_elements(w.depth_maps) e where e->>'source' <> p_source), '[]'::jsonb)
                 || m.maps as maps
    from public.waterbodies w join m on m.waterbody_id = w.id
  )
  , u as (
  update public.waterbodies w set depth_maps = merged.maps
  from merged where w.id = merged.id and w.depth_maps is distinct from merged.maps
  returning 1)
  select count(*)::int from u;
$$;

revoke all on function public.upsert_waterbodies(text, text, jsonb), public.stage_observations(text, jsonb),
  public.finalize_observations(text), public.set_waterbody_depths(jsonb), public.set_waterbody_depth_maps(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_waterbodies(text, text, jsonb), public.stage_observations(text, jsonb),
  public.finalize_observations(text), public.set_waterbody_depths(jsonb), public.set_waterbody_depth_maps(text, text, jsonb)
  to service_role;

-- ── BC sources (adapters live in supabase/functions/sync-sources/adapters/bc) ───────────────
insert into public.data_sources (key, name, region, licence, attribution, url, refresh_every, depends_on) values
  ('bc-fwa-lakes', 'BC Freshwater Atlas – Lakes', 'BC', 'Open Government Licence – British Columbia',
   'Contains information licensed under the Open Government Licence – British Columbia.',
   'https://catalogue.data.gov.bc.ca/dataset/freshwater-atlas-lakes', interval '180 days', '{}'),
  ('bc-lake-surveys', 'BC Lake Surveys (depths)', 'BC', 'Open Government Licence – British Columbia',
   'Contains information licensed under the Open Government Licence – British Columbia.',
   'https://catalogue.data.gov.bc.ca/dataset/fisheries-information-summary-system-fiss-lake-surveys', interval '90 days', '{bc-fwa-lakes}'),
  ('bc-depth-maps', 'BC Bathymetric Maps – Open', 'BC', 'Open Government Licence – British Columbia',
   'Contains information licensed under the Open Government Licence – British Columbia. Not for navigation.',
   'https://catalogue.data.gov.bc.ca/dataset/1427d389-cd21-4fe2-8ed9-282d9bdcb7e2', interval '90 days', '{bc-fwa-lakes}'),
  ('bc-fish-observations', 'Known BC Fish Observations', 'BC', 'Open Government Licence – British Columbia',
   'Contains information licensed under the Open Government Licence – British Columbia.',
   'https://catalogue.data.gov.bc.ca/dataset/known-bc-fish-observations-and-bc-fish-distributions', interval '30 days', '{bc-fwa-lakes}');
