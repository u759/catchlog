-- CatchLog core schema.
-- Project settings: "auto-expose new tables" is OFF and "auto RLS" is ON, so every table
-- below gets explicit GRANTs and explicit RLS policies. Nothing is reachable by default.

create schema if not exists private;  -- not exposed through the Data API
revoke all on schema private from public, anon, authenticated;

-- ── helpers ────────────────────────────────────────────────────────────────
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── profiles ───────────────────────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  units        text not null default 'imperial' check (units in ('imperial', 'metric')),
  friend_code  text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Create a profile row whenever someone signs up (Google gives us name + photo).
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ── species (reference data) ───────────────────────────────────────────────
-- Standard-weight equation: log10(W grams) = ws_a + ws_b * log10(total length mm)
create table public.species (
  id              text primary key,             -- slug, e.g. 'largemouth-bass'
  common_name     text not null,
  scientific_name text,
  family          text,
  ws_a            numeric,
  ws_b            numeric
);

-- ── friendships ────────────────────────────────────────────────────────────
create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index friendships_addressee_idx on public.friendships (addressee_id);

-- ── catches ────────────────────────────────────────────────────────────────
-- id is generated ON THE DEVICE so offline saves can be retried as idempotent upserts.
-- Measurements are stored metric (mm / g); the app converts for display.
create table public.catches (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  species_id       text references public.species (id),
  species_other    text,
  length_mm        integer check (length_mm > 0),
  weight_g         integer check (weight_g > 0),
  weight_estimated boolean not null default false,
  caught_at        timestamptz not null default now(),
  lat              double precision,
  lng              double precision,
  place_name       text,
  waterbody        text,
  lure             text,
  line_lb          numeric,
  notes            text,
  weather          jsonb,    -- { temp_c, wind_kph, wind_dir_deg, pressure_hpa, weather_code }
  photo_path       text unique,  -- storage path in the catch-photos bucket
  released         boolean not null default true,
  visibility       text not null default 'friends' check (visibility in ('private', 'friends', 'public')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz  -- soft delete so deletions sync to other devices
);
create index catches_user_caught_idx on public.catches (user_id, caught_at desc);
create index catches_species_idx on public.catches (species_id);

create trigger catches_updated_at before update on public.catches
  for each row execute function private.set_updated_at();

-- ── row level security ─────────────────────────────────────────────────────
alter table public.profiles    enable row level security;
alter table public.species     enable row level security;
alter table public.friendships enable row level security;
alter table public.catches     enable row level security;

-- profiles: any signed-in user can see names/avatars (needed for leaderboards + adding friends)
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- species: read-only reference data
create policy species_select on public.species for select to authenticated using (true);

-- friendships: only the two people involved can see/delete it; only the addressee can accept
create policy friendships_select on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
create policy friendships_update on public.friendships for update to authenticated
  using (addressee_id = (select auth.uid())) with check (addressee_id = (select auth.uid()));
create policy friendships_delete on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- catches: yours always; friends' if visibility = friends/public; anyone's if public
create policy catches_select on public.catches for select to authenticated using (
  user_id = (select auth.uid())
  or (deleted_at is null and visibility = 'public')
  or (deleted_at is null and visibility = 'friends' and exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester_id = (select auth.uid()) and f.addressee_id = catches.user_id)
            or (f.addressee_id = (select auth.uid()) and f.requester_id = catches.user_id))))
);
create policy catches_insert on public.catches for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy catches_update on public.catches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy catches_delete on public.catches for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── grants (anon gets nothing; the app requires sign-in) ───────────────────
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, units) on public.profiles to authenticated;

grant select on public.species to authenticated;

grant select, insert, delete on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;  -- can't rewrite who the friendship is between

grant select, insert, update, delete on public.catches to authenticated;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated;
