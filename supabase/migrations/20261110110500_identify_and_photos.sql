-- Species ID from a photo (Fishial) and several photos per catch.

-- ── Fishial identify: cache + caps (enforced in the `identify` Edge Function with the service role) ──
create table private.identify_cache (
  sha256     text primary key,
  result     jsonb not null,
  created_at timestamptz not null default now()
);
create table private.identify_usage (
  month text primary key,           -- 'YYYY-MM' (UTC)
  used  integer not null default 0
);
create table private.identify_user_usage (
  user_id uuid not null,
  day     date not null,
  used    integer not null default 0,
  primary key (user_id, day)
);
grant select, insert, update, delete on private.identify_cache, private.identify_usage, private.identify_user_usage to service_role;

-- Claims one recognition if under both caps. Returns credits left this month, or -1 (month) / -2 (user today).
create or replace function public.identify_claim(p_user uuid, p_month_cap integer, p_user_day_cap integer)
returns integer language plpgsql set search_path = '' as $$
declare m text := to_char(now() at time zone 'utc', 'YYYY-MM'); used_m integer; used_u integer;
begin
  select used into used_m from private.identify_usage where month = m for update;
  if coalesce(used_m, 0) >= p_month_cap then return -1; end if;
  select used into used_u from private.identify_user_usage where user_id = p_user and day = (now() at time zone 'utc')::date for update;
  if coalesce(used_u, 0) >= p_user_day_cap then return -2; end if;
  insert into private.identify_usage (month, used) values (m, 1)
    on conflict (month) do update set used = private.identify_usage.used + 1 returning used into used_m;
  insert into private.identify_user_usage (user_id, day, used) values (p_user, (now() at time zone 'utc')::date, 1)
    on conflict (user_id, day) do update set used = private.identify_user_usage.used + 1;
  return p_month_cap - used_m;
end;
$$;
create or replace function public.identify_credits_left(p_month_cap integer)
returns integer language sql stable set search_path = '' as $$
  select p_month_cap - coalesce((select used from private.identify_usage where month = to_char(now() at time zone 'utc', 'YYYY-MM')), 0);
$$;
revoke execute on function public.identify_claim(uuid, integer, integer), public.identify_credits_left(integer)
  from public, anon, authenticated;
grant execute on function public.identify_claim(uuid, integer, integer), public.identify_credits_left(integer) to service_role;

insert into public.data_sources (key, name, region, licence, attribution, url, used_for, enabled) values
  ('fishial', 'Fishial.ai', null, 'Fishial Recognition API (free plan)', 'Fish recognition by Fishial.ai.',
   'https://fishial.ai', 'Suggesting the species from a photo', false)
on conflict (key) do nothing;

-- ── several photos per catch ────────────────────────────────────────────────────────────────────
-- catches.photo_path stays as the cover (first photo) for the leaderboard and friends' views.
create table public.catch_photos (
  id         uuid primary key,                -- generated on the device; the file is {user_id}/{id}.jpg
  catch_id   uuid not null references public.catches (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  path       text not null unique,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index catch_photos_user_updated_idx on public.catch_photos (user_id, updated_at, id);
create index catch_photos_catch_idx on public.catch_photos (catch_id, position);
create trigger catch_photos_updated_at before insert or update on public.catch_photos
  for each row execute function private.set_updated_at();

alter table public.catch_photos enable row level security;
-- Visible with the catch (the subquery runs under the catches policy: own, friends, public).
create policy catch_photos_select on public.catch_photos for select to authenticated using (
  user_id = (select auth.uid())
  or (deleted_at is null and exists (select 1 from public.catches c where c.id = catch_photos.catch_id))
);
create policy catch_photos_insert on public.catch_photos for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.catches c where c.id = catch_id and c.user_id = (select auth.uid()))
);
create policy catch_photos_update on public.catch_photos for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.catch_photos to authenticated;
grant select, insert, update, delete on public.catch_photos to service_role;

-- Existing covers become the first photo of their catch.
insert into public.catch_photos (id, catch_id, user_id, path, position, created_at)
select (split_part(split_part(c.photo_path, '/', 2), '.', 1))::uuid, c.id, c.user_id, c.photo_path, 0, c.created_at
from public.catches c
where c.photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
on conflict do nothing;

-- Storage: also allow reading any photo of a catch you can see.
drop policy if exists catch_photos_select on storage.objects;
create policy catch_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'catch-photos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.catches c where c.photo_path = objects.name and c.deleted_at is null)
    or exists (select 1 from public.catch_photos p where p.path = objects.name and p.deleted_at is null)
  )
);
