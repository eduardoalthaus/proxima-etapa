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

## Observação

O Supabase gratuito pausa o projeto após 7 dias sem acesso; é só reativar no painel.
