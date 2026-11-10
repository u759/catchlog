// British Columbia adapters. All sources are Open Government Licence – BC (see data_sources rows).
// Waterbodies are keyed across datasets by the BC 1:50K waterbody code ('bc-wsa50k').
import { parse as parseCsv } from 'jsr:@std/csv@1';

import { type Adapter, fetchWithRetry, rpc } from './types.ts';

const WFS = 'https://openmaps.gov.bc.ca/geo/pub/wfs';
const KEY_50K = 'bc-wsa50k';

function wfsUrl(params: Record<string, string>) {
  const q = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', ...params });
  return `${WFS}?${q}`;
}

const titleCase = (s: string | null | undefined) =>
  s ? s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()) : null;

/** Freshwater Atlas lakes: named lakes and all lakes ≥ 10 ha (~16.5k polygons). */
export const bcLakes: Adapter = {
  key: 'bc-fwa-lakes',
  async step(db, state) {
    const PAGE = 150;
    const start = (state.start as number) ?? 0;
    const run = state.run ?? new Date().toISOString();
    const res = await fetchWithRetry(
      wfsUrl({
        typeNames: 'pub:WHSE_BASEMAPPING.FWA_LAKES_POLY',
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        propertyName: 'WATERBODY_POLY_ID,WATERBODY_KEY,WATERBODY_KEY_GROUP_CODE_50K,GNIS_NAME_1,AREA_HA,GEOMETRY',
        CQL_FILTER: 'GNIS_NAME_1 IS NOT NULL OR AREA_HA >= 10',
        sortBy: 'WATERBODY_POLY_ID',
        startIndex: String(start),
        count: String(PAGE),
      }),
    );
    const fc = await res.json();
    const rows = (fc.features ?? []).map((f: { properties: Record<string, unknown>; geometry: unknown }) => ({
      source_id: String(f.properties.WATERBODY_KEY),
      name: titleCase(f.properties.GNIS_NAME_1 as string | null),
      kind: 'lake',
      area_ha: f.properties.AREA_HA,
      geometry: f.geometry,
      keys: { [KEY_50K]: f.properties.WATERBODY_KEY_GROUP_CODE_50K ?? null },
    }));
    const changed = rows.length
      ? await rpc(db, 'upsert_waterbodies', { p_source: 'bc-fwa-lakes', p_region: 'BC', p_run: run, p_rows: rows })
      : 0;
    const done = rows.length < PAGE;
    return { state: done ? {} : { run, start: start + PAGE }, done, rows: changed };
  },
};

/** FISS lake surveys: measured max/mean depth per lake (8.6k surveys). */
export const bcLakeSurveys: Adapter = {
  key: 'bc-lake-surveys',
  async step(db, state) {
    const PAGE = 5000;
    const start = (state.start as number) ?? 0;
    const res = await fetchWithRetry(
      wfsUrl({
        typeNames: 'pub:WHSE_FISH.FISS_LAKE_SURVEYS_SVW',
        outputFormat: 'csv',
        propertyName: 'WATERBODY_IDENTIFIER,MAXIMUM_DEPTH,MEAN_DEPTH',
        CQL_FILTER: 'MAXIMUM_DEPTH IS NOT NULL OR MEAN_DEPTH IS NOT NULL',
        sortBy: 'OBJECTID',
        startIndex: String(start),
        count: String(PAGE),
      }),
    );
    const records = parseCsv(await res.text(), { skipFirstRow: true }) as Record<string, string>[];
    const rows = records
      .filter((r) => r.WATERBODY_IDENTIFIER)
      .map((r) => ({
        key_type: KEY_50K,
        key_value: r.WATERBODY_IDENTIFIER,
        max_depth_m: r.MAXIMUM_DEPTH ? Number(r.MAXIMUM_DEPTH) : null,
        mean_depth_m: r.MEAN_DEPTH ? Number(r.MEAN_DEPTH) : null,
      }));
    const changed = rows.length ? await rpc(db, 'set_waterbody_depths', { p_rows: rows }) : 0;
    const done = records.length < PAGE;
    return { state: done ? {} : { start: start + PAGE }, done, rows: changed };
  },
};

