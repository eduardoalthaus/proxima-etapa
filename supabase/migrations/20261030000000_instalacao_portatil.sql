-- Instalação portátil: nada de e-mail ou URL do projeto fixos no código, para qualquer pessoa subir a própria cópia.
-- Tudo o que muda de uma instalação para outra fica em config_privada (admin_email, url_projeto, cadastro_aberto).

-- Admin: numa instalação que já tem contas, vira admin a mais antiga; numa nova, a primeira conta criada (somente_dono)
insert into public.config_privada (chave, valor)
select 'admin_email', lower(email) from auth.users order by created_at limit 1
on conflict (chave) do nothing;

create or replace function public.e_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '') =
    coalesce((select valor from public.config_privada where chave = 'admin_email'), '-')
$$;

create or replace function public.somente_dono()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  dono text := (select valor from public.config_privada where chave = 'admin_email');
begin
  if dono is null then
    insert into public.config_privada values ('admin_email', lower(new.email));
  elsif lower(new.email) <> dono
     and coalesce((select valor from public.config_privada where chave = 'cadastro_aberto'), 'nao') <> 'sim'
     and not exists (select 1 from public.convites where email = lower(new.email)) then
    raise exception 'Cadastro fechado';
  end if;
  return new;
end $$;

-- URL do projeto para o pg_cron chamar as Edge Functions. Numa instalação existente sai do agendamento antigo;
-- numa nova, cadastrar: insert into public.config_privada values ('url_projeto', 'https://<ref>.supabase.co');
insert into public.config_privada (chave, valor)
select 'url_projeto', substring(command from 'https://[a-z0-9]+\.supabase\.co')
from cron.job where command ~ 'https://[a-z0-9]+\.supabase\.co' limit 1
on conflict (chave) do nothing;

create or replace function public.chamar_funcao(nome text, corpo jsonb default '{}')
returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select valor from public.config_privada where chave = 'url_projeto') || '/functions/v1/' || nome,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-segredo', (select valor from public.config_privada where chave = 'cron_segredo')),
    body := corpo,
    timeout_milliseconds := 120000
  )
$$;
revoke execute on function public.chamar_funcao(text, jsonb) from public, anon, authenticated;

select cron.schedule('buscar-vagas-12h', '0 3,15 * * *', $$select public.chamar_funcao('buscar-vagas')$$);
select cron.schedule('ler-outlook-horario', '20 * * * *', $$select public.chamar_funcao('outlook', '{"acao":"ler"}')$$);

-- Endereço do site para onde a Microsoft devolve a pessoa, guardado no clique em "Conectar Outlook"
alter table public.oauth_estados add column volta text;

-- Nunca usada: o currículo é lido no navegador e não é guardado
alter table public.perfil_busca drop column curriculo_texto;
