// Lê PDF/Word no navegador e monta um perfil de busca a partir do texto, sem IA:
// procura cargos e competências conhecidos (dicionario.ts), anos de experiência,
// cidade/estado e nível de inglês.
import { CARGOS, COMPETENCIAS, ESTADOS, type Cargo } from './dicionario'
import type { Nivel } from './lib'

export async function extrairTexto(arquivo: File): Promise<string> {
  const nome = arquivo.name.toLowerCase()
  const buffer = await arquivo.arrayBuffer()

  if (nome.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const doc = await pdfjs.getDocument({ data: buffer }).promise
    const paginas: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const conteudo = await (await doc.getPage(i)).getTextContent()
      paginas.push(conteudo.items.map(it => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : '')).join(''))
    }
    return paginas.join('\n')
  }

  if (nome.endsWith('.docx')) {
    const mammoth = await import('mammoth/mammoth.browser')
    return (await mammoth.extractRawText({ arrayBuffer: buffer })).value
  }

  throw new Error('Formato não suportado. Envie um PDF ou Word (.docx).')
}

export interface PerfilExtraido {
  nome: string
  cargos: Cargo[]
  competencias: string[]
  anos: number | null
  nivel: Nivel
  ingles: boolean
  cidade: string | null
  estado: string | null
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function padrao(termo: string) {
  const t = norm(termo).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${t}($|[^a-z0-9])`, 'g')
}
const ocorrencias = (texto: string, termo: string) => texto.match(padrao(termo))?.length ?? 0

const SECOES = /^(contato|resumo|sobre|perfil|objetivo|experiencia|experiencias|formacao|educacao|competencias|principais competencias|habilidades|idiomas|languages|certifications|certificacoes|cursos|skills|summary|experience|education|curriculo|curriculum vitae)$/

function acharNome(linhas: string[]): string {
  const candidatas = linhas.slice(0, 60).map((l, i) => ({ l: l.trim(), i })).filter(({ l }) =>
    /^[A-ZÀ-Ú][a-zà-ú]+(?: (?:d[aeo]s? |e )?[A-ZÀ-Ú][a-zà-ú]+){1,4}$/.test(l) && !SECOES.test(norm(l)))
  // Em geral o nome vem logo antes do título profissional ("Analista X | Y" no LinkedIn)
  const prox = (i: number) => norm(linhas[i + 1] ?? '')
  const comTitulo =
    candidatas.find(({ i }) => prox(i).includes('|')) ??
    candidatas.find(({ i }) => CARGOS.some(c => c.pt.some(p => p.length > 6 && padrao(p).test(prox(i)))))
  return (comTitulo ?? candidatas[0])?.l ?? ''
}

function acharLocal(texto: string): { cidade: string | null; estado: string | null } {
  for (const [uf, nome] of ESTADOS) {
    const re = new RegExp(`([A-ZÀ-Ú][a-zà-ú]+(?: (?:d[aeo]s? )?[A-ZÀ-Ú][a-zà-ú]+)*)\\s*[,/-]\\s*(?:${nome}|${uf})(?![a-zA-Z])`)
    const m = texto.match(re)
    if (m && !SECOES.test(norm(m[1]))) return { cidade: m[1], estado: nome }
  }
  return { cidade: null, estado: null }
}

function acharAnos(texto: string): number | null {
  const atual = new Date().getFullYear()
  const anos = [...texto.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)].map(m => Number(m[1])).filter(a => a <= atual)
  if (!anos.length) return null
  return Math.min(40, atual - Math.min(...anos))
}

function temIngles(t: string) {
  const i = t.search(/ingles|english/)
  if (i < 0) return false
  const perto = t.slice(i, i + 80)
  return /intermediario|avancado|fluente|profissional|professional|fluent|advanced|upper|bilingual|c1|c2|b2/.test(perto)
}

export function analisar(texto: string): PerfilExtraido {
  const t = norm(texto)
  const inicio = t.slice(0, Math.max(400, Math.floor(t.length * 0.15)))

  // Cargo citado no topo (título/resumo) pesa mais que um citado no meio das experiências
  const cargos = CARGOS
    .map(c => ({ c, pontos: c.pt.reduce((s, p) => s + ocorrencias(t, p) + 3 * ocorrencias(inicio, p), 0) }))
    .filter(x => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 5)
    .map(x => x.c)

  const competencias = [...new Set(COMPETENCIAS.filter(c => padrao(c).test(t)))].slice(0, 30)
  const anos = acharAnos(texto)
  const nivel: Nivel = anos === null ? 'pleno' : anos < 2 ? 'junior' : anos < 6 ? 'pleno' : 'senior'

  return {
    nome: acharNome(texto.split('\n')),
    cargos,
    competencias,
    anos,
    nivel,
    ingles: temIngles(t),
    ...acharLocal(texto),
  }
}

// Termos de exclusão padrão conforme o nível: quem já tem experiência não quer estágio
export function exclusoesPadrao(nivel: Nivel): string[] {
  const base = ['jovem aprendiz']
  if (nivel !== 'junior') base.push('estágio', 'estagiário', 'estagiária', 'intern', 'internship', 'trainee')
  if (nivel === 'senior') base.push('júnior', 'junior', 'jr')
  return base
}
