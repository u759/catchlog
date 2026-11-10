# Architecture decisions

Short log of decisions and why. Add an entry when you make a call a future contributor might undo.

## Supabase only, no other backend services
App talks to Supabase directly. Security is Postgres RLS + explicit grants, not an API server. Server code only where a secret is needed (Edge Functions). The Supabase secret / service_role key never goes in the app.
**Rejected:** custom backend (re-implements RLS); PowerSync (needs a separate hosted sync service; tried and removed 2026-11-10).

## Offline-first with our own sync (`src/lib/sync`)
Local SQLite (`expo-sqlite`) is what the UI reads/writes. Writes go into an `outbox` atomically with the local change and upload in order via supabase-js. Pulls are "changed since cursor" on a server-stamped `updated_at` with a 60s overlap; deletes are tombstones (`deleted_at`). All local writes are serialized through one connection (`write`/`transaction` in `db.ts`).
**Why:** must work with no signal at the lake; only Supabase allowed. **Trade-off:** last write wins across your own devices; no live push (sync on open/reconnect/after writes/every 5 min).
**Rejected:** TanStack Query offline mutations (no local DB, can't query offline); Legend-State (KV, no SQL); WatermelonDB (heavy, new-arch risk).

## What syncs to the device
Own catches, own profile, friendships (+ friends' names/avatars), species. **Not** other anglers' catches: they're only shown on the leaderboard and catch detail, fetched online. Keeps device data bounded.

## Paging
Anything that can grow pages: local lists use a growing `LIMIT`; server lists use limit/offset (`.range()` or RPC params) with `useInfiniteQuery`. Small bounded tables (friendships) may refresh in full.

## Species data
Canadian fish from Wild Species 2020 (gov't species list, built once by `scripts/build-species-seed.py`; next edition ~2027) + FishBase (CC BY-NC: non-commercial; selling the app needs FishBase permission). Synced to the device once then by delta. Search is local fuzzy (Fuse.js), one matcher everywhere (`matchSpecies`: species picker, Dex, Logbook): typos, French and scientific names, accents. The Logbook adds plain word matching on lake, place, lure and notes.
**Everything else refreshes itself (2026-11-10):** the `fishbase` adapter checks monthly for a new FishBase release and refreshes names, length-weight, habitat, diet, spawning, ID features and FishBase's synonym list; `wiki-species` refreshes Wikipedia summaries and Commons photos every 30 days.
**No fallbacks, no hand-made mappings (user decision):** links only by IDs/names the sources publish: species.fishbase_id → FishBase tables; → Wikidata P938 → enwiki + P18; scientific names → FishBase's own name list (`species_aliases`, type `scientific`). Missing links stay unlinked.
**One exception (user decision 2026-11-10):** BC fish codes link through both names BC publishes for each code (scientific name via FishBase's name list, or common name), skipping a code if they disagree. BC's list has typos in scientific names and local common names, so either alone misses Walleye or Steelhead (92 / 87 codes vs 107 with both; they agree 72/72 where both match). The list refreshes monthly (`bc-fish-codes` adapter).
**Kept (user decision):** FishBase display precedence: AFS official English name else FishBase's default name; Canadian spawning records else other countries'; observed depth range else FishBase's common-depth estimate.
**Rejected:** fuzzy matching; hand-maintained mapping tables.

**Dex views (2026-11-10):** "Near me" (species recorded in lakes within ~50 km of your last known position, computed on the phone from synced lake data), "<regions> lakes" (every lake on the phone; label comes from `waterbodies.region`, e.g. "BC lakes"), and "All". Default is the first that has data. On first open, before lake data has synced, the Dex says "Getting lake data…" instead of showing everything.

## Friends
Friend codes are 8 chars, hidden by column privileges; requests only via `send_friend_request` RPC (online). Profiles visible only to self, friends/pending, and owners of public catches. One friendship row per pair.

## Auth
Google (native sign-in → `signInWithIdToken`) and email 6-digit OTP. No passwords. Email needs custom SMTP (Supabase's default sender only reaches org members).

## Units and IDs
Store metric (`length_mm`, `weight_g`), convert for display. Catch and photo IDs are generated on the device (idempotent upserts).

## Database changes go through the Supabase CLI
`npx supabase db push --remote`. The Supabase MCP auto-declines destructive SQL in this setup.

## Species ID: Fishial API only (2026-11-10)
Edge Function calls Fishial Recognition API v2 (free plan: 100 credits/month, 1 credit per recognize). Only on explicit "Identify" tap, result cached per photo, monthly cap enforced server-side, user always confirms. No LLM fallback. Credentials live in Supabase secrets (`FISHIAL_CLIENT_ID`, `FISHIAL_CLIENT_SECRET`).
Caps: 95 recognitions a month (5 kept spare), 15 per user per day; identical photos (SHA-256) come from `private.identify_cache` at no cost. Fishial names link to our species only through FishBase's scientific-name list; anything else is shown as Fishial's name, unlinked.
**Rejected for now:** Claude vision fallback (user decision); self-hosting Fishial's open MIT models (352 MB classifier; needs a server outside Supabase or untested on-device conversion).

## Reference data is region-agnostic, filled by source adapters (2026-11-10)
`waterbodies` (+ `waterbody_keys`, `waterbody_species`) hold lakes from any region; each external dataset is an adapter in `supabase/functions/sync-sources/adapters/<region>.ts` registered in `public.data_sources` (licence, attribution, refresh interval, dependencies). pg_cron checks every minute and calls the `sync-sources` Edge Function once per due source (parallel, isolated; a lock stops double runs; errors back off 10 min); each request advances its source step by step and checkpoints in `data_sources.state`, so nothing needs manual runs. One Edge Function with one adapter file per region beats a function per source: one deploy, one secret, shared locking. Adding a province = new adapter file + `data_sources` rows.
**BC sources (all OGL-BC):** FWA lakes (named or ≥ 10 ha, ~16.5k), FISS lake surveys (depths), Bathymetric Maps – Open (PDF links), Known BC Fish Observations (species per lake), BC fish species codes (FIDQ, links observations to species). A source re-runs when a source it depends on refreshes. Stocking data and georeferenced contours are Access Only → not mirrored (link out to GoFishBC).
**Client:** reference tables sync to the phone with a version check (`reference_version`), so lake lookup, species-per-lake and profiles work offline. Lake assignment: one rule everywhere, the nearest lake within 300 m. The server applies it with exact outlines (trigger on catches/spots, always authoritative); the phone applies it with bounding boxes as an offline guess.

## Download size and scaling past BC (2026-11-10, plan, not built)
**Today (BC only):** first sync downloads ~12 MB of JSON (~70 pages of 500 rows; gzip on the wire): species 0.6 MB + profiles 2.3 MB (all of Canada) + BC lakes 5.7 MB (16.5k, no outlines) + fish-per-lake 3.2 MB (13.7k), plus ~5 MB of species photos (lake/caught species only). Phone DB ~12 MB. Later app opens only run 5 version checks and pull changed rows.
**Species scale fine** (count doesn't grow with geography); keep syncing all of them.
**Lakes don't:** Canada-wide is an estimated 15–30× BC → ~100–250 MB per phone, and lake outlines (BC: 32 MB) would likely fill the free 500 MB database.
**When adding a second province, do both:**
1. **Region-scoped lake sync**, like offline map areas: the phone downloads `waterbodies` / `waterbody_species` only for its home province (from location) plus regions the user adds in a "Regions" setting. Filter the pulls by `waterbodies.region`; species and profiles stay all-Canada. `reference_version` becomes per region.
2. **Keep only useful lakes on the server:** named lakes plus lakes with depth or fish data (BC: 4,884 of 16,457 have data), and simplify outlines further. Keeps the database inside the free tier.

## Conditions are for the catch's time, not the upload's (2026-11-10)
Weather is Open-Meteo for the hour of `caught_at` at the catch's coordinates: live weather is kept only when the catch is within the last hour; otherwise (or when an edit moves time/place) it's saved empty and `src/lib/sync/backfill.ts` fills weather and place name on the next online sync (forecast API for ~3 months back, archive API before; max 3 tries per catch). Moon/sun/solunar are computed from `caught_at` on display.
**Tide and water (2026-11-10):** after a catch uploads, the `catch-conditions` adapter (every 5 min, 8 catches per run) stores `catches.conditions` for `caught_at` at the catch's position. One rule per value:
- **Tide:** catch not in a lake → nearest CHS station with predictions within 20 km (IWLS; predictions exist for any date): height, rising/falling, next high/low.
- **Water temperature / level / flow:** a real-time ECCC gauge on the catch's lake (`lake_stations`: within 500 m of the outline), or, outside lakes, the nearest gauge within 2 km. Wateroffice keeps 30 days of real-time data, so older catches get none.
- **Sea temperature:** catch near a tide station and no gauge temperature → NASA JPL MUR (~1 km, daily, 1–4 days late; retried until available). MUR masks inland lakes (NaN even for Williston/Okanagan), so it is never used for lakes.
- Missing sources retry every 12 h for 7 days, then the catch keeps what it has. Only the server writes `conditions` (trigger `catches_keep_conditions`; a column REVOKE doesn't override table grants).
**Not available:** lake water temperature away from gauges. No open source gives it per lake and day for BC (BC's EMS lake samples are sparse field visits, not a daily series), so the app shows nothing rather than a guess.
**Water now (lake page):** the latest reading from the lake's gauge, fetched live from Wateroffice (online only, not stored).

## Map: MapLibre + OpenFreeMap (2026-11-10)
`@maplibre/maplibre-react-native` v11 with OpenFreeMap's Liberty style. Catch pins clustered from local SQLite; saved spots are a synced, private table.
**Saved areas:** "Save area" shows a square frame the user positions; it's sized so every area includes street-level detail (zoom 14) within OpenFreeMap's 3,000-tile cap (~70 × 70 km max). Each area is two packs sharing `metadata.group`: map (zoom 8–16) and satellite (zoom 8–14). Total offline maps capped at 300 MB. Limits live in `src/features/map/offline.ts`; Saved areas screen lists/deletes them.
**Satellite (2026-11-10):** EOX Sentinel-2 cloudless 2025 (10 m/pixel, CC BY-NC-SA 4.0, free for non-commercial, no key) under Liberty's place/water/road labels. Offline packs need an HTTPS style URL, so the `eox-s2cloudless` adapter rebuilds the style monthly and publishes it to the public `map-styles` bucket. Satellite view stops at zoom 15 (only blur beyond).
**Rejected:** Esri World Imagery and MapTiler Satellite (sharp, but API key and offline caching not allowed); BC government imagery (Access Only); EOX 2016 (allowed offline but old). EOX's FAQ ties offline packs to its paid licence while CC BY-NC-SA permits non-commercial copies; confirm with cloudless@eox.at before any wider release.

## Lake depth contours (2026-11-10)
BC Lake Bathymetric Maps (26 lakes, ~2.3 MB of contour polygons) are **Access Only**, so they aren't copied to our server: the phone downloads them straight from the BC WFS into a file (refreshed monthly) and the map draws them from zoom 11. The server stores only which lakes have them (`waterbodies.has_contours`, `bc-lake-contours` adapter, linked by BC's published WSA lake identifier like the other BC sources). Captioned "Not for navigation".

## Several photos per catch (2026-11-10)
`catch_photos` (device-generated ids, file `{user_id}/{id}.jpg`, `position`, soft deletes) holds up to 6 photos; `catches.photo_path` stays the cover (first photo) so the leaderboard, Logbook rows and friends' lists need no join. Photos are compressed when picked, so "Identify" and the upload send the same bytes. Camera first: the camera tab opens the camera, then the form; cancelling still opens the form.

## Photos compressed on device (2026-11-10)
≤ 1440 px, JPEG 72% (~150–250 KB) before upload; bucket rejects files > 5 MB. Keeps the 1 GB free storage good for several thousand catches.
