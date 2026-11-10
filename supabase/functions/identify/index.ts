// Species suggestions from a catch photo (Fishial Recognition API). Called only when the user taps "Identify";
// the user always confirms. Results are cached per photo (same photo = no new credit), and credits are capped
// server-side: Fishial's free plan has 100 recognitions a month.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MONTH_CAP = 95; // keep a few of the 100 monthly credits in reserve
const USER_DAY_CAP = 15;
const MAX_BYTES = 5 * 1024 * 1024;
const FISHIAL = 'https://api-recognition.fishial.ai/v2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let token: { value: string; expires: number } | null = null;
async function fishialToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const res = await fetch(`${FISHIAL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: Deno.env.get('FISHIAL_CLIENT_ID'), client_secret: Deno.env.get('FISHIAL_CLIENT_SECRET') }),
  });
  if (!res.ok) throw new Error(`fishial auth ${res.status}`);
  const d = await res.json();
  token = { value: d.access_token, expires: Date.now() + 50 * 60_000 };
  return token.value;
}

/** Fishial may name a subspecies ("Oncorhynchus clarkii clarkii"); the species is its first two words. */
const binomial = (name: string) => name.trim().split(/\s+/).slice(0, 2).join(' ');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST an image' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Signed-in users only.
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const { data: auth } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  const user = auth?.user;
  if (!user) return json({ error: 'Sign in to identify fish.' }, 401);

  if (new URL(req.url).searchParams.get('credits') === '1') {
    const { data } = await admin.rpc('identify_credits_left', { p_month_cap: MONTH_CAP });
    return json({ credits_left: data ?? null });
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: 'Send a JPEG photo under 5 MB.' }, 400);
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

  let result = (await admin.rpc('identify_cache_get', { p_sha256: sha })).data as Record<string, unknown> | null;
  let creditsLeft: number | null = null;
  if (!result) {
    const { data: claim, error } = await admin.rpc('identify_claim', {
      p_user: user.id, p_month_cap: MONTH_CAP, p_user_day_cap: USER_DAY_CAP,
    });
    if (error) return json({ error: 'Could not check credits.' }, 500);
    if (claim === -1) return json({ error: 'No fish IDs left this month. They reset on the 1st.', credits_left: 0 }, 429);
    if (claim === -2) return json({ error: `You’ve used today’s ${USER_DAY_CAP} fish IDs. Try again tomorrow.` }, 429);
    creditsLeft = claim as number;

    const res = await fetch(`${FISHIAL}/recognize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await fishialToken()}`, 'Content-Type': 'image/jpeg' },
      body: bytes,
    });
    if (!res.ok) return json({ error: 'Fish ID is unavailable right now. Try again later.' }, 502);
    type R = { objects?: { species?: { id: string; certainty: number }[] }[]; definitions?: Record<string, { scientificName: string; commonName: string }> };
    const r = (await res.json()) as R;

    // Best certainty per Fishial species across all fish found in the photo.
    const best = new Map<string, number>();
    for (const o of r.objects ?? []) for (const s of o.species ?? []) best.set(s.id, Math.max(best.get(s.id) ?? 0, s.certainty));
    const named = [...best]
      .map(([id, certainty]) => ({ name: r.definitions?.[id]?.scientificName ?? '', common: r.definitions?.[id]?.commonName ?? '', certainty }))
      .filter((x) => x.name)
      .sort((a, b) => b.certainty - a.certainty);

    // Link by scientific name through FishBase's own name list (species_aliases, type 'scientific').
    const names = [...new Set(named.map((x) => binomial(x.name)))];
    const { data: aliases } = names.length
      ? await admin.from('species_aliases').select('alias, species_id').eq('alias_type', 'scientific').in('alias', names)
      : { data: [] as { alias: string; species_id: string }[] };
    const byName = new Map((aliases ?? []).map((a) => [a.alias, a.species_id]));
    const ids = [...new Set([...byName.values()])];
    const { data: species } = ids.length ? await admin.from('species').select('id, common_name').in('id', ids) : { data: [] };
    const common = new Map((species ?? []).map((s: { id: string; common_name: string }) => [s.id, s.common_name]));

    const seen = new Set<string>();
    const candidates: { species_id: string; common_name: string; scientific_name: string; certainty: number }[] = [];
    const unmatched: { name: string; certainty: number }[] = [];
    for (const x of named) {
      const id = byName.get(binomial(x.name));
      if (id && !seen.has(id)) {
        seen.add(id);
        candidates.push({ species_id: id, common_name: common.get(id) ?? x.common, scientific_name: binomial(x.name), certainty: Math.round(x.certainty * 100) / 100 });
      } else if (!id) unmatched.push({ name: x.common || x.name, certainty: Math.round(x.certainty * 100) / 100 });
    }
    result = { candidates: candidates.slice(0, 3), unmatched: unmatched.slice(0, 2), fish_found: (r.objects ?? []).length };
    await admin.rpc('identify_cache_put', { p_sha256: sha, p_result: result });
  }
  if (creditsLeft == null) creditsLeft = (await admin.rpc('identify_credits_left', { p_month_cap: MONTH_CAP })).data ?? null;
  return json({ ...result, credits_left: creditsLeft });
});
