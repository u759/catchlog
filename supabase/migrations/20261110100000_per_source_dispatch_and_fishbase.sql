-- 1. Per-source dispatch: pg_cron checks every minute which sources are due and calls the sync-sources
--    Edge Function once per source. Each source runs in its own request (own CPU/memory/time budget), so a
--    slow or failing source never blocks the others. A lock (running_since) stops a source running twice.
-- 2. FishBase is refreshed automatically (monthly; only re-processed when a new release appears).
-- 3. No fallbacks: BC observations link by code only; lakes resolve by one rule (nearest within 300 m).

-- ── 1. dispatch ────────────────────────────────────────────────────────────────────────────────
alter table public.data_sources add column if not exists version text;
comment on column public.data_sources.version is 'Source release last loaded; adapters skip work when it is unchanged.';

create or replace function private.dispatch_sync_sources()
returns integer language sql set search_path = '' as $$
  select count(net.http_post(
    url := 'https://ouqcqcyialpvibrldtyl.supabase.co/functions/v1/sync-sources',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'sync_sources_cron_secret')),
    body := jsonb_build_object('source', s.key),
    timeout_milliseconds := 150000))::int
  from public.data_sources s
  where s.enabled
    -- not running (a lock older than 5 min is from a crashed run)
    and (s.running_since is null or s.running_since < now() - interval '5 minutes')
    -- after an error, wait 10 min before retrying
    and (s.last_error is null or s.last_attempt_at is null or s.last_attempt_at < now() - interval '10 minutes')
    -- dependencies loaded and not mid-refresh
    and not exists (select 1 from public.data_sources d
                    where d.key = any (s.depends_on) and (d.last_success_at is null or d.state <> '{}'::jsonb))
    -- due: a run in progress, never loaded, or older than its interval
    and (s.state <> '{}'::jsonb or s.last_success_at is null or s.last_success_at + s.refresh_every < now());
$$;
revoke execute on function private.dispatch_sync_sources() from public;

select cron.schedule('sync-sources', '* * * * *', 'select private.dispatch_sync_sources()');

-- ── 2. FishBase ────────────────────────────────────────────────────────────────────────────────
grant select, update on public.species to service_role;

-- Patch rows: only keys present in each JSON object change; rows whose values are unchanged are not
-- written, so clients re-download only real changes.
create or replace function public.patch_species(p_rows jsonb)
returns integer language sql set search_path = '' as $$
  with src as (select r->>'id' as id, r from jsonb_array_elements(p_rows) r),
  n as (select s.id, s as old, jsonb_populate_record(s, src.r) as new
        from public.species s join src on src.id = s.id),
  u as (
    update public.species s set
      common_name = (n.new).common_name, common_name_fr = (n.new).common_name_fr, lw_a = (n.new).lw_a,
      lw_b = (n.new).lw_b, lw_method = (n.new).lw_method, max_length_mm = (n.new).max_length_mm,
      freshwater = (n.new).freshwater, brackish = (n.new).brackish, saltwater = (n.new).saltwater,
      game_fish = (n.new).game_fish
    from n where s.id = n.id and n.new is distinct from n.old
    returning 1)
  select count(*)::int from u;
$$;

