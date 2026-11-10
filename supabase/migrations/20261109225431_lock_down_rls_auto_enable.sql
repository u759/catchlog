-- Supabase's "auto RLS" event-trigger function lives in public and is callable via /rpc.
-- Event triggers don't need EXECUTE grants to fire, so revoke API access.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
