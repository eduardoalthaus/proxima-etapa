# Vagas Remotas

Tracker pessoal de candidaturas a vagas remotas: mapa mental por etapa, kanban com arrastar e soltar, e linha do tempo de respostas por vaga.

- **Frontend:** Vite + React + TypeScript, mapa com [React Flow](https://reactflow.dev)
- **Dados e login:** Supabase (projeto `vagas-remotas`, região São Paulo). Cadastro bloqueado para qualquer e-mail que não seja o do dono (trigger em `auth.users`) e RLS por usuário.
- **Hospedagem:** Vercel (plano Hobby)

## Rodar local

```bash
npm install
cp .env.example .env.local   # preencha a publishable key
npm run dev
```

## Etapas

Interesse → Aplicado → Em análise → Entrevista → Teste técnico → Oferta / Recusado / Desisti.
Mudar a etapa (no kanban ou editando) registra um evento automático no andamento.
Vagas aguardando resposta há 7+ dias ganham o aviso ⏳.

## Sugestões de vagas

A Edge Function `buscar-vagas` (em `supabase/functions/`) roda todo dia às 7h via `pg_cron` e também pelo botão "Buscar agora".
Ela consulta Gupy (remoto, Brasil), Remotive, Himalayas, Jobicy e RemoteOK, descarta vagas restritas a outros países,
mais velhas que 30 dias ou com termos excluídos no título, e dá uma nota de 0 a 100:

- cargo de interesse no título: +45 (só na descrição: +5)
- cada competência encontrada: +4 (máx. 30)
- pleno/sênior: +10 · liderança: −15
- Gupy (Brasil remoto): +10 · internacional que aceita Brasil/LATAM: +5

Só entram as que passam da nota mínima. Termos, cargos, competências, exclusões e nota mínima são editáveis em Sugestões → Filtro.

A busca da Gupy usa o endpoint público do portal (sem documentação oficial), então pode mudar sem aviso.
Remotive, RemoteOK e Jobicy pedem crédito com link para a vaga original, que a tela mostra ("via ...").

Para publicar a função: `npx supabase functions deploy buscar-vagas --no-verify-jwt --project-ref uplzlegibigvnaftrcfr`.

## Observação

O Supabase gratuito pausa o projeto após 7 dias sem acesso; é só reativar no painel.
