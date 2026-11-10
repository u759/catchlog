// FishBase (CC BY-NC 4.0), region-agnostic. Parquet releases published at data.source.coop/cboettig/fishbase.
// Monthly check: when a new release (or a new REV of this file) appears, refresh species and profile
// fields from it. Linked only by FishBase's own species ID (species.fishbase_id = SpecCode).
import { parquetReadObjects } from 'npm:hyparquet@1.33.0';
import { compressors } from 'npm:hyparquet-compressors@1.1.3';

import { type Adapter, clean, fetchWithRetry, rpc, speciesWithFishbase } from './types.ts';

/** Bump when the processing below changes, so the next monthly check re-processes the current release. */
const REV = 2;
const BASE = 'https://data.source.coop/cboettig/fishbase';
const PHASES = ['check', 'core', 'names', 'traits', 'spawning-diet', 'synonyms'] as const;

type Row = Record<string, unknown>;
const int = (v: unknown) => (v == null ? null : Number(v));
const flag = (v: unknown) => v != null && Number(v) !== 0;

/** Python-style round (half to even), used so values match the original seed exactly. */
function round(x: number, digits = 0): number {
  const m = 10 ** digits;
  const v = x * m;
  const r = Math.round(v);
  return (Math.abs(v - Math.trunc(v)) === 0.5 ? 2 * Math.round(v / 2) : r) / m;
}
const num = (v: unknown, isInt = false) => {
  if (v == null) return null;
  const f = Number(v);
  return Number.isFinite(f) ? (isInt ? round(f) : round(f, 2)) : null;
};

