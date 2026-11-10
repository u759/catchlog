-- Conditions at catch time (tide, water temperature/level/flow), looked up on the server by the catch's own time
-- and position after it uploads. Station lists refresh monthly through sync-sources adapters; the
-- 'catch-conditions' adapter fills catches.conditions every few minutes.

-- ── catches ────────────────────────────────────────────────────────────────────────────────────
alter table public.catches
  add column if not exists conditions jsonb,
  add column if not exists conditions_at timestamptz;
comment on column public.catches.conditions is
  'Server-computed at catch time: { tide?, water?, lake_temp?, pending?[] }. Written only by the catch-conditions adapter.';

-- Clients may not write conditions (the server owns them).
revoke update (conditions, conditions_at) on public.catches from authenticated;
revoke insert (conditions, conditions_at) on public.catches from authenticated;

-- ── stations ───────────────────────────────────────────────────────────────────────────────────
create table public.tide_stations (
  id          text primary key,             -- CHS IWLS station id
  code        text,
  name        text not null,
  lat         double precision not null,
  lng         double precision not null,
  geom        extensions.geography(Point) generated always as
                (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,
  wlp_series  boolean not null default false,  -- has water level predictions
  hilo_series boolean not null default false,  -- has high/low predictions
  updated_at  timestamptz not null default now()
);
create index tide_stations_geom_idx on public.tide_stations using gist (geom);

create table public.water_stations (
  station_number text primary key,          -- ECCC hydrometric station
  name           text not null,
  lat            double precision not null,
  lng            double precision not null,
  geom           extensions.geography(Point) generated always as
                   (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,
  updated_at     timestamptz not null default now()
);
create index water_stations_geom_idx on public.water_stations using gist (geom);

-- Real-time gauges on a lake (within 500 m of its outline). Small reference table synced to phones (lake page).
create table public.lake_stations (
  waterbody_id   uuid not null references public.waterbodies (id) on delete cascade,
  station_number text not null references public.water_stations (station_number) on delete cascade,
  name           text not null,
  updated_at     timestamptz not null default now(),
  primary key (waterbody_id, station_number)
);
create trigger lake_stations_updated_at before insert or update on public.lake_stations
  for each row execute function private.set_updated_at();

alter table public.tide_stations enable row level security;
alter table public.water_stations enable row level security;
alter table public.lake_stations enable row level security;
create policy lake_stations_read on public.lake_stations for select to authenticated using (true);
grant select on public.lake_stations to authenticated;
grant select, insert, update, delete on public.tide_stations, public.water_stations, public.lake_stations to service_role;
grant select, update on public.catches to service_role;

-- rows: [{ id, code, name, lat, lng, wlp, hilo }]
create or replace function public.replace_tide_stations(p_rows jsonb)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  insert into public.tide_stations as t (id, code, name, lat, lng, wlp_series, hilo_series)
  select r->>'id', r->>'code', r->>'name', (r->>'lat')::double precision, (r->>'lng')::double precision,
         coalesce((r->>'wlp')::boolean, false), coalesce((r->>'hilo')::boolean, false)
  from jsonb_array_elements(p_rows) r
  on conflict (id) do update set code = excluded.code, name = excluded.name, lat = excluded.lat, lng = excluded.lng,
    wlp_series = excluded.wlp_series, hilo_series = excluded.hilo_series, updated_at = now()
  where (t.code, t.name, t.lat, t.lng, t.wlp_series, t.hilo_series)
        is distinct from (excluded.code, excluded.name, excluded.lat, excluded.lng, excluded.wlp_series, excluded.hilo_series);
  delete from public.tide_stations t where not exists (select 1 from jsonb_array_elements(p_rows) r where r->>'id' = t.id);
  select count(*) into n from public.tide_stations;
  return n;
end;
$$;

-- rows: [{ station_number, name, lat, lng }] (real-time stations only). Also refreshes lake_stations.
create or replace function public.replace_water_stations(p_rows jsonb)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  insert into public.water_stations as w (station_number, name, lat, lng)
  select r->>'station_number', r->>'name', (r->>'lat')::double precision, (r->>'lng')::double precision
  from jsonb_array_elements(p_rows) r
  on conflict (station_number) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, updated_at = now()
  where (w.name, w.lat, w.lng) is distinct from (excluded.name, excluded.lat, excluded.lng);
  delete from public.water_stations w
  where not exists (select 1 from jsonb_array_elements(p_rows) r where r->>'station_number' = w.station_number);

  create temp table _ls on commit drop as
  select wb.id as waterbody_id, s.station_number, s.name
  from public.water_stations s
  join public.waterbodies wb on wb.geom is not null and extensions.st_dwithin(wb.geom, s.geom, 500);
  delete from public.lake_stations l
  where not exists (select 1 from _ls where _ls.waterbody_id = l.waterbody_id and _ls.station_number = l.station_number);
  insert into public.lake_stations as l (waterbody_id, station_number, name)
  select waterbody_id, station_number, name from _ls
  on conflict (waterbody_id, station_number) do update set name = excluded.name where l.name is distinct from excluded.name;

  select count(*) into n from public.water_stations;
  return n;
end;
$$;

-- Catches that need conditions, with the stations that apply:
--  tide: catch not in a lake, nearest tide station with predictions within 20 km;
--  water: a gauge on the catch's lake, or (not in a lake) the nearest gauge within 2 km.
-- Pending = never computed, or a source still had no data (retried every 12 h for 7 days).
create or replace function public.pending_catch_conditions(p_limit integer default 10)
returns table (id uuid, caught_at timestamptz, lat double precision, lng double precision, area_ha double precision,
               tide_station text, tide_name text, water_station text, water_name text, conditions jsonb)
language sql stable set search_path = '' as $$
  select c.id, c.caught_at, c.lat, c.lng, wb.area_ha,
         t.id, t.name, coalesce(ls.station_number, ws.station_number), coalesce(ls.name, ws.name), c.conditions
  from public.catches c
  left join public.waterbodies wb on wb.id = c.waterbody_id
  cross join lateral (select extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat), 4326)::extensions.geography as g) p
  left join lateral (
    select ts.id, ts.name from public.tide_stations ts
    where c.waterbody_id is null and ts.wlp_series and extensions.st_dwithin(ts.geom, p.g, 20000)
    order by extensions.st_distance(ts.geom, p.g) limit 1
  ) t on true
  left join lateral (
    select l.station_number, l.name from public.lake_stations l where l.waterbody_id = c.waterbody_id limit 1
  ) ls on true
  left join lateral (
    select s.station_number, s.name from public.water_stations s
    where c.waterbody_id is null and extensions.st_dwithin(s.geom, p.g, 2000)
    order by extensions.st_distance(s.geom, p.g) limit 1
  ) ws on true
  where c.deleted_at is null and c.lat is not null and c.lng is not null
    and (c.conditions_at is null
         or (c.conditions ? 'pending' and c.conditions_at < now() - interval '12 hours' and c.caught_at > now() - interval '7 days'))
  order by c.conditions_at nulls first, c.created_at
  limit p_limit;
