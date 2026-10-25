-- Textos "sobre mim" por tipo de vaga, com as 3 habilidades que o candidato destaca
create table public.modelos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  palavras_chave text[] not null default '{}',
  habilidades text[] not null default '{}' check (cardinality(habilidades) <= 3),
  texto text not null default '',
  padrao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index modelos_user_idx on public.modelos(user_id);
alter table public.modelos enable row level security;
create policy "dono gerencia modelos" on public.modelos for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
