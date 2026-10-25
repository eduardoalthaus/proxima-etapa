-- Conexão com o Outlook (Microsoft Graph). O refresh_token nunca é exposto ao navegador:
-- o usuário só lê as colunas liberadas abaixo; quem usa o token é a Edge Function (service role).
create table public.conexoes_email (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provedor text not null default 'outlook',
  email text,
  refresh_token text not null,
  ultima_leitura timestamptz,
  erro text,
  criado_em timestamptz not null default now()
);
alter table public.conexoes_email enable row level security;
revoke all on public.conexoes_email from anon, authenticated;
grant select (user_id, provedor, email, ultima_leitura, erro, criado_em) on public.conexoes_email to authenticated;
grant delete on public.conexoes_email to authenticated;
create policy "dono ve conexao" on public.conexoes_email for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono desconecta" on public.conexoes_email for delete to authenticated using ((select auth.uid()) = user_id);

-- "state" do OAuth: liga a volta da Microsoft ao usuário que clicou em Conectar (sem políticas: só service role)
create table public.oauth_estados (
  estado text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.oauth_estados enable row level security;

-- E-mails de recrutamento lidos (só os da Gupy), com a etapa detectada e a vaga associada
create table public.emails_recebidos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mensagem_id text not null,
  recebido_em timestamptz not null,
  remetente text,
  assunto text,
  trecho text,
  tipo text not null check (tipo in ('candidatura','avanco','teste','entrevista','oferta','recusa','outro')),
  vaga_id uuid references public.vagas(id) on delete set null,
  aplicado boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, mensagem_id)
);
create index emails_recebidos_user_idx on public.emails_recebidos(user_id, recebido_em desc);
create index emails_recebidos_vaga_idx on public.emails_recebidos(vaga_id);
alter table public.emails_recebidos enable row level security;
create policy "dono le emails" on public.emails_recebidos for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono atualiza emails" on public.emails_recebidos for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "dono apaga emails" on public.emails_recebidos for delete to authenticated using ((select auth.uid()) = user_id);

-- Lê os e-mails da Gupy de hora em hora (minuto 20)
select cron.schedule(
  'ler-outlook-horario',
  '20 * * * *',
  $$
  select net.http_post(
    url := 'https://uplzlegibigvnaftrcfr.supabase.co/functions/v1/outlook',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-segredo', (select valor from public.config_privada where chave = 'cron_segredo')),
    body := '{"acao":"ler"}'::jsonb,
    timeout_milliseconds := 120000
  )
  $$
);
