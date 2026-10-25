// Busca vagas remotas em fontes públicas, pontua contra o perfil de cada usuário
// e grava em `sugestoes` as que passam da nota mínima.
// Chamada pelo pg_cron (header x-cron-segredo) ou pelo botão "Buscar agora" (JWT do usuário).
import { createClient } from 'npm:@supabase/supabase-js@2'

type Perfil = {
  user_id: string
  termos_br: string[]
  termos_global: string[]
  cargos: string[]
  competencias: string[]
  excluir: string[]
  nota_minima: number
}

type Vaga = {
  fonte: string
  externo_id: string
  titulo: string
  empresa: string | null
  url: string
  local: string | null
  descricao: string
  publicado_em: string | null
  global: boolean // fonte internacional: precisa checar restrição de país
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const MAX_DIAS = 30

// ---------- utilidades ----------

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const semHtml = (s: string) =>
  s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim()

// Casa termo como palavra inteira (evita "ai" casar com "email", "jr" com "jrs")
function contem(texto: string, termo: string) {
  const t = semAcento(termo).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${t}($|[^a-z0-9])`).test(texto)
}

function iso(d: unknown): string | null {
  if (d === null || d === undefined || d === '') return null
  const t = new Date(typeof d === 'number' && d < 1e12 ? d * 1000 : (d as string))
  return isNaN(t.getTime()) ? null : t.toISOString()
}

async function getJson(url: string): Promise<any> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (vagas-remotas pessoal)' }, signal: AbortSignal.timeout(20_000) })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

// ---------- fontes ----------

async function gupy(termos: string[]): Promise<Vaga[]> {
  const res = await Promise.all(termos.map(t =>
    getJson(`https://portal.gupy.io/api/job-search/jobs?jobName=${encodeURIComponent(t)}&limit=100&offset=0&workplaceType=remote`)))
  return res.flatMap(r => (r?.data ?? []).map((j: any): Vaga => ({
    fonte: 'Gupy', externo_id: String(j.id), titulo: j.name, empresa: j.careerPageName,
    url: j.jobUrl, local: 'Brasil (remoto)', descricao: j.description ?? '', publicado_em: iso(j.publishedDate), global: false,
  })))
}

async function remotive(termos: string[]): Promise<Vaga[]> {
  const res = await Promise.all(termos.map(t => getJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(t)}&limit=100`)))
  return res.flatMap(r => (r?.jobs ?? []).map((j: any): Vaga => ({
    fonte: 'Remotive', externo_id: String(j.id), titulo: j.title, empresa: j.company_name, url: j.url,
    local: j.candidate_required_location, descricao: j.description ?? '', publicado_em: iso(j.publication_date), global: true,
  })))
}

async function himalayas(termos: string[]): Promise<Vaga[]> {
  const res = await Promise.all(termos.flatMap(t => [1, 2].map(p =>
    getJson(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(t)}&page=${p}`))))
  return res.flatMap(r => (r?.jobs ?? []).map((j: any): Vaga => ({
    fonte: 'Himalayas', externo_id: j.guid, titulo: j.title, empresa: j.companyName, url: j.applicationLink ?? j.guid,
    local: (j.locationRestrictions ?? []).join(', ') || 'Worldwide',
    descricao: j.description ?? j.excerpt ?? '', publicado_em: iso(j.pubDate), global: true,
  })))
}

