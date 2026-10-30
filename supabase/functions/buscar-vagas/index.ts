// Busca vagas em fontes públicas, pontua contra o perfil de cada usuário
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
  nivel: 'junior' | 'pleno' | 'senior'
  modalidades: Modalidade[]
  cidade: string | null
  estado: string | null
  abrangencia: 'cidade' | 'estado'
  ultima_busca: string | null
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
  salario: string | null
  global: boolean // fonte internacional: precisa checar restrição de país
  modalidade?: Modalidade // fontes brasileiras que misturam remoto, híbrido e presencial
}

type Modalidade = 'remoto' | 'hibrido' | 'presencial'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const MAX_DIAS = 30
const INTERVALO_MANUAL = 60_000 // só evita cliques repetidos

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

const MOEDA: Record<string, string> = { USD: 'US$', EUR: '€', GBP: '£', BRL: 'R$', CAD: 'C$' }
const PERIODO: Record<string, string> = { annual: 'ano', year: 'ano', yearly: 'ano', month: 'mês', monthly: 'mês', hour: 'hora', hourly: 'hora' }
const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

function faixa(min: unknown, max: unknown, moeda?: string | null, periodo?: string | null): string | null {
  const a = Number(min) || 0
  const b = Number(max) || 0
  if (!a && !b) return null
  const m = MOEDA[(moeda ?? 'USD').toUpperCase()] ?? moeda
  const valor = a && b && a !== b ? `${k(a)}–${k(b)}` : k(a || b)
  const p = PERIODO[(periodo ?? '').toLowerCase()]
  return `${m} ${valor}${p ? `/${p}` : ''}`
}

// Algumas empresas da Gupy colocam a remuneração no texto da vaga
async function salarioGupy(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (vagas-remotas)' }, signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return null
    const html = await r.text()
    const dados = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
    if (!dados) return null
    const job = JSON.parse(dados)?.props?.pageProps?.job ?? {}
    const texto = semHtml([job.description, job.responsibilities, job.prerequisites, job.relevantExperiences].join(' '))
    const valores = texto.match(/R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g)
    if (!valores) return null
    return [...new Set(valores.map(v => v.replace(/R\$\s?/, 'R$ ')))].slice(0, 2).join(' – ')
  } catch {
    return null
  }
}

async function getJson(url: string): Promise<any> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (vagas-remotas)' }, signal: AbortSignal.timeout(20_000) })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

// ---------- fontes ----------

const UF: Record<string, string> = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM', 'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF',
  'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG',
  'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE', 'Piauí': 'PI', 'Rio de Janeiro': 'RJ',
  'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR', 'Santa Catarina': 'SC',
  'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO',
}

const TIPO_GUPY = { remoto: 'remote', hibrido: 'hybrid', presencial: 'on-site' } as const
const ROTULO: Record<string, string> = { remote: 'Remoto', hybrid: 'Híbrido', 'on-site': 'Presencial' }

async function gupy(p: Perfil): Promise<Vaga[]> {
  const buscas = p.termos_br.flatMap(t => p.modalidades.flatMap(m => {
    const q = new URLSearchParams({ jobName: t, limit: '100', offset: '0', workplaceType: TIPO_GUPY[m] })
    if (m !== 'remoto') {
      if (!p.estado) return []
      q.set('state', p.estado)
      if (p.abrangencia === 'cidade' && p.cidade) q.set('city', p.cidade)
    }
    return [`https://portal.gupy.io/api/job-search/jobs?${q}`]
  }))
  const res = await Promise.all(buscas.map(getJson))
  return res.flatMap(r => (r?.data ?? []).map((j: any): Vaga => ({
    fonte: 'Gupy', externo_id: String(j.id), titulo: j.name, empresa: j.careerPageName, url: j.jobUrl,
    local: j.workplaceType === 'remote' ? 'Brasil (remoto)' : `${ROTULO[j.workplaceType] ?? 'Presencial'} · ${[j.city, j.state].filter(Boolean).join('/')}`,
    descricao: j.description ?? '', publicado_em: iso(j.publishedDate), salario: null, global: false,
  })))
}

