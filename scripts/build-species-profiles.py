"""Builds the species_profiles data migration (rich species content for the Dex / species pages).

Sources and licences:
  - FishBase v26.06 (Froese & Pauly, eds.), CC BY-NC 4.0 (non-commercial). Parquet tables from
    https://data.source.coop/cboettig/fishbase/fb/v26.06/parquet/<table>.parquet
    Used: species, ecology, estimate, spawning, morphdat, fooditems, country, stocks.
  - Wikidata (CC0): P938 = FishBase species ID -> item, P18 image, English Wikipedia sitelink.
  - Wikipedia (CC BY-SA 4.0): lead summary via https://en.wikipedia.org/api/rest_v1/page/summary/<title>.
    Attribution = link to the article (summary_url).
  - Wikimedia Commons (per-file free licences): image + thumbnail URLs, author, licence, file page.

Usage:
  python build-species-profiles.py <fishbase_parquet_dir> <out.sql>      (requires duckdb)

Species IDs and FishBase IDs are read from supabase/migrations/20261110030000_species_canada.sql.
"""
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import duckdb

FB_DIR = Path(sys.argv[1])
OUT = Path(sys.argv[2])
REPO = Path(__file__).resolve().parent.parent
SEED = REPO / 'supabase/migrations/20261110030000_species_canada.sql'
UA = 'CatchLog/0.1 (hobby, non-commercial; species profile builder)'

# ── species ids ────────────────────────────────────────────────────────────
def sql_tuple(line):
    """Split one '(v1, v2, ...)' VALUES row into Python values (strings, numbers, None, booleans)."""
    s = line.strip().rstrip(',').rstrip(';')
    s = s[1:-1] if s.startswith('(') and s.endswith(')') else s
    vals, i = [], 0
    while i < len(s):
        if s[i] == "'":
            j, buf = i + 1, []
            while True:
                if s[j] == "'" and j + 1 < len(s) and s[j + 1] == "'":
                    buf.append("'"); j += 2
                elif s[j] == "'":
                    break
                else:
                    buf.append(s[j]); j += 1
            vals.append(''.join(buf)); i = j + 1
        else:
            j = s.find(',', i)
            j = len(s) if j == -1 else j
            tok = s[i:j].strip()
            vals.append(None if tok == 'null' else True if tok == 'true' else False if tok == 'false' else tok)
            i = j
        while i < len(s) and s[i] in ', ':
            i += 1
    return vals


species, game = {}, set()
seed_text = SEED.read_text()
header_m = re.search(r'insert into public\.species \(([^)]+)\) values', seed_text)
assert header_m, 'species seed insert not found'
header = header_m.group(1)
cols = [c.strip() for c in header.split(',')]
for line in seed_text.splitlines():
    if line.startswith("  ('"):
        v = dict(zip(cols, sql_tuple(line)))
        species[v['id']] = int(v['fishbase_id']) if v.get('fishbase_id') else None
        if v.get('game_fish') is True:
            game.add(v['id'])
print(f'{len(species)} species, {sum(1 for v in species.values() if v)} with FishBase ids', file=sys.stderr)


# ── helpers ────────────────────────────────────────────────────────────────
def clean(text, limit=None):
    if text is None:
        return None
    t = html.unescape(str(text))
    t = re.sub(r'<[^>]+>', '', t)
    t = re.sub(r'\s*\(Ref\.?\s*[\d,\s]+\)', '', t)          # FishBase citations
    t = re.sub(r'\s*\[[^\]]*\]', '', t) if limit and 'Ref' in t else t
    t = re.sub(r'\s+', ' ', t).strip()
    if not t:
        return None
    if limit and len(t) > limit:
        cut = t[:limit]
        dot = cut.rfind('. ')
        t = (cut[: dot + 1] if dot > limit * 0.5 else cut.rstrip() + '…')
    return t


