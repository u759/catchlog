# CatchLog

Fishing catch logger. Expo (React Native) + Supabase. Works offline and syncs when back online.

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

- Cooler tab
- Fish ID from photo (Edge Function + vision model)
- Share catch as image
