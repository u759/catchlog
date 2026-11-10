-- ── photo storage ──────────────────────────────────────────────────────────
-- Private bucket. Path convention: {user_id}/{catch_id}.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catch-photos', 'catch-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Write only into your own folder.
create policy catch_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy catch_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy catch_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Read your own photos, plus any photo attached to a catch you're allowed to see
-- (the subquery runs under the catches RLS policy, so friends/private rules carry over).
create policy catch_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'catch-photos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.catches c where c.photo_path = objects.name and c.deleted_at is null)
  )
);

-- ── leaderboard ────────────────────────────────────────────────────────────
-- Each angler's single longest catch, ranked. SECURITY INVOKER: only catches the caller can
-- already see via RLS (own + friends + public) are considered.
create or replace function public.leaderboard(
  p_since      timestamptz default null,
  p_species_id text default null
)
returns table (
  rank         bigint,
  user_id      uuid,
  display_name text,
  avatar_url   text,
  catch_id     uuid,
  species_name text,
  length_mm    integer,
  weight_g     integer,
  photo_path   text,
  caught_at    timestamptz
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
  )
  select
    rank() over (order by b.length_mm desc, b.weight_g desc nulls last),
    b.user_id, p.display_name, p.avatar_url,
    b.id, coalesce(s.common_name, b.species_other),
    b.length_mm, b.weight_g, b.photo_path, b.caught_at
  from best b
  join public.profiles p on p.id = b.user_id
  left join public.species s on s.id = b.species_id
  order by 1, b.caught_at;
$$;

grant execute on function public.leaderboard(timestamptz, text) to authenticated;