def http_json(url, data=None, tries=6):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                retry_after = e.headers.get('Retry-After')
                wait = int(retry_after) if retry_after and retry_after.isdigit() else 2 ** attempt * 2
                if e.code == 429:
                    wait = max(wait, 65)  # WDQS may limit to 1 request/minute
                time.sleep(wait)
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt < tries - 1:
                time.sleep(2 ** attempt * 2)
                continue
            raise
    return None


# ── FishBase ───────────────────────────────────────────────────────────────
con = duckdb.connect()
P = lambda t: f"'{FB_DIR}/{t}.parquet'"
codes = sorted({v for v in species.values() if v})
con.execute('create table ids (code integer)')
con.executemany('insert into ids values (?)', [[c] for c in codes])


def by_code(sql):
    return {r[0]: r[1:] for r in con.execute(sql).fetchall()}


fb_species = by_code(f"""select SpecCode, Comments, DemersPelag, AnaCat, DepthRangeShallow, DepthRangeDeep, Weight, LongevityWild
  from {P('species')} where SpecCode in (select code from ids)""")
fb_estimate = by_code(f"""select SpecCode, TempPrefMin, TempPrefMax, ComDepthMin, ComDepthMax
  from {P('estimate')} where SpecCode in (select code from ids)""")
fb_ecology = by_code(f"""select SpecCode, first(FeedingType order by FeedingType nulls last)
  from {P('ecology')} where SpecCode in (select code from ids) group by SpecCode""")
fb_morph = by_code(f"""select Speccode, first(AddChars order by length(AddChars) desc nulls last)
  from {P('morphdat')} where Speccode in (select code from ids) and AddChars is not null group by Speccode""")
fb_iucn = by_code(f"""select SpecCode, first(IUCN_Code order by IUCN_Code nulls last)
  from {P('stocks')} where SpecCode in (select code from ids) and IUCN_Code is not null group by SpecCode""")
fb_country = by_code(f"""select SpecCode, first(Status), first(Comments order by length(Comments) desc nulls last)
  from {P('country')} where C_Code = '124' and SpecCode in (select code from ids) group by SpecCode""")

MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
spawn_rows = con.execute(f"""select SpecCode, C_Code, {', '.join(MONTHS)} from {P('spawning')}
  where SpecCode in (select code from ids)""").fetchall()
spawning = {}
for code, c_code, *flags in spawn_rows:
    months = {i + 1 for i, v in enumerate(flags) if v is not None and v > 0}
    if not months:
        continue
    entry = spawning.setdefault(code, {'ca': set(), 'any': set()})
    entry['ca' if c_code == '124' else 'any'] |= months

FOOD_NAMES = {
    'benth. crust.': 'benthic crustaceans', 'plank. crust.': 'planktonic crustaceans', 'finfish': 'fish',
    'insects': 'insects', 'mollusks': 'molluscs', 'other plants': 'plants', 'worms': 'worms',
    'phytoplankton': 'phytoplankton', 'zooplankton': 'zooplankton', 'cephalopods': 'squid & octopus',
    'n.a./other benth. invert.': 'other bottom invertebrates', 'other plank. invertebrates': 'plankton invertebrates',
    'fish (early stages)': 'fish eggs & larvae', 'detritus': 'detritus', 'bacteria': 'bacteria',
}
food_rows = con.execute(f"""select SpecCode, FoodII, count(*) n from {P('fooditems')}
  where SpecCode in (select code from ids) and FoodII is not null group by 1, 2 order by 1, 3 desc""").fetchall()
diet = {}
for code, food, _ in food_rows:
    name = FOOD_NAMES.get(food, food.replace('n.a./', '').replace('.', ''))
    lst = diet.setdefault(code, [])
    if name not in lst and len(lst) < 5:
        lst.append(name)

