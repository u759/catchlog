-- Column-level REVOKE doesn't override the table-level grants on catches, so enforce "server writes conditions"
-- with a trigger: anyone but the service role keeps the stored value (or null on insert).
create or replace function private.keep_catch_conditions()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), current_user) <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    if tg_op = 'INSERT' then
      new.conditions := null;
      new.conditions_at := null;
    else
      new.conditions := old.conditions;
      new.conditions_at := old.conditions_at;
    end if;
  end if;
  return new;
end;
$$;
create trigger catches_keep_conditions before insert or update on public.catches
  for each row execute function private.keep_catch_conditions();
