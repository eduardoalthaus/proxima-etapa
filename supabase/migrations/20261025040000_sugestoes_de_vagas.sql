-- Aplicada no projeto Supabase "vagas-remotas" (uplzlegibigvnaftrcfr)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Filtro de busca, um por usuário, editável pelo site
create table public.perfil_busca (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  termos_br text[] not null default '{}',
  termos_global text[] not null default '{}',
  cargos text[] not null default '{}',
  competencias text[] not null default '{}',
  excluir text[] not null default '{}',
  nota_minima smallint not null default 45 check (nota_minima between 0 and 100),
  ultima_busca timestamptz,
  updated_at timestamptz not null default now()
);

create table public.sugestoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fonte text not null,
  externo_id text not null,
  titulo text not null,
  empresa text,
  url text not null,
  local text,
  resumo text,
  publicado_em timestamptz,
  nota smallint not null,
  motivos text[] not null default '{}',
  estado text not null default 'nova' check (estado in ('nova','salva','descartada')),
  created_at timestamptz not null default now(),
  unique (user_id, fonte, externo_id)
);
create index sugestoes_user_estado_idx on public.sugestoes(user_id, estado);

alter table public.perfil_busca enable row level security;
alter table public.sugestoes enable row level security;

create policy "dono gerencia perfil" on public.perfil_busca for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "dono le sugestoes" on public.sugestoes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "dono atualiza sugestoes" on public.sugestoes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Segredo que o agendamento usa para chamar a Edge Function (sem políticas: só service role e postgres leem)
create table public.config_privada (chave text primary key, valor text not null);
alter table public.config_privada enable row level security;
insert into public.config_privada values ('cron_segredo', encode(extensions.gen_random_bytes(24), 'hex'));
