"""Builds the Canadian species seed migration from public datasets.

Sources (download into one directory, pass it as argv[1]):
  - Wild Species 2020, Canadian Endangered Species Conservation Council (2022). Fish rows of the
    "Ranks - Rangs" sheet exported to ws_fish.csv. Workbook:
    https://www.canada.ca/content/dam/eccc/documents/pdf/lep-sara/Wild%20Species%202020%20Data%20-%20Esp%C3%A8ces%20sauvages%202020%20Donn%C3%A9es.xlsx
  - FishBase v26.06 (CC BY-NC 4.0), saved as fb_<table>.parquet:
    https://data.source.coop/cboettig/fishbase/fb/v26.06/parquet/{species,estimate,comnames,synonyms}.parquet

Usage: python build-species-seed.py <data_dir> <out.sql>   (requires duckdb)
"""
import csv
import math
import re
import sys
import unicodedata

import duckdb

data_dir, out_path = sys.argv[1], sys.argv[2]
REGIONS = ['YT', 'NT', 'NU', 'BC', 'AB', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'LB', 'NF', 'PAC', 'WAO', 'EAO', 'ATL']

# Slugs from the original seed, kept stable for existing catches.
LEGACY_IDS = {
    'Micropterus salmoides': 'largemouth-bass', 'Micropterus dolomieu': 'smallmouth-bass',
    'Micropterus punctulatus': 'spotted-bass', 'Morone saxatilis': 'striped-bass', 'Morone chrysops': 'white-bass',
    'Lepomis macrochirus': 'bluegill', 'Lepomis microlophus': 'redear-sunfish', 'Lepomis cyanellus': 'green-sunfish',
    'Pomoxis nigromaculatus': 'black-crappie', 'Pomoxis annularis': 'white-crappie',
    'Oncorhynchus mykiss': 'rainbow-trout', 'Salmo trutta': 'brown-trout', 'Salvelinus fontinalis': 'brook-trout',
    'Oncorhynchus clarkii': 'cutthroat-trout', 'Esox lucius': 'northern-pike', 'Esox masquinongy': 'muskellunge',
    'Esox niger': 'chain-pickerel', 'Sander vitreus': 'walleye', 'Perca flavescens': 'yellow-perch',
    'Ictalurus punctatus': 'channel-catfish', 'Ictalurus furcatus': 'blue-catfish', 'Pylodictis olivaris': 'flathead-catfish',
    'Cyprinus carpio': 'common-carp', 'Aplodinotus grunniens': 'freshwater-drum',
}

SCHEMA = """
alter table public.species rename column ws_a to lw_a;
alter table public.species rename column ws_b to lw_b;
comment on column public.species.lw_a is 'log10(W g) = lw_a + lw_b * log10(total length mm). From FishBase Bayesian LWR estimates.';
alter table public.species
  add column common_name_fr    text,
  add column order_name        text,
  add column fishbase_id       integer,
  add column lw_method         text,
  add column max_length_mm     integer,
  add column freshwater        boolean,
  add column brackish          boolean,
  add column saltwater         boolean,
  add column game_fish         boolean not null default false,
  add column in_canada         boolean not null default false,
  add column native_to_canada  boolean,
  add column regions           text[] not null default '{}',
  add column wild_species_code text unique,
  add column national_rank     text;
comment on column public.species.regions is 'Wild Species 2020 regions: provinces/territories (NF = Newfoundland, LB = Labrador) and oceans PAC, WAO, EAO, ATL.';
create index species_regions_idx on public.species using gin (regions);

"""

con = duckdb.connect()
P = lambda t: f"'{data_dir}/fb_{t}.parquet'"

rows = list(csv.reader(open(f'{data_dir}/ws_fish.csv', encoding='utf-8')))
col = {h: i for i, h in enumerate(rows[0])}
ws = {}
for r in rows[1:]:
    sci = ' '.join(r[col['SCIENTIFIC NAME - NOM SCIENTIFIQUE']].split())
    ws[sci] = {
        'code': r[col['CODE - CODE']], 'order': r[col['ORDER - ORDRE']] or None, 'family': r[col['FAMILY - FAMILLE']] or None,
        'rank': r[col['CA']] or None, 'native': r[col['CA-ORG']] == 'NAT',
        'regions': [reg for reg in REGIONS if r[col[reg]].strip()],
    }

names = list(ws) + [s for s in LEGACY_IDS if s not in ws]
con.execute('create table names (sci text)')
con.executemany('insert into names values (?)', [[s] for s in names])

# Resolve FishBase SpecCode: current valid name, else an unambiguous synonym.
con.execute(f"""
create table resolved as
with exact as (
  select n.sci, s.SpecCode from names n join {P('species')} s on s.Genus || ' ' || s.Species = n.sci
),
syn as (
  select n.sci, min(y.SpecCode) SpecCode from names n
  join {P('synonyms')} y on y.SynGenus || ' ' || y.SynSpecies = n.sci
  where n.sci not in (select sci from exact)
  group by n.sci having count(distinct y.SpecCode) = 1
)
select * from exact union all select * from syn
""")

