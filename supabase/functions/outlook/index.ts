// Integração com o Outlook (Microsoft Graph) para acompanhar candidaturas pelos e-mails da Gupy.
//   POST { acao: 'conectar' }  (JWT do usuário) -> URL de login da Microsoft
//   GET  /outlook/callback      (volta da Microsoft) -> guarda o refresh_token e volta ao site
//   POST { acao: 'ler' }        (JWT do usuário ou header x-cron-segredo) -> lê e-mails novos e atualiza as vagas
// Precisa dos secrets MS_CLIENT_ID e MS_CLIENT_SECRET (app registrado no Microsoft Entra).
import { createClient } from 'npm:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CLIENT_ID = Deno.env.get('MS_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET') ?? ''
const SITE = 'https://vagas-remotas.vercel.app'
const REDIRECT = `${Deno.env.get('SUPABASE_URL')}/functions/v1/outlook/callback`
const LOGIN = 'https://login.microsoftonline.com/common/oauth2/v2.0'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const ESCOPOS = 'offline_access User.Read Mail.Read'
const DIAS_INICIAIS = 60 // na primeira leitura, olha os últimos 60 dias

type Tipo = 'candidatura' | 'avanco' | 'teste' | 'entrevista' | 'oferta' | 'recusa' | 'outro'
type Status = 'interesse' | 'aplicado' | 'em_analise' | 'entrevista' | 'teste' | 'oferta' | 'recusado' | 'desistiu'
type Vaga = { id: string; empresa: string; cargo: string; link: string | null; status: Status }

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

// ---------- OAuth ----------

async function token(params: Record<string, string>) {
  const r = await fetch(`${LOGIN}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: ESCOPOS, ...params }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error_description ?? j.error ?? `token ${r.status}`)
  return j as { access_token: string; refresh_token: string }
}

async function graph(url: string, acesso: string) {
  const r = await fetch(url.startsWith('http') ? url : `${GRAPH}${url}`, {
    headers: { Authorization: `Bearer ${acesso}`, Prefer: 'outlook.body-content-type="text"' },
  })
  if (!r.ok) throw new Error(`Graph ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

async function callback(url: URL) {
  const volta = (r: string) => Response.redirect(`${SITE}/?outlook=${r}`, 302)
  const estado = url.searchParams.get('state') ?? ''
  const code = url.searchParams.get('code')
  const { data: e } = await admin.from('oauth_estados').delete().eq('estado', estado).select().maybeSingle()
  if (!e || !code || Date.now() - new Date(e.criado_em).getTime() > 15 * 60_000) return volta('erro')
  try {
    const t = await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT })
    const eu = await graph('/me?$select=mail,userPrincipalName', t.access_token)
    await admin.from('conexoes_email').upsert({
      user_id: e.user_id, provedor: 'outlook', email: eu.mail ?? eu.userPrincipalName,
      refresh_token: t.refresh_token, erro: null, ultima_leitura: null,
    })
    await lerConexao(e.user_id)
    return volta('ok')
  } catch (err) {
    console.error(err)
    return volta('erro')
  }
}

// ---------- classificação dos e-mails ----------

// A ordem importa: uma recusa costuma mencionar "etapa", um convite de entrevista pode citar "teste"
const REGRAS: [Tipo, RegExp][] = [
  // "Obrigada pelo interesse em fazer parte do nosso time!" é o assunto padrão de recusa da Gupy
  ['recusa', /nao (seguiremos|vamos seguir|avancou|avancara|foi selecionad|prosseguir|daremos continuidade)|infelizmente|processo (foi )?(encerrad|finalizad|cancelad)|outr[oa]s? (candidat|perfi)|reprovad|nao foi possivel seguir|obrigad[oa] pelo interesse|agradecemos (a )?sua participacao|vaga (foi )?descontinuada|seguiremos em conexao/],
  ['oferta', /proposta|carta oferta|voce foi aprovad|foi contratad|bem[- ]vind[oa] ao time|parabens.{0,40}aprovad/],
  ['entrevista', /entrevista|bate[- ]papo|conversa com (o|a) (gestor|lider|time|rh)/],
  ['teste', /teste|desafio|case tecnico|avaliacao|fit cultural|prova |mapeamento comportamental|etapa (de )?video|concluir etapa/],
  ['candidatura', /candidatura (foi )?(realizada|recebida|enviada|confirmada|concluida)|inscricao (foi )?(realizada|confirmada|concluida)|obrigad[oa] por se (candidatar|inscrever)/],
  ['avanco', /avancou|proxima etapa|nova etapa|mudou de etapa|segue no processo|continua no processo/],
]

// E-mails da Gupy que não são sobre uma candidatura: alertas de vaga, banco de talentos, cadastro
const ALERTA = /^nova vaga|vagas? (recomendad|para voce|que combinam|novas)|novas oportunidades|encontramos vagas|receba vagas|queremos voce no banco de talentos|confirmar seu e-?mail|convite pra conhecer/

