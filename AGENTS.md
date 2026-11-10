This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## CatchLog project notes

Read `docs/decisions.md` first: it records what we chose, what we rejected, and why. Don't undo a decision there without asking.

- Backend is Supabase project `ouqcqcyialpvibrldtyl` (MCP server in `.mcp.json`, scoped to that project only).
- Schema lives in `supabase/migrations/`. Add a migration file, apply with `npx supabase db push --remote` (the MCP auto-declines destructive SQL in this setup), then regenerate types with `npx supabase gen types typescript --linked > src/lib/database.types.ts`. Run ad-hoc SQL with `npx supabase db query --remote -f file.sql`.
- Profiles: `friend_code`/`units` are column-restricted; read your own via `rpc('my_profile')`. Friend requests only via `rpc('send_friend_request')`.
- New tables are NOT auto-exposed: every table needs explicit `GRANT`s to `authenticated` plus RLS policies. Run the security advisor after DDL.
- Measurements are stored metric (`length_mm`, `weight_g`); convert only for display via `src/utils/units.ts`.
- Catch and photo IDs are generated on the device (idempotent upserts).
- Run `npm run typecheck` and `npm run lint` before declaring work done.
- UI follows `DESIGN.md` ("The Tackle Box") and `PRODUCT.md`. Use the theme's text roles (`type.*`), colours and the components in `src/components/ui` (`Section`, `Group`, `Row`, `Facts`, `Segmented`, `Badge`, `Sheet`, `Dropdown`, `Tip`, `Button`, `Chip`, `Field`) and `AppHeader` / `ModalHeader`; no raw font sizes or hex in screens, no shadows outside the map, no stat-tile rows.
- Data layer: own data is local SQLite (`expo-sqlite`) synced by `src/lib/sync/engine.ts`. Read with `useLiveQuery(sql, params, tables)`; write with `writeLocal(apply, outboxOps)` so the local change and its upload are queued atomically. Don't add TanStack Query for synced tables; use it only for online server reads (leaderboard, other users' catches).
- Synced tables need a server-stamped `updated_at` (trigger `before insert or update`) and soft deletes (`deleted_at`) unless they're small enough to refresh in full. Add a pull function in the engine and a table in the local migrations (`src/lib/sync/db.ts`; append a new migration, never edit an old one).
- Clients re-download a row only when its server `updated_at` changes. A migration that changes data without touching rows (e.g. a column type change) must also `update <table> set updated_at = now()`. A local migration that adds a column must also `DELETE FROM sync_state WHERE key = 'cursor:<table>'` so the next sync refetches everything.
- Timestamps come back from Supabase as ISO with "+00:00"; local writes use "Z". Parse with `parseTs`, compare/order with `julianday()` in SQL.
- Lists that can grow must page (local: growing `LIMIT`; server: `.range()` / RPC limit+offset with `useInfiniteQuery`).
- Reference data (species, profiles, waterbodies, species-per-lake) is read-only on the client and refreshed server-side by `supabase/functions/sync-sources`. pg_cron runs `private.dispatch_sync_sources()` every minute, which calls the function once per due source (`{ source: key }`), so sources run in parallel and can't block each other. Adapters: one file per region (`adapters/bc.ts`, later `adapters/ab.ts`) plus region-agnostic sources (`adapters/fishbase.ts`, `adapters/wiki.ts`); register in `index.ts` and add a `data_sources` row. Steps must stay small (2 s CPU per request; return `yield: true` after heavy steps). The service_role needs explicit grants on any table an adapter reads or writes. Deploy with `npx supabase functions deploy sync-sources --use-api`. Check status in `public.data_sources`.
- No maintenance: every external dataset refreshes automatically through an adapter. Don't add one-off seed scripts for data that changes.
- No fallbacks: link records only through identifiers or exact names the sources publish (FishBase SpecCode, Wikidata P938, FishBase's own name list for scientific names). If a link is missing, leave it unlinked; never add common-name, fuzzy or "try X, else Y" matching, or hand-maintained mapping tables. Spatial lookups use one rule (nearest lake within 300 m). If a source's data quality seems to require a second key, ask first (the one approved case: BC fish codes, see decisions.md).
- New local tables go in a new entry of `MIGRATIONS` in `src/lib/sync/db.ts` (never edit an old entry) and in `wipeLocalData`.
