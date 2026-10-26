# Vagas Remotas

Tracker de candidaturas a vagas de emprego, em português. Começou como app pessoal do Eduardo e hoje aceita outras pessoas **por convite**.
Site: https://vagas-remotas.vercel.app · Repo: github.com/eduardoalthaus/vagas-remotas (privado).

## Arquitetura

- **Frontend**: Vite + React + TypeScript (`src/`), sem roteador nem lib de estado. Mapa mental com `@xyflow/react`.
  Telas: Mapa, Kanban e Sugestões (alternadas em `App.tsx`), painéis laterais para vaga, perfil, modelos e conta.
- **Supabase** (projeto `vagas-remotas`, id `uplzlegibigvnaftrcfr`, região sa-east-1, plano gratuito): Postgres + Auth + Edge Functions + pg_cron/pg_net.
- **Vercel** (time `eduardo-althaus-projects`, plano Hobby) hospeda o build estático. O deploy automático pelo GitHub **não** está ligado.

## Tabelas (todas com RLS por `user_id = auth.uid()`)

`vagas`, `eventos` (andamento de cada vaga), `sugestoes` (vagas encontradas pela busca), `perfil_busca` (filtro de cada usuário),
`modelos` (textos "sobre mim" por tipo de vaga), `convites`, `conexoes_email` (Outlook; o `refresh_token` não é legível pelo navegador),
`emails_recebidos`, `oauth_estados` e `config_privada` (segredo do cron; sem políticas, só service role/postgres).
O histórico de schema está em `supabase/migrations/`.

## Edge Functions (`supabase/functions/`)

- `buscar-vagas`: busca na Gupy (endpoint público **não oficial** do portal, `portal.gupy.io/api/job-search/jobs`) e em Remotive, Himalayas, Jobicy e RemoteOK;
  pontua cada vaga contra `perfil_busca` (cargo no título +45, competências +4 até 30, nível, local) e grava em `sugestoes`.
- `outlook`: OAuth com a Microsoft (app registrado no Entra do Eduardo, que aceita contas pessoais), lê e-mails da Gupy via Graph (`$search="from:gupy"`),
  classifica (recusa, oferta, entrevista, teste, candidatura, avanço) com regras feitas a partir de assuntos reais e move a vaga de etapa.
- As duas usam `verify_jwt = false` e fazem a própria autenticação: JWT do usuário **ou** header `x-cron-segredo` (valor em `config_privada`).
- Agendamentos (pg_cron): `buscar-vagas-12h` às 3h e 15h UTC (0h e 12h de Brasília) e `ler-outlook-horario` no minuto 20 de cada hora.
- Secrets das funções (`MS_CLIENT_ID`, `MS_CLIENT_SECRET`) ficam no painel do Supabase. **Nunca** escrever segredos no código, em arquivos ou no chat.

## Regras de negócio que não estão óbvias no código

- Admin = `admin@exemplo.com`, fixo em **dois lugares**: `public.e_admin()`/`public.somente_dono()` no banco e `ADMIN` em `src/App.tsx`.
  Cadastro só passa pelo trigger `somente_dono` se o e-mail for o admin ou estiver em `convites`.
- O currículo (PDF/.docx) é lido **no navegador** (`src/curriculo.ts`, pdf.js + mammoth) e analisado por regras com `src/dicionario.ts`, sem IA (decisão do Eduardo).
  O arquivo não é enviado nem guardado.
- Não existe candidatura automática: Gupy, LinkedIn, Indeed e os ATS (Greenhouse, Lever…) não têm API para candidatos.
  O app abre a vaga ("Aplicar ↗"), mostra o kit de texto e habilidades (`Kit.tsx`) e registra quando a pessoa confirma "Apliquei".
- A Gupy não manda mais "Inscrição confirmada". Os e-mails úteis são os de etapa ("Etapa Fit Cultural desbloqueada…") e de recusa
  ("Obrigada pelo interesse em fazer parte do nosso time!"). Alertas de vaga e Banco de Talentos são ignorados (regex `ALERTA`).
- `%empresa%` e `%cargo%` nos modelos são preenchidos em `preencher()` (`src/lib.ts`), que descarta nomes de empresa que são slogans.

## Comandos

```bash
npm install
npm run dev        # precisa de .env.local com VITE_SUPABASE_URL e VITE_SUPABASE_KEY (publishable key)
npm run build      # tsc + vite; rodar antes de publicar
npx eslint src
npx vercel --prod --yes   # publica o site (a CLI já está ligada ao projeto em .vercel/)
```

- **Funções e migrações** foram publicadas pelo MCP do Supabase (`deploy_edge_function` / `apply_migration`), porque a CLI do Supabase não está logada.
  Ao mudar o banco, aplicar a migração **e** salvar o mesmo SQL em `supabase/migrations/`. Ao mudar uma função, publicar o conteúdo exato do arquivo local.
- Para testar uma tela sem login, criar uma página temporária (`demo.html` + `src/demo-*.tsx`) com dados de exemplo e **apagá-la antes do commit**.
- Para disparar uma função à mão: `select net.http_post(...)` com o header `x-cron-segredo`, e ler o resultado em `net._http_response`.

## Estilo

- Código, nomes, comentários, mensagens de commit e textos da interface em **português**.
- TypeScript sem ponto e vírgula, aspas simples, componentes em um arquivo cada, CSS puro em `src/index.css` com variáveis e tema escuro.
- Comentários só onde explicam um porquê. Commits terminam com `Co-Authored-By`.