function classificar(texto: string): Tipo {
  const t = norm(texto)
  return REGRAS.find(([, re]) => re.test(t))?.[0] ?? 'outro'
}

// ---------- associação e-mail -> vaga ----------

function pistasDoLink(link: string | null) {
  if (!link) return { sub: null as string | null, jobId: null as string | null }
  try {
    const u = new URL(link)
    const sub = u.hostname.endsWith('.gupy.io') ? u.hostname.replace('.gupy.io', '') : null
    // Links da Gupy trazem {"jobId":123,...} em base64 no caminho
    const b64 = u.pathname.split('/').pop() ?? ''
    const jobId = atob(b64.replace(/-/g, '+').replace(/_/g, '/')).match(/"jobId":(\d+)/)?.[1] ?? null
    return { sub, jobId }
  } catch {
    return { sub: null, jobId: null }
  }
}

const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'pessoa', 'vaga', 'remoto', 'home', 'office'])

function associar(texto: string, vagas: Vaga[]): Vaga | null {
  const t = norm(texto)
  let melhor: Vaga | null = null
  let maior = 0
  for (const v of vagas) {
    let pontos = 0
    const { sub, jobId } = pistasDoLink(v.link)
    if (jobId && t.includes(jobId)) pontos += 40
    if (sub && t.includes(`${sub}.gupy.io`)) pontos += 20
    const empresa = norm(v.empresa.split(/\s+[|–-]\s+|\s*\|\s*/)[0]).trim()
    if (empresa.length >= 3 && t.includes(empresa)) pontos += 15
    const palavras = norm(v.cargo).split(/[^a-z0-9]+/).filter(p => p.length > 2 && !PALAVRAS_VAZIAS.has(p))
    if (palavras.length) pontos += 10 * (palavras.filter(p => t.includes(p)).length / palavras.length)
    if (pontos > maior) { maior = pontos; melhor = v }
  }
  // Só associa com alguma pista forte (empresa, subdomínio ou id da vaga), não só pelo cargo
  return maior >= 15 ? melhor : null
}

// ---------- efeito na vaga ----------

const FINAIS: Status[] = ['oferta', 'recusado', 'desistiu']
const ROTULO: Record<Tipo, string> = {
  candidatura: 'Candidatura confirmada', avanco: 'Avançou de etapa', teste: 'Teste', entrevista: 'Entrevista',
  oferta: 'Proposta', recusa: 'Processo encerrado', outro: 'E-mail',
}
const EVENTO: Record<Tipo, string> = {
  candidatura: 'aplicacao', avanco: 'resposta', teste: 'teste', entrevista: 'entrevista', oferta: 'oferta', recusa: 'recusa', outro: 'nota',
}

function novoStatus(atual: Status, tipo: Tipo): Status | null {
  if (FINAIS.includes(atual)) return null
  switch (tipo) {
    case 'candidatura': return atual === 'interesse' ? 'aplicado' : null
    case 'avanco': return ['interesse', 'aplicado'].includes(atual) ? 'em_analise' : null
    case 'teste': return atual === 'teste' ? null : 'teste'
    case 'entrevista': return atual === 'entrevista' ? null : 'entrevista'
    case 'oferta': return 'oferta'
    case 'recusa': return 'recusado'
    default: return null
  }
}

// ---------- leitura ----------

