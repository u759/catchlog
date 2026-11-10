-- Species list version for clients: "<row count>:<latest updated_at>". Changes whenever a species is
-- added, removed or edited (updated_at is trigger-stamped). Clients skip the species sync entirely
-- when it matches what they have.
create or replace function public.species_version()
returns text language sql stable security invoker set search_path = '' as $$
  select count(*)::text || ':' || coalesce(max(updated_at)::text, '') from public.species;
$$;
revoke all on function public.species_version() from public, anon;
grant execute on function public.species_version() to authenticated;
