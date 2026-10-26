-- Busca automática às 0h e 12h de Brasília (3h e 15h UTC), no lugar da diária das 7h
select cron.unschedule('buscar-vagas-diario');
select cron.schedule(
  'buscar-vagas-12h',
  '0 3,15 * * *',
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