// Sólides: busca pública do portal vagas.solides.com.br (não oficial, como a da Gupy). Máximo de 20 por página.
async function solides(p: Perfil): Promise<Vaga[]> {
  const uf = UF[p.estado ?? '']
  const urls = p.termos_br.flatMap(t => p.modalidades.flatMap(m => {
    let local = ''
    if (m !== 'remoto') {
      if (!uf) return []
      local = p.abrangencia === 'cidade' && p.cidade ? `${p.cidade} - ${uf}` : uf
    }
    return [1, 2].map(pagina => 'https://vagas.solides.com.br/api/vacancies?' +
      new URLSearchParams({ page: String(pagina), take: '20', title: t, locations: local, jobsType: m }))
  }))
  const res = await Promise.all(urls.map(getJson))
  return res.flatMap(r => (r?.data ?? []).map((j: any): Vaga => ({
    fonte: 'Sólides', externo_id: String(j.id), titulo: j.title, empresa: j.companyName,
    url: `https://${j.slug}.vagas.solides.com.br/vaga/${j.id}`,
    local: j.jobType === 'remoto' ? 'Brasil (remoto)'
      : `${j.jobType === 'hibrido' ? 'Híbrido' : 'Presencial'} · ${[j.city?.name, j.state?.code].filter(Boolean).join('/')}`,
    descricao: j.description ?? '', publicado_em: iso(j.createdAt),
    salario: faixa(j.salary?.initialRange, j.salary?.finalRange, 'BRL', 'month'), global: false,
    modalidade: j.jobType === 'hibrido' ? 'hibrido' : j.jobType === 'presencial' ? 'presencial' : 'remoto',
  })))
}

// Remotar: agregador brasileiro de vagas remotas, com API aberta
async function remotar(termos: string[]): Promise<Vaga[]> {
  const res = await Promise.all(termos.map(t => getJson(`https://api.remotar.com.br/jobs?search=${encodeURIComponent(t)}&page=1`)))
  return res.flatMap(r => (r?.data ?? []).map((j: any): Vaga => ({
    fonte: 'Remotar', externo_id: String(j.id), titulo: j.title, empresa: j.companyDisplayName ?? j.company?.name ?? null,
    url: `https://remotar.com.br/job/${j.id}`,
    local: j.type === 'remote' ? 'Brasil (remoto)' : `Híbrido · ${[j.city, j.state].filter(Boolean).join('/')}`,
    descricao: `${j.subtitle ?? ''} ${j.description ?? ''}`, publicado_em: iso(j.createdAt),
    // A Remotar manda o salário em centavos
    salario: faixa(Number(j.jobSalary?.from) / 100, Number(j.jobSalary?.to) / 100, j.jobSalary?.currency ?? 'BRL', 'month'), global: false,
    modalidade: j.type === 'remote' ? 'remoto' : 'hibrido',
  })))
}

// Repositórios da comunidade dev brasileira em que as vagas são issues. São iguais para todos os usuários,
// então a leitura é guardada por alguns minutos (o GitHub sem token permite 60 chamadas por hora por IP).
const REPOS_GITHUB = [
  'backend-br/vagas', 'frontendbr/vagas', 'qa-brasil/vagas', 'react-brasil/vagas',
  'dotnetdevbr/vagas', 'phpdevbr/vagas', 'androiddevbr/vagas', 'vuejs-br/vagas',
]
let cacheGithub: { em: number; vagas: Promise<Vaga[]> } | null = null

