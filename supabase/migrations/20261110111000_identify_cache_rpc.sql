-- Cache access for the `identify` Edge Function (service role only; the tables live in the private schema).
create or replace function public.identify_cache_get(p_sha256 text)
returns jsonb language sql stable set search_path = '' as $$
  select result from private.identify_cache where sha256 = p_sha256;
$$;
create or replace function public.identify_cache_put(p_sha256 text, p_result jsonb)
returns void language sql set search_path = '' as $$
  insert into private.identify_cache (sha256, result) values (p_sha256, p_result)
  on conflict (sha256) do update set result = excluded.result, created_at = now();
$$;
revoke execute on function public.identify_cache_get(text), public.identify_cache_put(text, jsonb) from public, anon, authenticated;
grant execute on function public.identify_cache_get(text), public.identify_cache_put(text, jsonb) to service_role;