# Common names. Official AFS names (Canada/US/Mexico list, NameType 'AFS') win; then Canadian
# names by FishBase rank. English falls back to FishBase's FBname before Canadian vernaculars.
fb = {r[0]: r[1:] for r in con.execute(f"""
with ranked as (
  select SpecCode, Language, ComName, NameType, C_Code,
         row_number() over (partition by SpecCode, Language
           order by (NameType = 'AFS') desc, (C_Code = '124') desc, Rank nulls last, PreferredName desc nulls last, length(ComName)) rn
  from {P('comnames')}
  where Language in ('English', 'French') and (C_Code = '124' or NameType = 'AFS')
)
select r.sci, s.SpecCode, s.FBname, s.Fresh, s.Brack, s.Saltwater, s.GameFish,
       e.a, e.b, e.Method_ab, e.MaxLengthTL,
       (select ComName from ranked x where x.SpecCode = s.SpecCode and Language = 'English' and rn = 1 and NameType = 'AFS'),
       (select ComName from ranked x where x.SpecCode = s.SpecCode and Language = 'French' and rn = 1)
from resolved r join {P('species')} s using (SpecCode) left join {P('estimate')} e using (SpecCode)
""").fetchall()}


def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def title(s):
    return ' '.join(w[:1].upper() + w[1:] for w in s.split()) if s else None


def q(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, list):
        return "'{" + ','.join(v) + "}'"
    return "'" + str(v).replace("'", "''") + "'"


records, used = [], set(LEGACY_IDS.values())
for sci in names:
    w, f = ws.get(sci), fb.get(sci)
    spec, fbname, fresh, brack, salt, game, a, b, method, maxlen, en_ca, fr_ca = f if f else (None,) * 12
    en = title(en_ca or fbname)
    fr = (fr_ca[:1].upper() + fr_ca[1:]) if fr_ca else None
    sid = LEGACY_IDS.get(sci)
    if not sid:
        base = slugify(en) if en else slugify(sci)
        sid = base if base not in used else f'{base}-{slugify(sci)}'
    used.add(sid)
    records.append({
        'id': sid,
        'common_name': en or sci,
        'common_name_fr': fr,
        'scientific_name': sci,
        'family': w['family'] if w else None,
        'order_name': w['order'] if w else None,
        'fishbase_id': spec,
        # FishBase: W(g) = a * TL(cm)^b  ->  log10 W = (log10 a - b) + b * log10 TL(mm)
        'lw_a': round(math.log10(a) - b, 5) if a and b else None,
        'lw_b': round(b, 4) if a and b else None,
        'lw_method': method,
        'max_length_mm': round(maxlen * 10) if maxlen else None,
        'freshwater': bool(fresh) if f else None,
        'brackish': bool(brack) if f else None,
        'saltwater': bool(salt) if f else None,
        'game_fish': bool(game),
        'in_canada': w is not None,
        'native_to_canada': w['native'] if w else None,
        'regions': w['regions'] if w else [],
        'wild_species_code': w['code'] if w else None,
        'national_rank': w['rank'] if w else None,
    })

cols = list(records[0])
with open(out_path, 'w', encoding='utf-8') as out:
    out.write('-- Canadian fish species.\n')
    out.write('-- Sources: Canadian Endangered Species Conservation Council. 2022. Wild Species 2020: The General Status of\n')
    out.write('--   Species in Canada. National General Status Working Group.  |  FishBase v26.06 (Froese & Pauly, eds.), CC BY-NC 4.0.\n')
    out.write('-- Generated by scripts/build-species-seed.py. Do not edit by hand.\n')
    out.write(SCHEMA)
    out.write(f"insert into public.species ({', '.join(cols)}) values\n")
    out.write(',\n'.join('  (' + ', '.join(q(r[c]) for c in cols) + ')' for r in records))
    out.write('\non conflict (id) do update set ' + ', '.join(f'{c} = excluded.{c}' for c in cols if c != 'id') + ';\n\n')
    out.write("-- 'gar' was a family-level placeholder in the first seed; real gar species are listed now.\n")
    out.write("delete from public.species where id = 'gar' and not exists (select 1 from public.catches where species_id = 'gar');\n")

R = records
print(f"{len(R)} species | in Canada {sum(r['in_canada'] for r in R)} | FishBase match {sum(1 for r in R if r['fishbase_id'])} | "
      f"weight formula {sum(1 for r in R if r['lw_a'] is not None)} | French name {sum(1 for r in R if r['common_name_fr'])} | "
      f"no English name {sum(1 for r in R if r['common_name'] == r['scientific_name'])} | game fish {sum(r['game_fish'] for r in R)}")
