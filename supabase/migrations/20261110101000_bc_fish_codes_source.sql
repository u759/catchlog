-- BC fish codes refresh automatically from BC's code list (adapter bc-fish-codes) instead of a generated
-- migration. Observations wait for the codes; codes wait for FishBase's name list.
insert into public.data_sources (key, name, region, licence, attribution, url, refresh_every, depends_on) values
  ('bc-fish-codes', 'BC Fish Species Codes (Fish Information Data Query)', 'BC',
   'Province of British Columbia, public reference list',
   'Fish species codes from the Province of British Columbia Fish Information Data Query.',
   'https://a100.gov.bc.ca/pub/fidq/viewFishSpecies.do', interval '30 days', '{fishbase}')
on conflict (key) do nothing;
update public.data_sources set depends_on = '{bc-fwa-lakes,bc-fish-codes}' where key = 'bc-fish-observations';

-- A source is also due when one of its dependencies has refreshed since its own last run, so derived data
-- (e.g. species per lake) follows its inputs without waiting for its own interval.
create or replace function private.dispatch_sync_sources()
returns integer language sql set search_path = '' as $$
  select count(net.http_post(
    url := 'https://ouqcqcyialpvibrldtyl.supabase.co/functions/v1/sync-sources',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'sync_sources_cron_secret')),
    body := jsonb_build_object('source', s.key),
    timeout_milliseconds := 150000))::int
  from public.data_sources s
  where s.enabled
    -- not running (a lock older than 5 min is from a crashed run)
    and (s.running_since is null or s.running_since < now() - interval '5 minutes')
    -- after an error, wait 10 min before retrying
    and (s.last_error is null or s.last_attempt_at is null or s.last_attempt_at < now() - interval '10 minutes')
    -- dependencies loaded and not mid-refresh
    and not exists (select 1 from public.data_sources d
                    where d.key = any (s.depends_on) and (d.last_success_at is null or d.state <> '{}'::jsonb))
    -- due: a run in progress, never loaded, older than its interval, or a dependency refreshed since
    and (s.state <> '{}'::jsonb or s.last_success_at is null or s.last_success_at + s.refresh_every < now()
         or exists (select 1 from public.data_sources d
                    where d.key = any (s.depends_on) and d.last_success_at > s.last_success_at));
$$;
revoke execute on function private.dispatch_sync_sources() from public;