create or replace function public.patch_species_profiles(p_rows jsonb)
returns integer language plpgsql set search_path = '' as $$
declare changed integer;
begin
  insert into public.species_profiles (species_id)
  select r->>'species_id' from jsonb_array_elements(p_rows) r
  where exists (select 1 from public.species s where s.id = r->>'species_id')
  on conflict (species_id) do nothing;

  with src as (select r->>'species_id' as id, r from jsonb_array_elements(p_rows) r),
  n as (select p.species_id as id, p as old, jsonb_populate_record(p, src.r) as new
        from public.species_profiles p join src on src.id = p.species_id),
  u as (
    update public.species_profiles p set
      habitat = (n.new).habitat, environment = (n.new).environment, migration = (n.new).migration,
      depth_min_m = (n.new).depth_min_m, depth_max_m = (n.new).depth_max_m,
      temp_pref_min_c = (n.new).temp_pref_min_c, temp_pref_max_c = (n.new).temp_pref_max_c,
      spawning_months = (n.new).spawning_months, feeding = (n.new).feeding, diet = (n.new).diet,
      id_features = (n.new).id_features, max_weight_g = (n.new).max_weight_g,
      longevity_years = (n.new).longevity_years, iucn_status = (n.new).iucn_status,
      canada_status = (n.new).canada_status, canada_notes = (n.new).canada_notes
    from n where p.species_id = n.id and n.new is distinct from n.old
    returning 1)
  select count(*)::int into changed from u;
  return changed;
end;
$$;

-- Replaces every alias of one type (e.g. 'scientific' = FishBase's own name list). rows: [{ alias, species_id }]
create or replace function public.replace_species_aliases(p_type text, p_rows jsonb)
returns integer language plpgsql set search_path = '' as $$
declare changed integer := 0; n integer;
begin
  create temp table _a on commit drop as
  select distinct on (r->>'alias') r->>'alias' as alias, r->>'species_id' as species_id
  from jsonb_array_elements(p_rows) r
  where exists (select 1 from public.species s where s.id = r->>'species_id');

  delete from public.species_aliases a
  where a.alias_type = p_type and not exists (select 1 from _a where _a.alias = a.alias and _a.species_id = a.species_id);
  get diagnostics n = row_count; changed := changed + n;

  insert into public.species_aliases (alias_type, alias, species_id)
  select p_type, alias, species_id from _a
  on conflict (alias_type, alias) do nothing;
  get diagnostics n = row_count; changed := changed + n;
  return changed;
end;
$$;

revoke execute on function public.patch_species(jsonb), public.patch_species_profiles(jsonb),
  public.replace_species_aliases(text, jsonb) from public, anon, authenticated;
grant execute on function public.patch_species(jsonb), public.patch_species_profiles(jsonb),
  public.replace_species_aliases(text, jsonb) to service_role;

insert into public.data_sources (key, name, region, licence, attribution, url, refresh_every) values
  ('fishbase', 'FishBase', null, 'CC BY-NC 4.0 (non-commercial)',
   'Froese, R. and D. Pauly. Editors. FishBase. www.fishbase.org.',
   'https://data.source.coop/cboettig/fishbase', interval '30 days')
on conflict (key) do nothing;

-- ── 3. no fallbacks ────────────────────────────────────────────────────────────────────────────
-- BC observations link only through species_aliases (BC code → species).
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
alter table private.observation_staging drop column if exists name;

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
revoke execute on function public.stage_observations(text, jsonb), public.finalize_observations(text)
  from public, anon, authenticated;
grant execute on function public.stage_observations(text, jsonb), public.finalize_observations(text) to service_role;

-- One rule: the nearest lake within 300 m (a point inside a lake is at distance 0).
create or replace function public.waterbody_at(p_lat double precision, p_lng double precision)
returns uuid language sql stable set search_path = '' as $$
  with pt as (select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g)
  select w.id from public.waterbodies w, pt
  where extensions.st_dwithin(w.geom, pt.g, 300)
  order by extensions.st_distance(w.geom, pt.g), w.area_ha nulls last
  limit 1;
$$;

-- waterbody_id is always derived on the server from the coordinates; whatever the phone sent (its offline
-- guess) is replaced. Recomputed only when the coordinates change.
create or replace function private.assign_waterbody()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lat is null or new.lng is null then
    new.waterbody_id := null;
  elsif tg_op = 'INSERT' or new.lat is distinct from old.lat or new.lng is distinct from old.lng then
    new.waterbody_id := public.waterbody_at(new.lat, new.lng);
  else
    new.waterbody_id := old.waterbody_id;
  end if;
  return new;
end;
$$;
