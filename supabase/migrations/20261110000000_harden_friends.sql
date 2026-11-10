-- Harden profiles + friending. Everything here is enforced by Postgres, not the app.
--  1. Profiles are only visible to: yourself, people you have a friendship/request with,
--     and owners of public catches (so leaderboards can show their name).
--  2. friend_code (and units) are not readable by anyone via the API except the owner,
--     through my_profile(). Enforced with column-level privileges.
--  3. Friend requests can only be created through send_friend_request(code);
--     direct INSERTs into friendships are revoked.
--  4. Friend codes: 8 chars, unambiguous alphabet, collision-checked, retried on conflict.
--  5. At most one friendship row per pair of users, regardless of direction.

-- ── 4. friend code generator ──────────────────────────────────────────────
create or replace function private.generate_friend_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I/L
  code text;
  bytes bytea;
begin
  loop
    bytes := extensions.gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end;
$$;
revoke all on function private.generate_friend_code() from public, anon, authenticated;

alter table public.profiles alter column friend_code set default private.generate_friend_code();
update public.profiles set friend_code = private.generate_friend_code();
alter table public.profiles add constraint profiles_friend_code_format check (friend_code ~ '^[A-HJKMNP-Z2-9]{8}$');

-- Retry on the (astronomically unlikely) race where two signups draw the same code.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  for attempt in 1..5 loop
    begin
      insert into public.profiles (id, display_name, avatar_url)
      values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
        coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
      );
      return new;
    exception when unique_violation then
      if attempt = 5 then raise; end if;
    end;
  end loop;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

-- ── 5. one friendship per pair ────────────────────────────────────────────
create unique index friendships_pair_uniq
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- ── 1. who can see a profile ──────────────────────────────────────────────
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (
    select 1 from public.friendships f
    where (f.requester_id = (select auth.uid()) and f.addressee_id = profiles.id)
       or (f.addressee_id = (select auth.uid()) and f.requester_id = profiles.id))
  or exists (
    select 1 from public.catches c
    where c.user_id = profiles.id and c.visibility = 'public' and c.deleted_at is null)
);

-- ── 2. column-level privileges ────────────────────────────────────────────
revoke select on public.profiles from authenticated;
grant select (id, display_name, avatar_url) on public.profiles to authenticated;
-- update grant (display_name, avatar_url, units) from the initial migration is unchanged

create or replace function public.my_profile()
returns public.profiles language sql stable security definer set search_path = '' as $$
  select * from public.profiles where id = (select auth.uid());
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- ── 3. friend requests only via code ──────────────────────────────────────
revoke insert on public.friendships from authenticated;
drop policy friendships_insert on public.friendships;

-- Returns {status: 'sent' | 'accepted' | 'already_friends' | 'already_sent', display_name}.
create or replace function public.send_friend_request(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  other public.profiles%rowtype;
  existing public.friendships%rowtype;
begin
  if me is null then raise exception 'Not signed in' using errcode = '28000'; end if;

  select * into other from public.profiles
  where friend_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then raise exception 'No angler found with that code.' using errcode = 'P0002'; end if;
  if other.id = me then raise exception 'That''s your own code.' using errcode = '22023'; end if;

  select * into existing from public.friendships
  where (requester_id = me and addressee_id = other.id) or (requester_id = other.id and addressee_id = me);

  if found then
    if existing.status = 'accepted' then
      return jsonb_build_object('status', 'already_friends', 'display_name', other.display_name);
    elsif existing.requester_id = other.id then
      update public.friendships set status = 'accepted'
      where requester_id = other.id and addressee_id = me;
      return jsonb_build_object('status', 'accepted', 'display_name', other.display_name);
    else
      return jsonb_build_object('status', 'already_sent', 'display_name', other.display_name);
    end if;
  end if;

  begin
    insert into public.friendships (requester_id, addressee_id) values (me, other.id);
  exception when unique_violation then
    -- they sent us a request at the same instant; accept it
    update public.friendships set status = 'accepted' where requester_id = other.id and addressee_id = me;
    return jsonb_build_object('status', 'accepted', 'display_name', other.display_name);
  end;
  return jsonb_build_object('status', 'sent', 'display_name', other.display_name);
end;
$$;
revoke all on function public.send_friend_request(text) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