async function latestRelease(): Promise<string> {
  const xml = await (await fetchWithRetry(`${BASE}/?list-type=2&prefix=fb/&delimiter=/`)).text();
  const versions = [...xml.matchAll(/fb\/(v\d+\.\d+)\//g)].map((m) => m[1]);
  if (!versions.length) throw new Error('no FishBase releases listed');
  const key = (v: string) => v.slice(1).split('.').map(Number).reduce((a, b) => a * 100 + b, 0);
  return versions.sort((a, b) => key(b) - key(a))[0];
}

async function table(release: string, name: string, columns: string[]): Promise<Row[]> {
  const res = await fetchWithRetry(`${BASE}/fb/${release}/parquet/${name}.parquet`);
  const file = await res.arrayBuffer();
  return (await parquetReadObjects({ file, columns, compressors })) as Row[];
}

/** Group rows by SpecCode, keeping only our species. */
function bySpec(rows: Row[], codes: Set<number>, col = 'SpecCode'): Map<number, Row[]> {
  const out = new Map<number, Row[]>();
  for (const r of rows) {
    const c = int(r[col]);
    if (c == null || !codes.has(c)) continue;
    (out.get(c) ?? out.set(c, []).get(c)!).push(r);
  }
  return out;
}

const titleCase = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const FOOD_NAMES: Record<string, string> = {
  'benth. crust.': 'benthic crustaceans', 'plank. crust.': 'planktonic crustaceans', finfish: 'fish',
  insects: 'insects', mollusks: 'molluscs', 'other plants': 'plants', worms: 'worms', phytoplankton: 'phytoplankton',
  zooplankton: 'zooplankton', cephalopods: 'squid & octopus', 'n.a./other benth. invert.': 'other bottom invertebrates',
  'other plank. invertebrates': 'plankton invertebrates', 'fish (early stages)': 'fish eggs & larvae',
  detritus: 'detritus', bacteria: 'bacteria',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SYNONYM_STATUSES = new Set(['accepted name', 'synonym', 'provisionally accepted name']);

export const fishbase: Adapter = {
  key: 'fishbase',
  async step(db, state, ctx) {
    const phase = (state.phase as (typeof PHASES)[number]) ?? 'check';
    const release = state.release as string;
    const next = (changed: number) => {
      const i = PHASES.indexOf(phase) + 1;
      const total = ((state.changed as number) ?? 0) + changed;
      if (i === PHASES.length) return { state: {}, done: true, rows: total, version: state.target as string };
      return { state: { ...state, phase: PHASES[i], changed: total }, done: false, rows: 0, yield: true };
    };

    if (phase === 'check') {
      const latest = await latestRelease();
      const target = `${latest}+r${REV}`;
      if (ctx.version === target) return { state: {}, done: true, rows: 0, version: target };
      return { state: { phase: 'core', release: latest, target, changed: 0 }, done: false, rows: 0 };
    }

    const species = await speciesWithFishbase(db);
    const codes = new Set(species.map((s) => s.fishbase_id));
    const idsFor = new Map<number, string[]>();
    for (const s of species) (idsFor.get(s.fishbase_id) ?? idsFor.set(s.fishbase_id, []).get(s.fishbase_id)!).push(s.id);

    if (phase === 'core') {
      const sp = bySpec(await table(release, 'species', ['SpecCode', 'Fresh', 'Brack', 'Saltwater', 'GameFish', 'Comments',
        'DemersPelag', 'AnaCat', 'DepthRangeShallow', 'DepthRangeDeep', 'Weight', 'LongevityWild']), codes);
      const est = bySpec(await table(release, 'estimate', ['SpecCode', 'a', 'b', 'Method_ab', 'MaxLengthTL', 'TempPrefMin',
        'TempPrefMax', 'ComDepthMin', 'ComDepthMax']), codes);
      const speciesRows = species.map((s) => {
        const f = sp.get(s.fishbase_id)?.[0];
        const e = est.get(s.fishbase_id)?.[0];
        const a = e?.a as number | null, b = e?.b as number | null;
        return {
          id: s.id,
          // FishBase: W(g) = a * TL(cm)^b  ->  log10 W = (log10 a - b) + b * log10 TL(mm)
          lw_a: a && b ? round(Math.log10(a) - b, 5) : null, lw_b: a && b ? round(b, 4) : null,
          lw_method: (e?.Method_ab as string) ?? null,
          max_length_mm: e?.MaxLengthTL ? round(Number(e.MaxLengthTL) * 10) : null,
          freshwater: f ? flag(f.Fresh) : null, brackish: f ? flag(f.Brack) : null,
          saltwater: f ? flag(f.Saltwater) : null, game_fish: flag(f?.GameFish),
        };
      });
      const profileRows = species.map((s) => {
        const f = sp.get(s.fishbase_id)?.[0];
        const e = est.get(s.fishbase_id)?.[0];
        let depthMin = num(f?.DepthRangeShallow, true), depthMax = num(f?.DepthRangeDeep, true);
        if (depthMin == null && depthMax == null) [depthMin, depthMax] = [num(e?.ComDepthMin, true), num(e?.ComDepthMax, true)];
        return {
          species_id: s.id, habitat: clean(f?.Comments, 900), environment: clean(f?.DemersPelag), migration: clean(f?.AnaCat),
          depth_min_m: depthMin, depth_max_m: depthMax, max_weight_g: num(f?.Weight, true),
          longevity_years: num(f?.LongevityWild), temp_pref_min_c: num(e?.TempPrefMin), temp_pref_max_c: num(e?.TempPrefMax),
        };
      });
      return next(await rpc(db, 'patch_species', { p_rows: speciesRows }) +
        await rpc(db, 'patch_species_profiles', { p_rows: profileRows }));
    }

    if (phase === 'names') {
      const fbName = bySpec(await table(release, 'species', ['SpecCode', 'FBname']), codes);
      const names = bySpec(await table(release, 'comnames', ['SpecCode', 'Language', 'ComName', 'NameType', 'C_Code',
        'Rank', 'PreferredName']), codes);
      // Official AFS names (Canada/US/Mexico list) first, then Canadian names by FishBase rank.
      const rank = (r: Row) => [r.NameType === 'AFS' ? 0 : 1, r.C_Code === '124' ? 0 : 1, int(r.Rank) ?? Infinity,
        -(int(r.PreferredName) ?? -Infinity), String(r.ComName).length];
      const cmp = (x: Row, y: Row) => {
        const a = rank(x), b = rank(y);
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
        return 0;
      };
      const top = (code: number, lang: string) => (names.get(code) ?? [])
        .filter((r) => r.Language === lang && r.ComName && (r.C_Code === '124' || r.NameType === 'AFS')).sort(cmp)[0];
      const rows = species.flatMap((s) => {
        const en = top(s.fishbase_id, 'English');
        const fr = top(s.fishbase_id, 'French');
        const english = en?.NameType === 'AFS' ? String(en.ComName) : (fbName.get(s.fishbase_id)?.[0]?.FBname as string | null);
        const french = fr ? String(fr.ComName) : null;
        return english == null ? [{ id: s.id, common_name_fr: french && french[0].toUpperCase() + french.slice(1) }] : [{
          id: s.id, common_name: titleCase(english), common_name_fr: french && french[0].toUpperCase() + french.slice(1),
        }];
      });
      return next(await rpc(db, 'patch_species', { p_rows: rows }));
    }

    if (phase === 'traits') {
      const eco = bySpec(await table(release, 'ecology', ['SpecCode', 'FeedingType']), codes);
      const morph = bySpec(await table(release, 'morphdat', ['Speccode', 'AddChars']), codes, 'Speccode');
      const stocks = bySpec(await table(release, 'stocks', ['SpecCode', 'IUCN_Code']), codes);
      const country = bySpec((await table(release, 'country', ['SpecCode', 'C_Code', 'Status', 'Comments']))
        .filter((r) => r.C_Code === '124'), codes);
      const minStr = (rows: Row[] | undefined, col: string) =>
        (rows ?? []).map((r) => r[col] as string | null).filter((v): v is string => v != null).sort()[0] ?? null;
      const longest = (rows: Row[] | undefined, col: string) =>
        (rows ?? []).map((r) => r[col] as string | null).filter((v): v is string => v != null)
          .sort((a, b) => b.length - a.length)[0] ?? null;
      const rows = species.map((s) => {
        const c = country.get(s.fishbase_id);
        return {
          species_id: s.id, feeding: clean(minStr(eco.get(s.fishbase_id), 'FeedingType')),
          id_features: clean(longest(morph.get(s.fishbase_id), 'AddChars'), 400),
          iucn_status: clean(minStr(stocks.get(s.fishbase_id), 'IUCN_Code')),
          canada_status: clean(c?.[0]?.Status), canada_notes: clean(longest(c, 'Comments'), 400),
        };
      });
      return next(await rpc(db, 'patch_species_profiles', { p_rows: rows }));
    }

    if (phase === 'spawning-diet') {
      const spawn = bySpec(await table(release, 'spawning', ['SpecCode', 'C_Code', ...MONTHS]), codes);
      const food = bySpec(await table(release, 'fooditems', ['SpecCode', 'FoodII']), codes);
      const rows = species.map((s) => {
        // Spawning months recorded in Canada; other countries' records only when Canada has none.
        const ca = new Set<number>(), other = new Set<number>();
        for (const r of spawn.get(s.fishbase_id) ?? []) {
          MONTHS.forEach((m, i) => {
            const v = r[m];
            if (v != null && Number(v) > 0) (r.C_Code === '124' ? ca : other).add(i + 1);
          });
        }
        const months = [...(ca.size ? ca : other)].sort((a, b) => a - b);
        // Diet: food categories by number of FishBase records, top 5.
        const counts = new Map<string, number>();
        for (const r of food.get(s.fishbase_id) ?? []) if (r.FoodII) counts.set(String(r.FoodII), (counts.get(String(r.FoodII)) ?? 0) + 1);
        const diet: string[] = [];
        for (const [f] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
          const name = FOOD_NAMES[f] ?? f.replace('n.a./', '').replaceAll('.', '');
          if (!diet.includes(name) && diet.length < 5) diet.push(name);
        }
        return { species_id: s.id, spawning_months: months.length ? months : null, diet: clean(diet.join(', '), 200) };
      });
      return next(await rpc(db, 'patch_species_profiles', { p_rows: rows }));
    }

    // synonyms: FishBase's own list of names for each species (accepted names + synonyms), used to look up
    // a species from a scientific name another source publishes (e.g. Fishial, BC fish codes).
    const syn = await table(release, 'synonyms', ['SynGenus', 'SynSpecies', 'SpecCode', 'Status']);
    const owners = new Map<string, Set<number>>();
    for (const r of syn) {
      if (!r.SynGenus || !r.SynSpecies || !SYNONYM_STATUSES.has(String(r.Status))) continue;
      const name = `${r.SynGenus} ${r.SynSpecies}`;
      (owners.get(name) ?? owners.set(name, new Set()).get(name)!).add(Number(r.SpecCode));
    }
    const rows: { alias: string; species_id: string }[] = [];
    for (const [name, specs] of owners) {
      if (specs.size !== 1) continue; // a name FishBase uses for two species identifies neither
      const [code] = specs;
      const ids = idsFor.get(code);
      if (ids?.length === 1) rows.push({ alias: name, species_id: ids[0] });
    }
    return next(await rpc(db, 'replace_species_aliases', { p_type: 'scientific', p_rows: rows }));
  },
};