async function lerConexao(userId: string) {
  const { data: c } = await admin.from('conexoes_email').select('*').eq('user_id', userId).single()
  if (!c) return { lidos: 0 }
  try {
    const t = await token({ grant_type: 'refresh_token', refresh_token: c.refresh_token })
    // Graph exige ISO com Z; o banco devolve "+00:00", e o "+" se perderia na URL
    const desde = new Date(c.ultima_leitura ?? Date.now() - DIAS_INICIAIS * 86_400_000).toISOString()
    const inicio = new Date().toISOString()

    // Busca só e-mails cujo remetente cita "gupy", em qualquer pasta, independente do volume da caixa.
    // $search não aceita $filter/$orderby junto, então o corte por data é feito aqui.
    const msgs: any[] = []
    let url: string | null = `/me/messages?$search=${encodeURIComponent('"from:gupy"')}` +
      '&$top=50&$select=id,subject,from,receivedDateTime,bodyPreview,body'
    for (let pagina = 0; url && pagina < 20; pagina++) {
      const r = await graph(url, t.access_token)
      msgs.push(...r.value)
      url = r['@odata.nextLink'] ?? null
    }
    // Só e-mails da Gupy desde a última leitura, sem os alertas de "nova vaga para você"
    const daGupy = msgs
      .filter(m => m.receivedDateTime >= desde)
      .filter(m => /gupy/i.test(m.from?.emailAddress?.address ?? '') && !ALERTA.test(norm(m.subject ?? '')))
      .sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime))

    const { data: vagas } = await admin.from('vagas').select('id, empresa, cargo, link, status').eq('user_id', userId)
    const lista = (vagas ?? []) as Vaga[]

    for (const m of daGupy) {
      const texto = `${m.subject ?? ''}\n${m.body?.content ?? m.bodyPreview ?? ''}`
      const tipo = classificar(texto)
      const vaga = associar(texto, lista)
      const { data: novo } = await admin.from('emails_recebidos').upsert({
        user_id: userId, mensagem_id: m.id, recebido_em: m.receivedDateTime,
        remetente: m.from?.emailAddress?.address, assunto: m.subject, trecho: (m.bodyPreview ?? '').slice(0, 300),
        tipo, vaga_id: vaga?.id ?? null,
      }, { onConflict: 'user_id,mensagem_id', ignoreDuplicates: true }).select().maybeSingle()
      if (!novo || !vaga) continue

      const data = m.receivedDateTime.slice(0, 10)
      await admin.from('eventos').insert({
        vaga_id: vaga.id, user_id: userId, tipo: EVENTO[tipo], data, descricao: `Gupy: ${ROTULO[tipo]} (${m.subject ?? 'sem assunto'})`,
      })
      const status = novoStatus(vaga.status, tipo)
      if (status) {
        await admin.from('vagas').update({ status, ...(status === 'aplicado' ? { data_aplicacao: data } : {}) }).eq('id', vaga.id)
        vaga.status = status
      }
      await admin.from('emails_recebidos').update({ aplicado: true }).eq('id', novo.id)
    }

    await admin.from('conexoes_email').update({ refresh_token: t.refresh_token, ultima_leitura: inicio, erro: null }).eq('user_id', userId)
    // Resumo dos remetentes ajuda a ver se a Gupy usa algum endereço que o filtro não pega
    const dominios: Record<string, number> = {}
    for (const m of msgs) {
      const d = (m.from?.emailAddress?.address ?? '?').split('@').pop()!.toLowerCase()
      dominios[d] = (dominios[d] ?? 0) + 1
    }
    const principais = Object.entries(dominios).sort((a, b) => b[1] - a[1]).slice(0, 15)
    // Assuntos que ficaram de fora (alerta ou antigos), para conferir se o filtro está certo
    const ignorados = msgs.filter(m => !daGupy.includes(m))
      .map(m => `${m.receivedDateTime.slice(0, 10)} ${m.subject ?? ''}`).sort().reverse().slice(0, 50)
    return { lidos: daGupy.length, analisados: msgs.length, principais, ignorados }
  } catch (err) {
    const msg = String((err as Error).message ?? err)
    await admin.from('conexoes_email').update({
      erro: /invalid_grant|AADSTS700082|AADSTS50173/.test(msg) ? 'A autorização expirou. Conecte o Outlook de novo.' : msg.slice(0, 300),
    }).eq('user_id', userId)
    throw err
  }
}

// ---------- rotas ----------

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)
  if (url.pathname.endsWith('/callback')) return callback(url)
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ erro: 'Integração com o Outlook ainda não configurada (MS_CLIENT_ID / MS_CLIENT_SECRET).' }, 503)

  try {
    const { acao } = await req.json().catch(() => ({ acao: null }))

    const segredo = req.headers.get('x-cron-segredo')
    if (segredo) {
      const { data } = await admin.from('config_privada').select('valor').eq('chave', 'cron_segredo').single()
      if (!data || data.valor !== segredo) return json({ erro: 'não autorizado' }, 401)
      // Erros passageiros não param a leitura automática; só a autorização expirada (que exige reconectar)
      const { data: conexoes } = await admin.from('conexoes_email').select('user_id, erro')
        .or('erro.is.null,erro.not.like.A autorização expirou*')
      const resultados = []
      for (const c of conexoes ?? []) resultados.push(await lerConexao(c.user_id).catch(e => ({ erro: String(e) })))
      return json({ ok: true, resultados })
    }

    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const { data: u } = await admin.auth.getUser(jwt)
    if (!u.user) return json({ erro: 'não autorizado' }, 401)

    if (acao === 'conectar') {
      const estado = crypto.randomUUID()
      await admin.from('oauth_estados').insert({ estado, user_id: u.user.id })
      const q = new URLSearchParams({
        client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT, response_mode: 'query',
        scope: ESCOPOS, state: estado, prompt: 'select_account',
      })
      return json({ url: `${LOGIN}/authorize?${q}` })
    }
    if (acao === 'ler') return json({ ok: true, ...(await lerConexao(u.user.id)) })
    return json({ erro: 'ação inválida' }, 400)
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 500)
  }
})
