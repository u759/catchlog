-- PowerSync: offline-first sync between the app's local SQLite and this database.
-- https://docs.powersync.com/integrations/supabase/guide

-- PowerSync requires a text/uuid `id` column on every synced table.
alter table public.friendships add column id uuid not null default gen_random_uuid();
alter table public.friendships add constraint friendships_id_key unique (id);

-- numeric syncs as text; use floats for values the app does math on.
alter table public.species alter column lw_a type double precision, alter column lw_b type double precision;
alter table public.catches alter column line_lb type double precision;

-- Replication role used only by PowerSync Cloud to read changes (read-only, bypasses RLS;
-- Sync Streams decide what each user receives). It has no password here: set one in the
-- Supabase SQL editor with `alter role powersync_role with password '...'` (never commit it).
create role powersync_role with replication bypassrls login;
grant usage on schema public to powersync_role;
grant select on public.catches, public.profiles, public.friendships, public.species to powersync_role;

-- Only the tables the app syncs.
create publication powersync for table public.catches, public.profiles, public.friendships, public.species;

-- Leaderboard: paginated (it reads other users' data, so it stays an online query).
drop function public.leaderboard(timestamptz, text);
create function public.leaderboard(
  p_since      timestamptz default null,
  p_species_id text default null,
  p_limit      integer default 50,
  p_offset     integer default 0
)
returns table (
  rank bigint, user_id uuid, display_name text, avatar_url text, catch_id uuid, species_name text,
  length_mm integer, weight_g integer, photo_path text, caught_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  with best as (
    select distinct on (c.user_id) c.*
    from public.catches c
    where c.deleted_at is null
      and c.length_mm is not null
      and (p_since is null or c.caught_at >= p_since)
      and (p_species_id is null or c.species_id = p_species_id)
    order by c.user_id, c.length_mm desc, c.weight_g desc nulls last, c.caught_at
  ),
  ranked as (
    select
      rank() over (order by b.length_mm desc, b.weight_g desc nulls last) as rank,
      b.user_id, p.display_name, p.avatar_url, b.id as catch_id,
      coalesce(s.common_name, b.species_other) as species_name,
      b.length_mm, b.weight_g, b.photo_path, b.caught_at
    from best b
    join public.profiles p on p.id = b.user_id
    left join public.species s on s.id = b.species_id
  )
  select * from ranked
  order by rank, caught_at
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;
revoke all on function public.leaderboard(timestamptz, text, integer, integer) from public, anon;
grant execute on function public.leaderboard(timestamptz, text, integer, integer) to authenticated;