function github(): Promise<Vaga[]> {
  if (cacheGithub && Date.now() - cacheGithub.em < 15 * 60_000) return cacheGithub.vagas
  const token = Deno.env.get('GITHUB_TOKEN')
  const vagas = Promise.all(REPOS_GITHUB.map(async repo => {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'vagas-remotas', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: AbortSignal.timeout(20_000),
      })
      if (!r.ok) return []
      return ((await r.json()) as any[]).filter(i => !i.pull_request).map((i): Vaga => {
        const etiquetas = semAcento(i.labels.map((l: any) => l.name).join(' '))
        const titulo = semAcento(i.title)
        const modalidade: Modalidade = /remot/.test(`${etiquetas} ${titulo}`) ? 'remoto'
          : /hibrid/.test(`${etiquetas} ${titulo}`) ? 'hibrido' : 'presencial'
        // Títulos seguem "[Local] Cargo na/@ Empresa"
        const local = i.title.match(/^\s*\[([^\]]+)\]/)?.[1] ?? ''
        const empresa = i.title.replace(/^\s*\[[^\]]*\]\s*/, '').match(/\s(?:na|no|at|@)\s+(.+)$/i)?.[1]?.trim() ?? repo.split('/')[0]
        return {
          fonte: 'GitHub', externo_id: `${repo}#${i.number}`, titulo: i.title.replace(/^\s*\[[^\]]*\]\s*/, ''), empresa,
          url: i.html_url, local: modalidade === 'remoto' ? 'Brasil (remoto)' : `${modalidade === 'hibrido' ? 'Híbrido' : 'Presencial'} · ${local}`,
          descricao: `${i.labels.map((l: any) => l.name).join(', ')} ${i.body ?? ''}`, publicado_em: iso(i.created_at),
          salario: null, global: false, modalidade,
        }
      })
    } catch {
      return []
    }
  })).then(listas => listas.flat())
  cacheGithub = { em: Date.now(), vagas }
  return vagas
}

// Fontes que misturam modalidades: só passa o que o perfil aceita, e o que não é remoto precisa ser no lugar escolhido
function combinaLocal(v: Vaga, p: Perfil): boolean {
  if (!v.modalidade) return true
  if (!p.modalidades.includes(v.modalidade)) return false
  if (v.modalidade === 'remoto') return true
  const local = semAcento(v.local ?? '')
  const uf = UF[p.estado ?? '']?.toLowerCase()
  if (p.abrangencia === 'cidade' && p.cidade) return local.includes(semAcento(p.cidade))
  return !!p.estado && (local.includes(semAcento(p.estado)) || (!!uf && new RegExp(`(^|[^a-z])${uf}([^a-z]|$)`).test(local)))
}

async function remotive(termos: string[]): Promise<Vaga[]> {
  const res = await Promise.all(termos.map(t => getJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(t)}&limit=100`)))
  return res.flatMap(r => (r?.jobs ?? []).map((j: any): Vaga => ({
    fonte: 'Remotive', externo_id: String(j.id), titulo: j.title, empresa: j.company_name, url: j.url,
    local: j.candidate_required_location, descricao: j.description ?? '', publicado_em: iso(j.publication_date), salario: j.salary || null, global: true,
  })))
}

async function himalayas(termos: string[]): Promise<Vaga[]> {
  const res = await Promise.all(termos.flatMap(t => [1, 2].map(p =>
    getJson(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(t)}&page=${p}`))))
  return res.flatMap(r => (r?.jobs ?? []).map((j: any): Vaga => ({
    fonte: 'Himalayas', externo_id: j.guid, titulo: j.title, empresa: j.companyName, url: j.applicationLink ?? j.guid,
    local: (j.locationRestrictions ?? []).join(', ') || 'Worldwide',
    descricao: j.description ?? j.excerpt ?? '', publicado_em: iso(j.pubDate),
    salario: faixa(j.minSalary, j.maxSalary, j.currency, j.salaryPeriod), global: true,
  })))
}