/** Bathymetric Maps – Open: official depth-map PDFs per lake (~2.2k lakes). Single CSV. */
export const bcDepthMaps: Adapter = {
  key: 'bc-depth-maps',
  async step(db) {
    const url =
      'https://catalogue.data.gov.bc.ca/dataset/1427d389-cd21-4fe2-8ed9-282d9bdcb7e2/resource/d1d89c2e-1994-4f7d-a269-55b40e26067d/download/bathyopenreferencetableandmapsaug22_2023final.csv';
    const records = parseCsv(await (await fetchWithRetry(url)).text(), { skipFirstRow: true }) as Record<string, string>[];
    const rows = records
      .filter((r) => r.WATERBODY_IDENTIFIER_WSA_50K && r.PDF_FILE_URL)
      .map((r) => ({
        key_type: KEY_50K,
        key_value: r.WATERBODY_IDENTIFIER_WSA_50K.trim(),
        title: [titleCase(r.MAP_TITLE || r.GAZETTED_NAME), r.NUMBER_OF_MAP_SHEETS !== '1' ? `sheet ${r.SHEET_NO}` : null,
          r.DRAFT_DATE ? r.DRAFT_DATE.slice(0, 4) : null].filter(Boolean).join(' · '),
        url: r.PDF_FILE_URL.trim(),
      }));
    const changed = await rpc(db, 'set_waterbody_depth_maps', {
      p_source: 'bc-depth-maps',
      p_licence: 'Open Government Licence – British Columbia',
      p_rows: rows,
    });
    return { state: {}, done: true, rows: changed };
  },
};

/**
 * BC Lake Bathymetric Maps: which lakes have digital depth contours (26 lakes). Only the lake identifiers are read;
 * the contours are Access Only, so the phone fetches them straight from the WFS (src/features/map/contours.ts).
 */
export const bcLakeContours: Adapter = {
  key: 'bc-lake-contours',
  async step(db) {
    const res = await fetchWithRetry(
      wfsUrl({
        typeName: 'pub:WHSE_FISH.BATH_LAKE_BATHYMETRIC_SP',
        outputFormat: 'application/json',
        propertyName: 'LAKE_WSA_WATERBODY_IDENTIFIER',
      }),
    );
    const features = ((await res.json()) as { features: { properties: { LAKE_WSA_WATERBODY_IDENTIFIER: string | null } }[] })
      .features;
    const keys = [...new Set(features.map((f) => f.properties.LAKE_WSA_WATERBODY_IDENTIFIER?.trim()).filter(Boolean))];
    if (!keys.length) throw new Error('no lakes in the bathymetry layer');
    const changed = await rpc(db, 'set_waterbody_contours', { p_key_type: KEY_50K, p_keys: keys });
    return { state: {}, done: true, rows: changed };
  },
};

