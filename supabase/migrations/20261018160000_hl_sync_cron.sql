-- LIVE-FEED.md §3 step 4: run hl-sync every minute on match days. pg_cron calls hl_sync_tick(), which does nothing
-- unless a match kicks off today (Irish date); then pg_net posts to the Edge Function with a token from Vault (made
-- here, never in git or chat; hl-sync checks it via hl_cron_token(), service role only). Also ESPN's team ids, for the
-- cross-check (same map as scripts/standings.ts).

create extension if not exists pg_net;

alter table teams add column espn_team_id int unique;
update teams t set espn_team_id = v.id
from (values
  (25917, 'asm-clermont-auvergne'),
  (25952, 'glasgow-warriors'),
  (25903, 'leicester-tigers'),
  (25924, 'leinster'),
  (25908, 'sale-sharks'),
  (270567, 'section-paloise'),
  (25923, 'connacht'),
  (116227, 'exeter-chiefs'),
  (25958, 'emirates-lions'),
  (25909, 'saracens'),
  (119318, 'stade-rochelais'),
  (25922, 'stade-toulousain'),
  (25899, 'bristol-bears'),
  (25900, 'gloucester-rugby'),
  (25925, 'munster-rugby'),
  (99855, 'racing-92'),
  (25962, 'dhl-stormers'),
  (143737, 'union-bordeaux-begles'),
  (25898, 'bath-rugby'),
  (25953, 'vodacom-bulls'),
  (25965, 'cardiff-rugby'),
  (25918, 'montpellier-herault-rugby'),
  (25907, 'northampton-saints'),
  (25921, 'stade-francais-paris')
) as v(id, slug)
where t.slug = v.slug;

do $$ begin
  if (select count(*) from teams where espn_team_id is null) > 0 then raise exception 'unmapped ESPN team'; end if;
  -- PGlite tests have no Vault.
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    execute $q$
      select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'hl_cron_token')
      where not exists (select 1 from vault.secrets where name = 'hl_cron_token')
    $q$;
  end if;
end $$;

create function hl_cron_token() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  return (select decrypted_secret from vault.decrypted_secrets where name = 'hl_cron_token');
end $$;

create function hl_sync_tick() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from matches
    where (kickoff_at at time zone 'Europe/Dublin')::date = (now() at time zone 'Europe/Dublin')::date
  ) then
    return;
  end if;
  perform net.http_post(
    url := 'https://xuwqsleuznpaopnmovom.supabase.co/functions/v1/hl-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', hl_cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

-- service_role keeps its default grant (hl-sync calls hl_cron_token with the service key).
revoke execute on function hl_cron_token, hl_sync_tick from public, anon, authenticated;

select cron.schedule('hl-sync', '* * * * *', 'select public.hl_sync_tick()');