# ── Wikidata ───────────────────────────────────────────────────────────────
wd = {}
fb_ids = [str(c) for c in codes]
for i in range(0, len(fb_ids), 1500):  # one POST for all ids (WDQS can be rate-limited to 1 req/min)
    vals = ' '.join(f'"{c}"' for c in fb_ids[i:i + 1500])
    query = f"""SELECT ?fb ?item ?img ?en WHERE {{ VALUES ?fb {{ {vals} }} ?item wdt:P938 ?fb .
      OPTIONAL {{ ?item wdt:P18 ?img }}
      OPTIONAL {{ ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> }} }}"""
    res = http_json('https://query.wikidata.org/sparql?format=json',
                    data=urllib.parse.urlencode({'query': query}).encode()) or {'results': {'bindings': []}}
    for b in res['results']['bindings']:
        fb = int(b['fb']['value'])
        e = wd.setdefault(fb, {})
        e.setdefault('item', b['item']['value'].rsplit('/', 1)[-1])
        if 'img' in b and 'img' not in e:
            e['img'] = urllib.parse.unquote(b['img']['value'].rsplit('/', 1)[-1])
        if 'en' in b and 'en' not in e:
            e['en'] = urllib.parse.unquote(b['en']['value'].rsplit('/', 1)[-1])
    time.sleep(1)
print(f'wikidata: {len(wd)} items', file=sys.stderr)

# ── Commons image info (batched) ───────────────────────────────────────────
files = sorted({e['img'] for e in wd.values() if 'img' in e})
commons = {}
for i in range(0, len(files), 50):
    titles = '|'.join('File:' + f for f in files[i:i + 50])
    url = ('https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo'
           '&iiprop=url|extmetadata&iiurlwidth=480&titles=' + urllib.parse.quote(titles))
    res = http_json(url) or {'query': {'pages': []}}
    norm = {n['to']: n['from'] for n in res['query'].get('normalized', [])}
    for page in res['query']['pages']:
        info = (page.get('imageinfo') or [None])[0]
        if not info:
            continue
        meta = info.get('extmetadata', {})
        title = norm.get(page['title'], page['title'])
        commons[title.split(':', 1)[1].replace('_', ' ')] = {
            'url': info.get('url'),
            'thumb': info.get('thumburl') or info.get('url'),
            'page': info.get('descriptionurl'),
            'author': clean((meta.get('Artist') or {}).get('value'), 200),
            'license': clean((meta.get('LicenseShortName') or {}).get('value'), 60),
        }
    time.sleep(0.3)
print(f'commons: {len(commons)} images', file=sys.stderr)

# ── Wikipedia summaries (batched: 20 titles per request) ─────────────────
summaries = {}
titles = {fb: e['en'] for fb, e in wd.items() if 'en' in e}
items = list(titles.items())
for i in range(0, len(items), 20):
    chunk = items[i:i + 20]
    params = urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'formatversion': 2, 'redirects': 1,
        'prop': 'extracts|info|pageprops', 'exintro': 1, 'explaintext': 1, 'exlimit': 'max',
        'inprop': 'url', 'ppprop': 'disambiguation', 'titles': '|'.join(t for _, t in chunk)})
    res = http_json('https://en.wikipedia.org/w/api.php?' + params) or {}
    q_ = res.get('query', {})
    alias = {}
    for m in q_.get('normalized', []) + q_.get('redirects', []):
        alias[m['from']] = m['to']
    pages = {pg['title']: pg for pg in q_.get('pages', [])}
    for fb, title in chunk:
        t = title
        for _ in range(3):
            t = alias.get(t, t)
        pg = pages.get(t)
        if pg and pg.get('extract') and 'disambiguation' not in (pg.get('pageprops') or {}):
            summaries[fb] = (clean(pg['extract'], 700), pg.get('fullurl'))
    time.sleep(0.5)
    print(f'wikipedia {i + len(chunk)}/{len(items)}', file=sys.stderr)


# ── assemble ───────────────────────────────────────────────────────────────
def num(v, cast=float):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return cast(round(f)) if cast is int else round(f, 2)