/** Known BC Fish Observations (lakes): which species have been recorded in each lake (~139k rows). */
export const bcFishObservations: Adapter = {
  key: 'bc-fish-observations',
  async step(db, state) {
    const PAGE = 10000;
    const start = (state.start as number) ?? 0;
    const res = await fetchWithRetry(
      wfsUrl({
        typeNames: 'pub:WHSE_FISH.FISS_FISH_OBSRVTN_PNT_SP',
        outputFormat: 'csv',
        propertyName: 'WATERBODY_IDENTIFIER,SPECIES_CODE,OBSERVATION_DATE',
        CQL_FILTER: "WATERBODY_TYPE='Lake'",
        sortBy: 'OBJECTID',
        startIndex: String(start),
        count: String(PAGE),
      }),
    );
    const records = parseCsv(await res.text(), { skipFirstRow: true }) as Record<string, string>[];
    // Aggregate this page to (lake, species) before sending.
    const agg = new Map<string, { key_value: string; alias: string; n: number; first: string | null; last: string | null }>();
    for (const r of records) {
      const lake = r.WATERBODY_IDENTIFIER?.trim();
      const code = r.SPECIES_CODE?.trim();
      if (!lake || !code) continue;
      const date = r.OBSERVATION_DATE ? r.OBSERVATION_DATE.slice(0, 10) : null;
      const k = `${lake}|${code}`;
      const a = agg.get(k) ?? { key_value: lake, alias: code, n: 0, first: date, last: date };
      a.n += 1;
      if (date && (!a.first || date < a.first)) a.first = date;
      if (date && (!a.last || date > a.last)) a.last = date;
      agg.set(k, a);
    }
    const rows = [...agg.values()].map((a) => ({ key_type: KEY_50K, alias_type: 'bc-fish-code', ...a }));
    if (start === 0) {
      // A fresh run: clear anything left from an interrupted run.
      await rpc(db, 'stage_observations', { p_source: 'bc-fish-observations', p_rows: [] });
    }
    if (rows.length) await rpc(db, 'stage_observations', { p_source: 'bc-fish-observations', p_rows: rows });
    const done = records.length < PAGE;
    if (!done) return { state: { start: start + PAGE }, done, rows: 0 };
    const total = await rpc(db, 'finalize_observations', { p_source: 'bc-fish-observations' });
    return { state: {}, done: true, rows: total };
  },
};

/**
 * BC fish species codes (e.g. 'RB' = Rainbow Trout) from BC's Fish Information Data Query, used to link
 * fish observations to species. Each code links through the two names BC publishes for it:
 * its scientific name (looked up in FishBase's own name list) or its common name. A code whose two names
 * point to different species is skipped. (User decision 2026-11-10: BC's list has typos in scientific
 * names and local common names, so either field alone misses species like Walleye or Steelhead.)
 */
export const bcFishCodes: Adapter = {
  key: 'bc-fish-codes',
  async step(db) {
    const FIDQ = 'https://a100.gov.bc.ca/pub/fidq';
    const page = await fetchWithRetry(`${FIDQ}/viewFishSpecies.do`);
    const cookie = page.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    await page.body?.cancel();
    const search = await fetchWithRetry(`${FIDQ}/searchFishSpecies.do`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ numSearchResults: '-1', 'searchCriteria.typeCode': '', 'searchCriteria.commonName': '',
        'searchCriteria.speciesCode': '', 'searchCriteria.scientificName': '' }),
    });
    await search.body?.cancel();
    const csv = await (await fetchWithRetry(`${FIDQ}/exportFishSpecies.do`, { headers: { Cookie: cookie } })).text();
    const codes = parseCsv(csv, { skipFirstRow: true }) as Record<string, string>[];
    if (codes.length < 50) throw new Error(`BC fish code list looks incomplete (${codes.length} rows)`);

    const bySci = new Map<string, string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('species_aliases').select('alias, species_id').eq('alias_type', 'scientific')
        .order('alias').range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data) bySci.set(r.alias, r.species_id);
      if (data.length < 1000) break;
    }
    const byCommon = new Map<string, string | null>(); // null = name shared by two species
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('species').select('id, common_name').order('id').range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data) {
        const k = r.common_name.toLowerCase();
        byCommon.set(k, byCommon.has(k) ? null : r.id);
      }
      if (data.length < 1000) break;
    }

    const rows: { alias: string; species_id: string }[] = [];
    for (const c of codes) {
      const code = c.SPECIES_CODE?.trim();
      if (!code) continue;
      const a = c.SCIENTIFIC_NAME ? bySci.get(c.SCIENTIFIC_NAME.trim()) : undefined;
      const b = c.COMMON_NAME ? byCommon.get(c.COMMON_NAME.trim().toLowerCase()) ?? undefined : undefined;
      if (a && b && a !== b) continue;
      const id = a ?? b;
      if (id) rows.push({ alias: code, species_id: id });
    }
    await rpc(db, 'replace_species_aliases', { p_type: 'bc-fish-code', p_rows: rows });
    return { state: {}, done: true, rows: rows.length };
  },
};

export const bcAdapters = [bcLakes, bcLakeSurveys, bcDepthMaps, bcLakeContours, bcFishCodes, bcFishObservations];
