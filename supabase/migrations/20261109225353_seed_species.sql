-- Common North American freshwater species.
-- ws_a / ws_b: standard-weight (Ws) equation, metric form: log10(W g) = ws_a + ws_b * log10(TL mm).
-- Values follow published Ws equations (see Neumann, Guy & Willis 2012 for the compilation);
-- spotted/striped bass, redear, muskie and blue/flathead catfish are approximate and were only
-- sanity-checked against typical length/weight tables, so verify those if accuracy matters.
-- Ws is a "typical healthy fish" weight, so the app always labels it an estimate.
-- Null coefficients = no estimate offered; add/tune any time.
insert into public.species (id, common_name, scientific_name, family, ws_a, ws_b) values
  ('largemouth-bass',  'Largemouth Bass',  'Micropterus salmoides',    'Centrarchidae', -5.528, 3.273),
  ('smallmouth-bass',  'Smallmouth Bass',  'Micropterus dolomieu',     'Centrarchidae', -5.329, 3.200),
  ('spotted-bass',     'Spotted Bass',     'Micropterus punctulatus',  'Centrarchidae', -5.392, 3.215),
  ('striped-bass',     'Striped Bass',     'Morone saxatilis',         'Moronidae',     -5.201, 3.139),
  ('white-bass',       'White Bass',       'Morone chrysops',          'Moronidae',     null,   null),
  ('bluegill',         'Bluegill Sunfish', 'Lepomis macrochirus',      'Centrarchidae', -5.374, 3.316),
  ('redear-sunfish',   'Redear Sunfish',   'Lepomis microlophus',      'Centrarchidae', -4.968, 3.119),
  ('green-sunfish',    'Green Sunfish',    'Lepomis cyanellus',        'Centrarchidae', null,   null),
  ('black-crappie',    'Black Crappie',    'Pomoxis nigromaculatus',   'Centrarchidae', -5.618, 3.345),
  ('white-crappie',    'White Crappie',    'Pomoxis annularis',        'Centrarchidae', -5.642, 3.332),
  ('rainbow-trout',    'Rainbow Trout',    'Oncorhynchus mykiss',      'Salmonidae',    -5.023, 3.024),
  ('brown-trout',      'Brown Trout',      'Salmo trutta',             'Salmonidae',    -4.867, 2.960),
  ('brook-trout',      'Brook Trout',      'Salvelinus fontinalis',    'Salmonidae',    -5.186, 3.103),
  ('cutthroat-trout',  'Cutthroat Trout',  'Oncorhynchus clarkii',     'Salmonidae',    null,   null),
  ('northern-pike',    'Northern Pike',    'Esox lucius',              'Esocidae',      -5.437, 3.096),
  ('muskellunge',      'Muskellunge',      'Esox masquinongy',         'Esocidae',      -5.910, 3.270),
  ('chain-pickerel',   'Chain Pickerel',   'Esox niger',               'Esocidae',      null,   null),
  ('walleye',          'Walleye',          'Sander vitreus',           'Percidae',      -5.453, 3.180),
  ('yellow-perch',     'Yellow Perch',     'Perca flavescens',         'Percidae',      -5.386, 3.230),
  ('channel-catfish',  'Channel Catfish',  'Ictalurus punctatus',      'Ictaluridae',   -5.800, 3.294),
  ('blue-catfish',     'Blue Catfish',     'Ictalurus furcatus',       'Ictaluridae',   -5.355, 3.186),
  ('flathead-catfish', 'Flathead Catfish', 'Pylodictis olivaris',      'Ictaluridae',   -5.542, 3.230),
  ('common-carp',      'Common Carp',      'Cyprinus carpio',          'Cyprinidae',    -4.639, 2.920),
  ('freshwater-drum',  'Freshwater Drum',  'Aplodinotus grunniens',    'Sciaenidae',    null,   null),
  ('gar',              'Gar',              'Lepisosteidae',            'Lepisosteidae', null,   null)
on conflict (id) do update set
  common_name = excluded.common_name,
  scientific_name = excluded.scientific_name,
  family = excluded.family,
  ws_a = excluded.ws_a,
  ws_b = excluded.ws_b;
