-- 1. Wikipedia summaries + Commons photos refresh automatically (sync-sources adapter 'wiki-species').
--    Linked by IDs the sources maintain themselves: species.fishbase_id -> Wikidata P938 -> enwiki + P18.
-- 2. BC fish observations: codes not in species_aliases fall back to BC's own common name, so new codes
--    resolve without anyone updating a mapping.

-- rows: [{ species_id, wikidata_id, summary, summary_url, image_url, image_thumb_url, image_author,
--          image_license, image_page_url }]. Only rows whose values changed are written (clients re-download
-- a row only when updated_at moves).
create or replace function public.set_species_wiki(p_rows jsonb)
returns integer language sql set search_path = '' as $$
  with i as (
  insert into public.species_profiles as p (species_id, wikidata_id, summary, summary_url, image_url, image_thumb_url,
                                             image_author, image_license, image_page_url)
  select r->>'species_id', r->>'wikidata_id', r->>'summary', r->>'summary_url', r->>'image_url',
         r->>'image_thumb_url', r->>'image_author', r->>'image_license', r->>'image_page_url'
  from jsonb_array_elements(p_rows) r
  where exists (select 1 from public.species s where s.id = r->>'species_id')
  on conflict (species_id) do update set
    wikidata_id = excluded.wikidata_id, summary = excluded.summary, summary_url = excluded.summary_url,
    image_url = excluded.image_url, image_thumb_url = excluded.image_thumb_url, image_author = excluded.image_author,
    image_license = excluded.image_license, image_page_url = excluded.image_page_url
  where (p.wikidata_id, p.summary, p.summary_url, p.image_url, p.image_thumb_url, p.image_author, p.image_license,
         p.image_page_url)
        is distinct from
        (excluded.wikidata_id, excluded.summary, excluded.summary_url, excluded.image_url, excluded.image_thumb_url,
         excluded.image_author, excluded.image_license, excluded.image_page_url)
  returning 1)
  select count(*)::int from i;
$$;
revoke execute on function public.set_species_wiki(jsonb) from public, anon, authenticated;
grant execute on function public.set_species_wiki(jsonb) to service_role;

insert into public.data_sources (key, name, region, licence, attribution, url, refresh_every) values
  ('wiki-species', 'Wikipedia / Wikimedia Commons / Wikidata', null,
   'Wikipedia text CC BY-SA 4.0; Commons images per-file free licences; Wikidata CC0',
   'Summaries from Wikipedia (linked on each species page); photos from Wikimedia Commons (author and licence shown).',
   'https://www.wikidata.org/wiki/Property:P938', interval '30 days')
on conflict (key) do nothing;

-- BC observations: stage the common name next to the code.
alter table private.observation_staging add column if not exists name text;

create or replace function public.stage_observations(p_source text, p_rows jsonb)
returns integer language sql set search_path = '' as $$
  with i as (
  insert into private.observation_staging as o (source, key_type, key_value, alias_type, alias, name, n, first_obs, last_obs)
  select p_source, r->>'key_type', r->>'key_value', r->>'alias_type', r->>'alias', r->>'name', (r->>'n')::int,
         (r->>'first')::date, (r->>'last')::date
  from jsonb_array_elements(p_rows) r
  on conflict (source, key_type, key_value, alias_type, alias) do update set
    n = o.n + excluded.n,
    name = coalesce(o.name, excluded.name),
    first_obs = least(o.first_obs, excluded.first_obs),
    last_obs = greatest(o.last_obs, excluded.last_obs)
  returning 1)
  select count(*)::int from i;
$$;

create or replace function public.finalize_observations(p_source text)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  create temp table _ws on commit drop as
  select k.waterbody_id, coalesce(a.species_id, s.id) as species_id, sum(o.n)::int as observations,
         min(o.first_obs) as first_observed, max(o.last_obs) as last_observed
  from private.observation_staging o
  join public.waterbody_keys k on k.key_type = o.key_type and k.key_value = o.key_value
  left join public.species_aliases a on a.alias_type = o.alias_type and a.alias = o.alias
  left join lateral (
    select sp.id from public.species sp
    where a.species_id is null and o.name is not null and lower(sp.common_name) = lower(o.name)
    order by sp.dex_no limit 1
  ) s on true
  where o.source = p_source and coalesce(a.species_id, s.id) is not null
  group by 1, 2;

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
