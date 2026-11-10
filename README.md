# CatchLog

Fishing catch logger. Expo (React Native) + Supabase. Offline-first: the app reads and writes a local SQLite database and syncs it with Supabase in the background. No other services.

## How sync works (`src/lib/sync`)

- **Writes** go to local SQLite plus an `outbox` row in the same transaction, then upload in order via supabase-js when online (RLS applies). Network errors retry; permanent rejections are dropped and the row is re-pulled.
- **Pulls** fetch rows with `updated_at` newer than a per-table cursor (minus a 60s overlap), paged by `(updated_at, id)`. The server stamps `updated_at`. Deleted catches are tombstones (`deleted_at`). Friendships refresh in full (small). Species check a row count, then only changed rows.
- **Photos** are queued in `photo_queue` and streamed to/from Supabase Storage with backoff. Your photos are downloaded for offline viewing.
- Runs on sign-in, app foreground, reconnect, after local writes, every 5 minutes, and on pull-to-refresh. Signing out wipes the local copy.
- **Reference data** (species, profiles, lakes, fish per lake) syncs to the phone only when its version changes. It's refreshed server-side by the `sync-sources` Edge Function (each source has its own interval in `data_sources`).
- **Online only** (TanStack Query): leaderboard (paginated), other anglers' catches, adding a friend by code.

## Run

```bash
npm install
npm run ios        # native build + simulator (first time, or after native/config changes)
npm run android
npm start          # dev server only, for JS changes
```

Expo Go won't work. Google Sign-In needs a dev build.

## Config

`.env` holds public values only (Supabase URL + publishable key, Google client IDs). Never put the Supabase secret key or Google client secret in it.

Google OAuth clients (Google Cloud project "CatchLog"), all for `com.catchlog.catchlog`:

| Client | Notes |
|---|---|
| Web | ID + secret go in Supabase → Auth → Providers → Google |
| iOS | ID in `.env` |
| Android debug | SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |
| Android release | SHA-1 `C4:B6:58:C3:7C:CB:90:EA:4F:E2:4E:2C:76:18:75:97:89:3B:A9:72` |

Supabase's Google provider "Client IDs" field lists all of them, Web first.

## Release key

`credentials.json` + `credentials/android/keystore.jks` sign Android release builds (`npm run android:release`). They're gitignored. Back them up: losing them means release builds can't update in place.

## Database

Schema, RLS policies and seed data are in `supabase/migrations/`. To change the schema: add a migration, apply it, regenerate `src/lib/database.types.ts`. New tables need explicit `GRANT`s to `authenticated` plus RLS policies. They aren't exposed by default.

Lengths and weights are stored in mm and g. `src/utils/units.ts` converts for display.

## Species data

The `species` table has every fish species in Canada (1,395) plus a few US ones from the first seed. It's built by `scripts/build-species-seed.py` from:

- [Wild Species 2020](https://www.canada.ca/en/environment-climate-change/services/species-risk-public-registry/general-status/wild-species-2020.html) (Canadian Endangered Species Conservation Council, 2022): species list, provinces/oceans, national status rank. The file has no common names for fishes.
- [FishBase](https://www.fishbase.se) (CC BY-NC 4.0, non-commercial; latest release, checked monthly): English/French names (AFS official names first), length-weight coefficients, max length, freshwater/saltwater flags, game-fish flag.

The FishBase licence is non-commercial. Selling the app would need permission from FishBase.

## Server jobs

| Job | Schedule | What |
|---|---|---|
| `sync-sources` (pg_cron → Edge Function) | every minute | Calls the function once per due source: BC lakes (180 d), lake depths + depth maps (90 d), fish observations (30 d), FishBase (checked monthly), Wikipedia summaries + Commons photos (30 d). Progress in `public.data_sources`. |

Secrets: `CRON_SECRET` (function secret + Vault `sync_sources_cron_secret`), `FISHIAL_CLIENT_ID/SECRET`.

## Layout

```
src/app/          screens (Expo Router)
src/features/     data hooks per feature
src/lib/          supabase client, auth, offline queue
src/components/   shared UI
supabase/         migrations
plugins/          config plugin for release signing
```

## TODO

- Fish ID from photo (Edge Function + vision model)
- Share catch as image
