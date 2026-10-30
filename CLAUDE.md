# Radar de Vagas

Tracker de candidaturas a vagas de emprego (qualquer área e modalidade), em português. Começou como app pessoal do Eduardo e hoje aceita outras pessoas **por convite**.
Chamava-se "Vagas Remotas"; o nome mudou porque o app busca vagas de todo tipo. O nome é escolha do Eduardo: **Radar de Vagas**, em todo lugar.
Site: https://radardevagas.vercel.app (radar-de-vagas.vercel.app pertence a outro app; vagas-remotas.vercel.app continua apontando para este projeto) ·
Repo: github.com/eduardoalthaus/radar-de-vagas (público, licença MIT). Projeto no Supabase também se chama `radar-de-vagas`.

## Arquitetura

- **Frontend**: Vite + React + TypeScript (`src/`), sem roteador nem lib de estado. Mapa mental com `@xyflow/react`.
  Telas: Mapa, Kanban e Sugestões (alternadas em `App.tsx`), painéis laterais para vaga, perfil, modelos e conta.
- **Supabase** (id `uplzlegibigvnaftrcfr`, região sa-east-1, plano gratuito): Postgres + Auth + Edge Functions + pg_cron/pg_net.
- **Vercel** (projeto `radar-de-vagas`, time `eduardo-althaus-projects`, plano Hobby) hospeda o build estático. O deploy automático pelo GitHub **não** está ligado.

## Tabelas (todas com RLS por `user_id = auth.uid()`)

`vagas`, `eventos` (andamento de cada vaga), `sugestoes` (vagas encontradas pela busca), `perfil_busca` (filtro de cada usuário),
`modelos` (textos "sobre mim" por tipo de vaga), `convites`, `conexoes_email` (Outlook; o `refresh_token` não é legível pelo navegador),
`emails_recebidos`, `oauth_estados` e `config_privada` (segredo do cron, admin e URL do projeto; sem políticas, só service role/postgres).
O histórico de schema está em `supabase/migrations/`.

## Edge Functions (`supabase/functions/`)

- `buscar-vagas`: busca na Gupy e na Sólides (endpoints públicos **não oficiais** dos portais, `portal.gupy.io/api/job-search/jobs` e
  `vagas.solides.com.br/api/vacancies`, máx. 20 por página), na Remotar (`api.remotar.com.br`), em repositórios de vagas do GitHub
  (backend-br, frontendbr…; leitura guardada 15 min, token opcional `GITHUB_TOKEN`) e, para quem tem inglês, em Remotive, Himalayas, Jobicy e RemoteOK;
  pontua cada vaga contra `perfil_busca` (cargo no título +45, competências +4 até 30, nível, local) e grava em `sugestoes`.
- `outlook`: OAuth com a Microsoft (app registrado no Entra do Eduardo, que aceita contas pessoais), lê e-mails da Gupy via Graph (`$search="from:gupy"`),
  classifica (recusa, oferta, entrevista, teste, candidatura, avanço) com regras feitas a partir de assuntos reais e move a vaga de etapa.
- As duas usam `verify_jwt = false` e fazem a própria autenticação: JWT do usuário **ou** header `x-cron-segredo` (valor em `config_privada`).
- Agendamentos (pg_cron): `buscar-vagas-12h` às 3h e 15h UTC (0h e 12h de Brasília) e `ler-outlook-horario` no minuto 20 de cada hora.
- Secrets das funções (`MS_CLIENT_ID`, `MS_CLIENT_SECRET`) ficam no painel do Supabase. **Nunca** escrever segredos no código, em arquivos ou no chat.

## Regras de negócio que não estão óbvias no código

- O repositório é pensado para ser **público e instalável por outras pessoas**: nada de e-mail, URL do projeto ou segredo no código.
  O que muda entre instalações fica em `config_privada`: `admin_email` (a primeira conta criada vira admin), `cadastro_aberto` (`sim` libera o cadastro),
  `url_projeto` (usada por `public.chamar_funcao`, que o pg_cron chama) e `cron_segredo`.
- Admin: `public.e_admin()` compara o e-mail do JWT com `admin_email`; o front pergunta via `rpc('e_admin')`.
  Cadastro só passa pelo trigger `somente_dono` se o e-mail for o admin, estiver em `convites` ou `cadastro_aberto = 'sim'`.
- Modo demonstração (`?demo` na URL, ou automático sem `VITE_SUPABASE_URL`): `src/demonstracao.ts` imita o cliente do Supabase em memória
  com os dados fictícios de `src/demonstracao-dados.ts`. Ao usar um método novo do supabase-js no app, implementar também lá.
- O OAuth do Outlook volta para a origem enviada pelo front no clique em Conectar (`oauth_estados.volta`), com `SITE_URL` como reserva.
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
- Para testar uma tela sem login, usar o modo demonstração (`npm run dev` sem `.env.local`, ou `/?demo`).
- Os prints do README (`docs/*.png`) são tirados da demonstração em 1360×820.
- Para disparar uma função à mão: `select net.http_post(...)` com o header `x-cron-segredo`, e ler o resultado em `net._http_response`.

## Estilo

- Código, nomes, comentários, mensagens de commit e textos da interface em **português**.
- TypeScript sem ponto e vírgula, aspas simples, componentes em um arquivo cada, CSS puro em `src/index.css` com variáveis e tema escuro.
- Comentários só onde explicam um porquê. Commits terminam com `Co-Authored-By`.