COLS = ['species_id', 'summary', 'summary_url', 'habitat', 'environment', 'migration', 'depth_min_m', 'depth_max_m',
        'temp_pref_min_c', 'temp_pref_max_c', 'spawning_months', 'feeding', 'diet', 'id_features', 'max_weight_g',
        'longevity_years', 'iucn_status', 'canada_status', 'canada_notes', 'image_url', 'image_thumb_url',
        'image_author', 'image_license', 'image_page_url', 'wikidata_id']

rows = []
for sid, fb in species.items():
    r = dict.fromkeys(COLS)
    r['species_id'] = sid
    if fb:
        sp = fb_species.get(fb)
        if sp:
            comments, demers, anacat, dmin, dmax, weight, longevity = sp
            r['habitat'] = clean(comments, 900)
            r['environment'] = clean(demers)
            r['migration'] = clean(anacat)
            r['depth_min_m'], r['depth_max_m'] = num(dmin, int), num(dmax, int)
            r['max_weight_g'] = num(weight, int)
            r['longevity_years'] = num(longevity)
        est = fb_estimate.get(fb)
        if est:
            tmin, tmax, cmin, cmax = est
            r['temp_pref_min_c'], r['temp_pref_max_c'] = num(tmin), num(tmax)
            if r['depth_min_m'] is None and r['depth_max_m'] is None:
                r['depth_min_m'], r['depth_max_m'] = num(cmin, int), num(cmax, int)
        if fb in spawning:
            months = spawning[fb]['ca'] or spawning[fb]['any']
            r['spawning_months'] = sorted(months)
        if fb in fb_ecology:
            r['feeding'] = clean(fb_ecology[fb][0])
        if fb in diet:
            r['diet'] = clean(', '.join(diet[fb]), 200)
        if fb in fb_morph:
            r['id_features'] = clean(fb_morph[fb][0], 400)
        if fb in fb_iucn:
            r['iucn_status'] = clean(fb_iucn[fb][0])
        if fb in fb_country:
            status, notes = fb_country[fb]
            r['canada_status'] = clean(status)
            r['canada_notes'] = clean(notes, 400)
        e = wd.get(fb, {})
        r['wikidata_id'] = e.get('item')
        if fb in summaries:
            r['summary'], r['summary_url'] = summaries[fb]
        img = commons.get(e.get('img', '').replace('_', ' ')) if e.get('img') else None
        if img and img['url']:
            r['image_url'], r['image_thumb_url'], r['image_page_url'] = img['url'], img['thumb'], img['page']
            r['image_author'], r['image_license'] = img['author'], img['license']
    rows.append(r)


def q(v):
    if v is None:
        return 'null'
    if isinstance(v, list):
        return "'{" + ','.join(str(x) for x in v) + "}'"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


with OUT.open('w', encoding='utf-8') as out:
    out.write('-- Species profiles (Dex / species pages). Generated by scripts/build-species-profiles.py; do not edit.\n')
    out.write('-- FishBase v26.06 (Froese & Pauly, eds.), CC BY-NC 4.0 | Wikipedia summaries CC BY-SA 4.0 (link: summary_url)\n')
    out.write('-- Wikidata CC0 | Wikimedia Commons images: per-file licence + author in image_license / image_author.\n\n')
    for i in range(0, len(rows), 200):
        batch = rows[i:i + 200]
        out.write(f"insert into public.species_profiles ({', '.join(COLS)}) values\n")
        out.write(',\n'.join('  (' + ', '.join(q(r[c]) for c in COLS) + ')' for r in batch))
        out.write('\non conflict (species_id) do update set ' + ', '.join(f'{c} = excluded.{c}' for c in COLS[1:]) + ';\n\n')

cov = {c: sum(1 for r in rows if r[c] not in (None, [])) for c in COLS}
cov_game = {c: sum(1 for r in rows if r['species_id'] in game and r[c] not in (None, [])) for c in COLS}
print(json.dumps({'rows': len(rows), 'game_fish': len(game), 'coverage': cov, 'coverage_game': cov_game}, indent=1))
