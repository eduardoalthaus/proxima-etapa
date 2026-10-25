-- Todo dia às 07h (Brasília) = 10h UTC
select cron.schedule(
  'buscar-vagas-diario',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://uplzlegibigvnaftrcfr.supabase.co/functions/v1/buscar-vagas',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-segredo', (select valor from public.config_privada where chave = 'cron_segredo')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  $$
);