async function jobicy(termos: string[]): Promise<Vaga[]> {
  const res = await Promise.all(termos.map(t => getJson(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(t)}`)))
  return res.flatMap(r => (r?.jobs ?? []).map((j: any): Vaga => ({
    fonte: 'Jobicy', externo_id: String(j.id), titulo: j.jobTitle, empresa: j.companyName, url: j.url,
    local: j.jobGeo, descricao: j.jobDescription ?? j.jobExcerpt ?? '', publicado_em: iso(j.pubDate),
    salario: faixa(j.salaryMin, j.salaryMax, j.salaryCurrency, j.salaryPeriod), global: true,
  })))
}

async function remoteok(): Promise<Vaga[]> {
  const r = await getJson('https://remoteok.com/api')
  return (Array.isArray(r) ? r.slice(1) : []).map((j: any): Vaga => ({
    fonte: 'RemoteOK', externo_id: String(j.id), titulo: j.position, empresa: j.company, url: j.url,
    local: j.location || 'Worldwide', descricao: j.description ?? '', publicado_em: iso(j.date),
    salario: faixa(j.salary_min, j.salary_max, 'USD', 'annual'), global: true,
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

  const junior = /(^|[^a-z])(junior|jr|i)([^a-z]|$)|assistente|auxiliar/.test(titulo)
  const pleno = /(^|[^a-z])(pleno|pl|mid|ii)([^a-z]|$)/.test(titulo)
  const senior = /(^|[^a-z])(senior|sr|iii)([^a-z]|$)|especialista|specialist/.test(titulo)
  if (p.nivel === 'junior') {
    if (junior) { nota += 10; motivos.push('nível júnior') }
    if (senior) nota -= 10
  } else if (p.nivel === 'pleno') {
    if (pleno) { nota += 10; motivos.push('nível pleno') } else if (senior) nota += 5
  } else {
    if (senior) { nota += 10; motivos.push('nível sênior') } else if (pleno) { nota += 5; motivos.push('nível pleno') }
  }
  if (p.nivel !== 'senior' && /(^|[^a-z])(staff|principal|head|director|diretor|gerente|vp|lead|lider)([^a-z]|$)/.test(titulo)) {
    nota -= 15; motivos.push('cargo de liderança')
  }

  if (!v.global) { nota += 10; motivos.push(v.local ?? 'Brasil') }
  else if (/brazil|brasil|latam|latin america|south america/.test(local)) { nota += 5; motivos.push(`aceita ${v.local}`) }

  return { nota: Math.max(0, Math.min(100, nota)), motivos }
}

// ---------- vagas repetidas entre fontes ----------

// A Remotar (e às vezes a Sólides) republica vagas da Gupy com título e nome de empresa um pouco diferentes:
// "Montreal | Tecnologia e Inovação" x "Montreal Oficial", "Pessoa Analista X | Área" x "Pessoa Analista X".
type Assinatura = { titulo: string; empresa: string; nucleo: string }
const GENERICAS = new Set(['pessoa', 'empresa', 'grupo', 'the', 'com', 'ltda', 'oficial', 'vagas', 'tech', 'conecte'])

function assinatura(titulo: string, empresa: string | null): Assinatura {
  const e = semAcento(empresa ?? '').replace(/[^a-z0-9]+/g, ' ').trim()
  return {
    titulo: semAcento(titulo.replace(/^\s*\d{4,}\s*[-–|]\s*/, '').split('|')[0]).replace(/[^a-z0-9]+/g, ' ').trim(),
    empresa: e,
    nucleo: e.split(' ').find(w => w.length >= 3 && !GENERICAS.has(w)) ?? '',
  }
}

function mesmaVaga(a: Assinatura, b: Assinatura) {
  const titulo = a.titulo === b.titulo || (a.titulo.length > 15 && b.titulo.length > 15 &&
    (a.titulo.startsWith(b.titulo) || b.titulo.startsWith(a.titulo)))
  if (!titulo) return false
  if (!a.nucleo || !b.nucleo) return a.empresa === b.empresa
  return a.nucleo === b.nucleo || b.empresa.includes(a.nucleo) || a.empresa.includes(b.nucleo)
}

// ---------- execução ----------

async function rodar(perfil: Perfil) {
  // Fontes internacionais só têm vagas remotas e em inglês
  const internacional = perfil.modalidades.includes('remoto') && perfil.termos_global.length > 0
  const [br, ...globais] = await Promise.all([
    gupy(perfil),
    solides(perfil),
    perfil.modalidades.includes('remoto') || perfil.modalidades.includes('hibrido') ? remotar(perfil.termos_br) : [],
    github(),
    ...(internacional ? [
      remotive(perfil.termos_global),
      himalayas(perfil.termos_global),
      jobicy(perfil.termos_global),
      remoteok(),
    ] : []),
  ])
  const todas = [br, ...globais].flat()

  // Tudo o que o usuário já viu (sugestões em qualquer estado e vagas do mapa), para não sugerir de novo pela outra fonte
  const [{ data: existentes }, { data: doMapa }] = await Promise.all([
    admin.from('sugestoes').select('fonte, externo_id, titulo, empresa').eq('user_id', perfil.user_id),
    admin.from('vagas').select('cargo, empresa').eq('user_id', perfil.user_id),
  ])
  const jaVistas = new Set((existentes ?? []).map(e => `${e.fonte}|${e.externo_id}`))
  const conhecidas = [
    ...(existentes ?? []).map(e => assinatura(e.titulo, e.empresa)),
    ...(doMapa ?? []).map(v => assinatura(v.cargo, v.empresa)),
  ]

  const limite = Date.now() - MAX_DIAS * 86_400_000
  const vistas: Assinatura[] = []
  const linhas = []
  for (const v of todas) {
    if (!v.titulo || !v.url || !combinaLocal(v, perfil)) continue
    if (v.publicado_em && new Date(v.publicado_em).getTime() < limite) continue
    // A mesma vaga aparece em várias buscas e fontes; a que já existe em sugestoes segue o caminho normal (atualiza)
    const a = assinatura(v.titulo, v.empresa)
    if (vistas.some(b => mesmaVaga(a, b))) continue
    if (!jaVistas.has(`${v.fonte}|${v.externo_id}`) && conhecidas.some(b => mesmaVaga(a, b))) continue
    vistas.push(a)

    const r = pontuar(v, perfil)
    if (!r || r.nota < perfil.nota_minima) continue
    linhas.push({
      user_id: perfil.user_id, fonte: v.fonte, externo_id: v.externo_id,
      // Algumas empresas da Gupy prefixam o título com o código interno ("12728266 - ...")
      titulo: v.titulo.replace(/^\s*\d{4,}\s*[-–|]\s*/, '').trim(), salario: v.salario,
      empresa: v.empresa, url: v.url, local: v.local, resumo: semHtml(v.descricao).slice(0, 400),
      publicado_em: v.publicado_em, nota: r.nota, motivos: r.motivos,
    })
  }

  // Separa as vagas que o usuário nunca viu das que já estão em sugestoes (novas, salvas ou descartadas)
  const novas = linhas.filter(l => !jaVistas.has(`${l.fonte}|${l.externo_id}`))
  const antigas = linhas.filter(l => jaVistas.has(`${l.fonte}|${l.externo_id}`))

  // Só abre a página da Gupy (para achar o salário) das vagas novas
  await Promise.all(novas.filter(l => l.fonte === 'Gupy').map(async l => { l.salario = await salarioGupy(l.url) }))

  const { error } = await admin.from('sugestoes').insert(novas)
  if (error) throw error
  // Nas já vistas, atualiza título, nota e motivos sem tocar no estado nem apagar o salário encontrado antes
  if (antigas.length) {
    const { error: e2 } = await admin.from('sugestoes')
      .upsert(antigas.map(({ salario: _, ...resto }) => resto), { onConflict: 'user_id,fonte,externo_id' })
    if (e2) throw e2
  }
  await admin.from('perfil_busca').update({ ultima_busca: new Date().toISOString() }).eq('user_id', perfil.user_id)
  return { analisadas: todas.length, aprovadas: linhas.length, novas: novas.length }
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

    // Busca manual: ignora cliques repetidos em menos de um minuto
    const p0 = (perfis as Perfil[])[0]
    if (filtro && p0?.ultima_busca) {
      const falta = INTERVALO_MANUAL - (Date.now() - new Date(p0.ultima_busca).getTime())
      if (falta > 0) return json({ erro: 'aguarde', esperaMin: Math.ceil(falta / 60_000) }, 429)
    }

    const resultados = []
    for (const p of perfis as Perfil[]) resultados.push(await rodar(p))
    return json({ ok: true, resultados })
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 500)
  }
})
