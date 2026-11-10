-- Some lakes are split into several source polygons (e.g. BC lakes crossing watershed-group
-- boundaries) that can arrive on different pages. Within one refresh run (p_run) pieces with the
-- same source_id are unioned; the first piece of a new run replaces the old geometry.
drop function public.upsert_waterbodies(text, text, jsonb);

-- Which source_ids have already received a piece in the current run (kept out of waterbodies so
-- a refresh with unchanged data doesn't touch rows clients sync).
create table private.waterbody_run_parts (
  source    text not null,
  source_id text not null,
  run       text not null,
  primary key (source, source_id)
);
grant all on private.waterbody_run_parts to service_role;

create function public.upsert_waterbodies(p_source text, p_region text, p_run text, p_rows jsonb)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  with src as (
    select r->>'source_id' as source_id,
           max(r->>'name') as name,
           coalesce(max(r->>'kind'), 'lake') as kind,
           sum((r->>'area_ha')::double precision) as area_ha,
           extensions.st_union(extensions.st_makevalid(
             extensions.st_setsrid(extensions.st_geomfromgeojson(r->'geometry'), 4326))) as g,
           (array_agg(r->'keys'))[1] as keys
    from jsonb_array_elements(p_rows) r
    group by r->>'source_id'
  ), simplified as (
    select s.*, extensions.st_multi(extensions.st_collectionextract(
             extensions.st_makevalid(extensions.st_simplifypreservetopology(s.g, 0.0001)), 3)) as sg
    from src s
  ), merged as (
    select s.source_id, s.name, s.kind, s.keys,
           case when rp.run = p_run then s.area_ha + coalesce(w.area_ha, 0) else s.area_ha end as area_ha,
           case when rp.run = p_run
                then extensions.st_multi(extensions.st_collectionextract(
                       extensions.st_union(w.geom::extensions.geometry, s.sg), 3))
                else s.sg end as g
    from simplified s
    left join public.waterbodies w on w.source = p_source and w.source_id = s.source_id
    left join private.waterbody_run_parts rp on rp.source = p_source and rp.source_id = s.source_id
    where s.sg is not null and not extensions.st_isempty(s.sg)
  ), up as (
    insert into public.waterbodies as w (source, source_id, region, kind, name, area_ha, lat, lng, bbox, geom, attributes)
    select p_source, m.source_id, p_region, m.kind, m.name, m.area_ha,
           extensions.st_y(extensions.st_pointonsurface(m.g)), extensions.st_x(extensions.st_pointonsurface(m.g)),
           array[extensions.st_xmin(m.g), extensions.st_ymin(m.g), extensions.st_xmax(m.g), extensions.st_ymax(m.g)],
           m.g::extensions.geography,
           jsonb_build_object('geom_md5', md5(extensions.st_asbinary(m.g)))
    from merged m
    on conflict (source, source_id) do update set
      name = excluded.name, kind = excluded.kind, area_ha = excluded.area_ha, lat = excluded.lat, lng = excluded.lng,
      bbox = excluded.bbox, geom = excluded.geom, attributes = w.attributes || excluded.attributes
    where (w.name, w.kind, round(w.area_ha::numeric, 2), w.attributes->>'geom_md5')
          is distinct from (excluded.name, excluded.kind, round(excluded.area_ha::numeric, 2), excluded.attributes->>'geom_md5')
    returning 1
  )
  select count(*) into n from up;

  insert into private.waterbody_run_parts (source, source_id, run)
  select distinct p_source, r->>'source_id', p_run from jsonb_array_elements(p_rows) r
  on conflict (source, source_id) do update set run = excluded.run;

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
revoke all on function public.upsert_waterbodies(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_waterbodies(text, text, text, jsonb) to service_role;