$$;

create or replace function public.set_catch_conditions(p_id uuid, p_conditions jsonb)
returns void language sql set search_path = '' as $$
  update public.catches set conditions = p_conditions, conditions_at = now() where id = p_id;
$$;

revoke execute on function public.replace_tide_stations(jsonb), public.replace_water_stations(jsonb),
  public.pending_catch_conditions(integer), public.set_catch_conditions(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_tide_stations(jsonb), public.replace_water_stations(jsonb),
  public.pending_catch_conditions(integer), public.set_catch_conditions(uuid, jsonb) to service_role;

create or replace function public.reference_version(p_table text)
returns text language plpgsql stable security invoker set search_path = '' as $$
declare v text;
begin
  if p_table not in ('species', 'species_profiles', 'waterbodies', 'waterbody_species', 'data_sources', 'lake_stations') then
    raise exception 'unknown reference table %', p_table;
  end if;
  execute format('select count(*)::text || '':'' || coalesce(max(updated_at)::text, '''') from public.%I', p_table) into v;
  return v;
end;
$$;

-- ── sources ────────────────────────────────────────────────────────────────────────────────────
insert into public.data_sources (key, name, region, licence, attribution, url, used_for, refresh_every, depends_on, enabled) values
  ('chs-tides', 'Tides (Canadian Hydrographic Service)', null, 'Fisheries and Oceans Canada; non-commercial use',
   'Tide predictions: Fisheries and Oceans Canada (CHS). Not for navigation.',
   'https://tides.gc.ca', 'Tide at catch time', interval '30 days', '{}', true),
  ('eccc-hydrometric', 'Water gauges (Environment and Climate Change Canada)', null, 'Open Government Licence – Canada',
   'Water level, flow and temperature: Environment and Climate Change Canada, Water Survey of Canada.',
   'https://wateroffice.ec.gc.ca', 'Water temperature, level and flow', interval '30 days', '{bc-fwa-lakes}', true),
  ('mur-sst', 'Lake surface temperature (NASA JPL MUR)', null, 'Public domain (NASA)',
   'Lake surface temperature: JPL MUR SST v4.1, NASA PO.DAAC, via NOAA CoastWatch ERDDAP.',
   'https://podaac.jpl.nasa.gov/MEaSUREs-MUR', 'Lake surface temperature on large lakes', interval '30 days', '{}', false),
  ('catch-conditions', 'Conditions at catch time', null, 'Derived', 'Combines tide, gauge and satellite data for each catch.',
   null, null, interval '5 minutes', '{chs-tides,eccc-hydrometric}', true)
on conflict (key) do nothing;
