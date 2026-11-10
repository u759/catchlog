-- Replace PowerSync with the app's own sync (src/lib/sync). Clients pull rows changed since a
-- cursor (updated_at) and push queued local writes through the Data API (RLS applies).

-- ── remove PowerSync ──────────────────────────────────────────────────────
drop publication if exists powersync;
revoke all on public.catches, public.profiles, public.friendships, public.species from powersync_role;
revoke usage on schema public from powersync_role;
drop role powersync_role;

-- ── change tracking ───────────────────────────────────────────────────────
-- updated_at is always stamped by the server (never trusted from a device clock), on insert
-- and update, so "changed since" pulls can't miss rows because of clock skew.
drop trigger catches_updated_at on public.catches;
create trigger catches_updated_at before insert or update on public.catches
  for each row execute function private.set_updated_at();

drop trigger profiles_updated_at on public.profiles;
create trigger profiles_updated_at before insert or update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.species add column updated_at timestamptz not null default now();
create trigger species_updated_at before insert or update on public.species
  for each row execute function private.set_updated_at();

-- Keyset scans for pulls: (updated_at, id) per user / for species.
create index catches_user_updated_idx on public.catches (user_id, updated_at, id);
create index species_updated_idx on public.species (updated_at, id);
