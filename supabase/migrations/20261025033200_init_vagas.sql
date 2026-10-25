-- Aplicada no projeto Supabase "vagas-remotas" (uplzlegibigvnaftrcfr)

-- Só o dono pode criar conta
create or replace function public.somente_dono()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) <> 'admin@exemplo.com' then
    raise exception 'Cadastro fechado';
  end if;
  return new;
end $$;

create trigger somente_dono_signup
  before insert on auth.users
  for each row execute function public.somente_dono();

create table public.vagas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  empresa text not null,
  cargo text not null,
  link text,
  origem text,
  salario text,
  local text default 'Remoto',
  status text not null default 'interesse'
    check (status in ('interesse','aplicado','em_analise','entrevista','teste','oferta','recusado','desistiu')),
  prioridade smallint not null default 2 check (prioridade between 1 and 3),
  data_aplicacao date,
  contato text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  vaga_id uuid not null references public.vagas(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null
    check (tipo in ('aplicacao','resposta','entrevista','teste','oferta','recusa','follow_up','nota')),
  data date not null default current_date,
  descricao text,
  created_at timestamptz not null default now()
);

create index eventos_vaga_idx on public.eventos(vaga_id);
create index vagas_user_idx on public.vagas(user_id);
create index eventos_user_idx on public.eventos(user_id);

create or replace function public.toca_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger vagas_updated_at before update on public.vagas
  for each row execute function public.toca_updated_at();

alter table public.vagas enable row level security;
alter table public.eventos enable row level security;

create policy "dono gerencia vagas" on public.vagas for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "dono gerencia eventos" on public.eventos for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke execute on function public.somente_dono() from public, anon, authenticated;
