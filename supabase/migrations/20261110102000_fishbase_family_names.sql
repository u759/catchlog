-- Dex groups come from FishBase's family common names (families.CommonName via species.FamCode) instead of a
-- hand-made family list.
alter table public.species add column if not exists family_common text;
comment on column public.species.family_common is 'FishBase family common name, e.g. Salmonids. Refreshed by the fishbase adapter.';

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
      game_fish = (n.new).game_fish, family_common = (n.new).family_common
    from n where s.id = n.id and n.new is distinct from n.old
    returning 1)
  select count(*)::int from u;
$$;

-- Re-process the current FishBase release now (the adapter's REV changed).
update public.data_sources set last_success_at = now() - interval '31 days' where key = 'fishbase';
