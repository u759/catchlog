// Species summaries and photos from Wikipedia / Wikimedia Commons, region-agnostic.
// Linked only by IDs the sources maintain: species.fishbase_id -> Wikidata P938 (FishBase ID)
// -> English Wikipedia sitelink + P18 image. No name matching, no hand-made mapping.
import { type Adapter, clean, fetchWithRetry, rpc, speciesWithFishbase } from './types.ts';

const CHUNK = 100; // species per step: 2 Commons + 5 Wikipedia requests (Wikidata is one query per run)

const json = async <T>(url: string, init?: RequestInit) =>
  (await (await fetchWithRetry(url, { ...init, headers: { Accept: 'application/json', ...(init?.headers ?? {}) } })).json()) as T;

type Wd = { item: string; img?: string; en?: string };

async function wikidata(fbIds: number[]): Promise<Map<number, Wd>> {
  const query = `SELECT ?fb ?item ?img ?en WHERE { VALUES ?fb { ${fbIds.map((i) => `"${i}"`).join(' ')} }
    ?item wdt:P938 ?fb . OPTIONAL { ?item wdt:P18 ?img }
    OPTIONAL { ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> } }`;
  const res = await json<{ results: { bindings: Record<string, { value: string }>[] } }>(
    'https://query.wikidata.org/sparql?format=json',
    { method: 'POST', body: new URLSearchParams({ query }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  const out = new Map<number, Wd>();
  for (const b of res.results.bindings) {
    const fb = Number(b.fb.value);
    const e = out.get(fb) ?? { item: b.item.value.split('/').pop()! };
    if (b.img && !e.img) e.img = decodeURIComponent(b.img.value.split('/').pop()!).replaceAll('_', ' ');
    if (b.en && !e.en) e.en = decodeURIComponent(b.en.value.split('/').pop()!).replaceAll('_', ' ');
    out.set(fb, e);
  }
  return out;
}

type Img = { url: string; thumb: string; page: string; author: string | null; license: string | null };

async function commons(files: string[]): Promise<Map<string, Img>> {
  const out = new Map<string, Img>();
  for (let i = 0; i < files.length; i += 50) {
    const q = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'url|extmetadata',
      iiurlwidth: '480', titles: files.slice(i, i + 50).map((f) => `File:${f}`).join('|'),
    });
    type Res = { query: { normalized?: { from: string; to: string }[]; pages: { title: string; imageinfo?: {
      url: string; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }[] } };
    const res = await json<Res>(`https://commons.wikimedia.org/w/api.php?${q}`);
    const from = new Map((res.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of res.query.pages) {
      const info = p.imageinfo?.[0];
      if (!info) continue;
      const title = (from.get(p.title) ?? p.title).replace(/^File:/, '').replaceAll('_', ' ');
      out.set(title, {
        url: info.url, thumb: info.thumburl ?? info.url, page: info.descriptionurl,
        author: clean(info.extmetadata?.Artist?.value, 200), license: clean(info.extmetadata?.LicenseShortName?.value, 60),
      });
    }
  }
  return out;
}

async function wikipedia(titles: string[]): Promise<Map<string, { summary: string; url: string }>> {
  const out = new Map<string, { summary: string; url: string }>();
  for (let i = 0; i < titles.length; i += 20) {
    const chunk = titles.slice(i, i + 20);
    const q = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'extracts|info|pageprops',
      exintro: '1', explaintext: '1', exlimit: 'max', inprop: 'url', ppprop: 'disambiguation', titles: chunk.join('|'),
    });
    type Res = { query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[];
      pages: { title: string; extract?: string; fullurl?: string; pageprops?: Record<string, string> }[] } };
    const res = await json<Res>(`https://en.wikipedia.org/w/api.php?${q}`);
    const alias = new Map([...(res.query?.normalized ?? []), ...(res.query?.redirects ?? [])].map((m) => [m.from, m.to]));
    const pages = new Map((res.query?.pages ?? []).map((p) => [p.title, p]));
    for (const title of chunk) {
      let t = title;
      for (let k = 0; k < 3; k++) t = alias.get(t) ?? t;
      const p = pages.get(t);
      const summary = clean(p?.extract, 700);
      if (p && summary && p.fullurl && !('disambiguation' in (p.pageprops ?? {}))) out.set(title, { summary, url: p.fullurl });
    }
  }
  return out;
}

export const wikiSpecies: Adapter = {
  key: 'wiki-species',
  async step(db, state) {
    // First step of a run: one Wikidata query for every species, kept in state for the following steps.
    if (!state.wd) {
      const ids = (await speciesWithFishbase(db)).map((s) => s.fishbase_id);
      const wd = Object.fromEntries(await wikidata(ids));
      return { state: { wd, after: '', changed: 0 }, done: false, rows: 0 };
    }
    const wdAll = state.wd as Record<string, Wd>;
    const after = (state.after as string) ?? '';
    const { data, error } = await db.from('species').select('id, fishbase_id').not('fishbase_id', 'is', null)
      .gt('id', after).order('id').limit(CHUNK);
    if (error) throw new Error(error.message);
    const species = data as { id: string; fishbase_id: number }[];
    const prev = (state.changed as number) ?? 0;
    if (!species.length) return { state: {}, done: true, rows: prev };

    const wd = new Map(species.flatMap((s) => (wdAll[s.fishbase_id] ? [[s.fishbase_id, wdAll[s.fishbase_id]] as const] : [])));
    const imgs = await commons([...new Set([...wd.values()].flatMap((e) => (e.img ? [e.img] : [])))]);
    const wiki = await wikipedia([...new Set([...wd.values()].flatMap((e) => (e.en ? [e.en] : [])))]);

    const rows = species.map((s) => {
      const e = wd.get(s.fishbase_id);
      const img = e?.img ? imgs.get(e.img) : undefined;
      const w = e?.en ? wiki.get(e.en) : undefined;
      return {
        species_id: s.id, wikidata_id: e?.item ?? null, summary: w?.summary ?? null, summary_url: w?.url ?? null,
        image_url: img?.url ?? null, image_thumb_url: img?.thumb ?? null, image_author: img?.author ?? null,
        image_license: img?.license ?? null, image_page_url: img?.page ?? null,
      };
    });
    const changed = prev + await rpc(db, 'set_species_wiki', { p_rows: rows });
    if (species.length < CHUNK) return { state: {}, done: true, rows: changed };
    return { state: { wd: wdAll, after: species[species.length - 1].id, changed }, done: false, rows: 0 };
  },
};
