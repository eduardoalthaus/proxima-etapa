-- Perfil do candidato montado a partir do currículo
alter table public.perfil_busca
  add column nome text,
  add column nivel text not null default 'pleno' check (nivel in ('junior','pleno','senior')),
  add column modalidades text[] not null default '{remoto}',
  add column cidade text,
  add column estado text,
  add column abrangencia text not null default 'cidade' check (abrangencia in ('cidade','estado')),
  add column curriculo_nome text,
  add column curriculo_texto text,
  add column curriculo_em timestamptz;

-- Convites: só e-mails convidados (ou o admin) conseguem criar conta
create table public.convites (
  email text primary key check (email = lower(email)),
  convidado_em timestamptz not null default now()
);
alter table public.convites enable row level security;

create or replace function public.e_admin()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'admin@exemplo.com'
$$;

create policy "admin gerencia convites" on public.convites for all to authenticated
  using ((select public.e_admin())) with check ((select public.e_admin()));

create or replace function public.somente_dono()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) <> 'admin@exemplo.com'
     and not exists (select 1 from public.convites where email = lower(new.email)) then
    raise exception 'Cadastro fechado';
  end if;
  return new;
end $$;

-- LGPD: o próprio usuário apaga a conta e tudo dele (vagas, eventos, sugestões e perfil caem em cascata)
create or replace function public.excluir_minha_conta()
returns void language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid()
$$;
revoke execute on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;
