-- Covering indexes for foreign keys (performance advisor): cascades from water_stations/species stay fast.
create index if not exists lake_stations_station_idx on public.lake_stations (station_number);
create index if not exists species_aliases_species_idx on public.species_aliases (species_id);
