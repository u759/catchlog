-- Every 10 minutes, ask the sync-sources Edge Function to refresh any reference data that is due
-- (each source has its own refresh_every in public.data_sources). Most runs exit immediately.
-- The shared secret lives in Vault (name: sync_sources_cron_secret) and in the function's secrets.
select cron.schedule(
  'sync-sources',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://ouqcqcyialpvibrldtyl.supabase.co/functions/v1/sync-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_sources_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