async function jobicy(termos: string[]): Promise<Vaga[]> {
  const res = await Promise.all(termos.map(t => getJson(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(t)}`)))
  return res.flatMap(r => (r?.jobs ?? []).map((j: any): Vaga => ({
    fonte: 'Jobicy', externo_id: String(j.id), titulo: j.jobTitle, empresa: j.companyName, url: j.url,
    local: j.jobGeo, descricao: j.jobDescription ?? j.jobExcerpt ?? '', publicado_em: iso(j.pubDate), global: true,
  })))
}

async function remoteok(): Promise<Vaga[]> {
  const r = await getJson('https://remoteok.com/api')
  return (Array.isArray(r) ? r.slice(1) : []).map((j: any): Vaga => ({
    fonte: 'RemoteOK', externo_id: String(j.id), titulo: j.position, empresa: j.company, url: j.url,
    local: j.location || 'Worldwide', descricao: j.description ?? '', publicado_em: iso(j.date), global: true,
  }))
}

// ---------- pontuação ----------

const LIBERADO = /worldwide|anywhere|global|latam|latin america|south america|americas|brazil|brasil/

function pontuar(v: Vaga, p: Perfil): { nota: number; motivos: string[] } | null {
  const titulo = semAcento(v.titulo)
  const corpo = semAcento(`${v.titulo} ${semHtml(v.descricao)}`)

  const excluido = p.excluir.find(t => contem(titulo, t))
  if (excluido) return null
  // Vaga internacional restrita a outro país: não dá para aplicar do Brasil
  const local = semAcento(v.local ?? '')
  if (v.global && local && !LIBERADO.test(local)) return null

  let nota = 0
  const motivos: string[] = []

  const cargoTitulo = p.cargos.find(c => contem(titulo, c))
  if (cargoTitulo) { nota += 45; motivos.push(`cargo: ${cargoTitulo}`) }
  else {
    const cargoTexto = p.cargos.find(c => contem(corpo, c))
    if (cargoTexto) { nota += 5; motivos.push(`menciona ${cargoTexto}`) }
  }

  const skills = [...new Set(p.competencias.filter(c => contem(corpo, c)))]
  if (skills.length) {
    nota += Math.min(30, skills.length * 4)
    motivos.push(skills.slice(0, 6).join(', '))
  }

  if (/(^|[^a-z])(pleno|mid|senior|sr|ii|iii)([^a-z]|$)/.test(titulo)) { nota += 10; motivos.push('nível pleno/sênior') }
  else if (/especialista|specialist/.test(titulo)) { nota += 5 }
  if (/(^|[^a-z])(staff|principal|head|director|diretor|vp|lead|lider)([^a-z]|$)/.test(titulo)) { nota -= 15; motivos.push('cargo de liderança') }

  if (!v.global) { nota += 10; motivos.push('Brasil remoto') }
  else if (/brazil|brasil|latam|latin america|south america/.test(local)) { nota += 5; motivos.push(`aceita ${v.local}`) }

  return { nota: Math.max(0, Math.min(100, nota)), motivos }
}

// ---------- execução ----------

async function rodar(perfil: Perfil) {
  const [br, ...globais] = await Promise.all([
    gupy(perfil.termos_br),
    remotive(perfil.termos_global),
    himalayas(perfil.termos_global),
    jobicy(perfil.termos_global),
    remoteok(),
  ])
  const todas = [br, ...globais].flat()

  const limite = Date.now() - MAX_DIAS * 86_400_000
  const vistas = new Set<string>()
  const linhas = []
  for (const v of todas) {
    if (!v.titulo || !v.url) continue
    if (v.publicado_em && new Date(v.publicado_em).getTime() < limite) continue
    // A mesma vaga costuma aparecer em várias buscas e fontes
    const chave = semAcento(`${v.titulo}|${v.empresa ?? ''}`)
    if (vistas.has(chave)) continue
    vistas.add(chave)

    const r = pontuar(v, perfil)
    if (!r || r.nota < perfil.nota_minima) continue
    linhas.push({
      user_id: perfil.user_id, fonte: v.fonte, externo_id: v.externo_id, titulo: v.titulo.trim(),
      empresa: v.empresa, url: v.url, local: v.local, resumo: semHtml(v.descricao).slice(0, 400),
      publicado_em: v.publicado_em, nota: r.nota, motivos: r.motivos,
    })
  }

  // ignoreDuplicates mantém o estado (salva/descartada) de sugestões já vistas
  const { error } = await admin.from('sugestoes')
    .upsert(linhas, { onConflict: 'user_id,fonte,externo_id', ignoreDuplicates: true })
  if (error) throw error
  await admin.from('perfil_busca').update({ ultima_busca: new Date().toISOString() }).eq('user_id', perfil.user_id)
  return { analisadas: todas.length, aprovadas: linhas.length }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    let filtro: string | null = null
    const segredo = req.headers.get('x-cron-segredo')
    if (segredo) {
      const { data } = await admin.from('config_privada').select('valor').eq('chave', 'cron_segredo').single()
      if (!data || data.valor !== segredo) return json({ erro: 'não autorizado' }, 401)
    } else {
      const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
      const { data } = await admin.auth.getUser(token)
      if (!data.user) return json({ erro: 'não autorizado' }, 401)
      filtro = data.user.id
    }

    let q = admin.from('perfil_busca').select('*')
    if (filtro) q = q.eq('user_id', filtro)
    const { data: perfis, error } = await q
    if (error) throw error

    const resultados = []
    for (const p of perfis as Perfil[]) resultados.push(await rodar(p))
    return json({ ok: true, resultados })
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 500)
  }
})
