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
Canadian fish from Wild Species 2020 (gov't) + FishBase v26.06 (CC BY-NC: non-commercial; selling the app needs FishBase permission). Built by `scripts/build-species-seed.py`, synced to the device once then by delta. Search is local fuzzy (Fuse.js).
Profiles (Wikipedia summary, Commons photo, FishBase habitat/diet/ID) are a snapshot built by `scripts/build-species-profiles.py`, joined by ID (FishBase SpecCode → Wikidata P938 → enwiki + P18), not by name. They are not auto-refreshed: rerun the script and add a new migration when FishBase releases (about yearly).

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
**Rejected for now:** Claude vision fallback (user decision); self-hosting Fishial's open MIT models (352 MB classifier; needs a server outside Supabase or untested on-device conversion).

## Reference data is region-agnostic, filled by source adapters (2026-11-10)
`waterbodies` (+ `waterbody_keys`, `waterbody_species`) hold lakes from any region; each external dataset is an adapter in `supabase/functions/sync-sources/adapters/<region>.ts` registered in `public.data_sources` (licence, attribution, refresh interval, dependencies). pg_cron calls the `sync-sources` Edge Function every 10 minutes; it advances due sources one page at a time and checkpoints in `data_sources.state`, so nothing needs manual runs. Adding a province = new adapter file + `data_sources` rows.
**BC sources (all OGL-BC):** FWA lakes (named or ≥ 10 ha, ~16.5k), FISS lake surveys (depths), Bathymetric Maps – Open (PDF links), Known BC Fish Observations (species per lake). Stocking data and georeferenced contours are Access Only → not mirrored (link out to GoFishBC).
**Client:** reference tables sync to the phone with a version check (`reference_version`), so lake lookup, species-per-lake and profiles work offline. Exact lake assignment happens server-side (PostGIS trigger on catches/spots); the phone uses bounding boxes as an offline guess.

## Map: MapLibre + OpenFreeMap (2026-11-10)
`@maplibre/maplibre-react-native` v11 with OpenFreeMap's Liberty style. Offline areas via `OfflineManager.createPack`, capped at 3,000 tiles per download (OpenFreeMap terms). Catch pins clustered from local SQLite; saved spots are a synced, private table.

## Photos compressed on device (2026-11-10)
≤ 1440 px, JPEG 72% (~150–250 KB) before upload; bucket rejects files > 5 MB. Keeps the 1 GB free storage good for several thousand catches.
