-- MUR masks inland lakes, so it is used for sea surface temperature on saltwater catches.
update public.data_sources set
  name = 'Sea surface temperature (NASA JPL MUR)',
  attribution = 'Sea surface temperature: JPL MUR SST v4.1, NASA PO.DAAC, via NOAA CoastWatch ERDDAP.',
  used_for = 'Sea temperature at catch time',
  enabled = false  -- attribution row only; looked up per catch by catch-conditions
where key = 'mur-sst';
comment on column public.catches.conditions is
  'Server-computed at catch time: { tide?, water?, sea_temp?, pending?[] }. Written only by the catch-conditions adapter.';
