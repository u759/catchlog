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

## Friends
Friend codes are 8 chars, hidden by column privileges; requests only via `send_friend_request` RPC (online). Profiles visible only to self, friends/pending, and owners of public catches. One friendship row per pair.

## Auth
Google (native sign-in → `signInWithIdToken`) and email 6-digit OTP. No passwords. Email needs custom SMTP (Supabase's default sender only reaches org members).

## Units and IDs
Store metric (`length_mm`, `weight_g`), convert for display. Catch and photo IDs are generated on the device (idempotent upserts).

## Database changes go through the Supabase CLI
`npx supabase db push --remote`. The Supabase MCP auto-declines destructive SQL in this setup.
