import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
)

export type Status =
  | 'interesse' | 'aplicado' | 'em_analise' | 'entrevista'
  | 'teste' | 'oferta' | 'recusado' | 'desistiu'

export type TipoEvento =
  | 'aplicacao' | 'resposta' | 'entrevista' | 'teste'
  | 'oferta' | 'recusa' | 'follow_up' | 'nota'

export interface Vaga {
  id: string
  empresa: string
  cargo: string
  link: string | null
  origem: string | null
  salario: string | null
  local: string | null
  status: Status
  prioridade: 1 | 2 | 3
  data_aplicacao: string | null
  contato: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export interface Evento {
  id: string
  vaga_id: string
  tipo: TipoEvento
  data: string
  descricao: string | null
  created_at: string
}

export interface Sugestao {
  id: string
  fonte: string
  externo_id: string
  titulo: string
  empresa: string | null
  url: string
  local: string | null
  resumo: string | null
  salario: string | null
  publicado_em: string | null
  nota: number
  motivos: string[]
  estado: 'nova' | 'salva' | 'descartada'
  created_at: string
}

export type Nivel = 'junior' | 'pleno' | 'senior'
export type Modalidade = 'remoto' | 'hibrido' | 'presencial'

export interface PerfilBusca {
  user_id: string
  nome: string | null
  nivel: Nivel
  modalidades: Modalidade[]
  cidade: string | null
  estado: string | null
  abrangencia: 'cidade' | 'estado'
  curriculo_nome: string | null
  curriculo_em: string | null
  termos_br: string[]
  termos_global: string[]
  cargos: string[]
  competencias: string[]
  excluir: string[]
  nota_minima: number
  ultima_busca: string | null
}

export const STATUS:{ id: Status; label: string; cor: string }[] = [
  { id: 'interesse', label: 'Interesse', cor: '#8b93a7' },
  { id: 'aplicado', label: 'Aplicado', cor: '#4c8dff' },
  { id: 'em_analise', label: 'Em análise', cor: '#22b3c9' },
  { id: 'entrevista', label: 'Entrevista', cor: '#a970ff' },
  { id: 'teste', label: 'Teste técnico', cor: '#e8a33d' },
  { id: 'oferta', label: 'Oferta', cor: '#2fb86b' },
  { id: 'recusado', label: 'Recusado', cor: '#e5534b' },
  { id: 'desistiu', label: 'Desisti', cor: '#6b6f7a' },
]

export const statusInfo = (s: Status) => STATUS.find(x => x.id === s)!

export const TIPOS: { id: TipoEvento; label: string; icone: string }[] = [
  { id: 'aplicacao', label: 'Aplicação', icone: '📤' },
  { id: 'resposta', label: 'Resposta', icone: '📩' },
  { id: 'entrevista', label: 'Entrevista', icone: '🎙️' },
  { id: 'teste', label: 'Teste', icone: '🧪' },
  { id: 'oferta', label: 'Oferta', icone: '🎉' },
  { id: 'recusa', label: 'Recusa', icone: '✖️' },
  { id: 'follow_up', label: 'Follow-up', icone: '🔁' },
  { id: 'nota', label: 'Nota', icone: '📝' },
]

export const tipoInfo = (t: TipoEvento) => TIPOS.find(x => x.id === t)!

// Status em que estou esperando resposta da empresa
const AGUARDANDO: Status[] = ['aplicado', 'em_analise', 'teste']

export function diasParado(vaga: Vaga, eventos: Evento[]): number | null {
  if (!AGUARDANDO.includes(vaga.status)) return null
  const datas = eventos.filter(e => e.vaga_id === vaga.id).map(e => e.data)
  if (vaga.data_aplicacao) datas.push(vaga.data_aplicacao)
  datas.push(vaga.updated_at.slice(0, 10))
  const ultima = datas.sort()[datas.length - 1]
  return Math.floor((Date.now() - new Date(ultima).getTime()) / 86_400_000)
}

export const hoje = () => new Date().toLocaleDateString('sv-SE')

export const fmtData = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

export interface Modelo {
  id: string
  nome: string
  palavras_chave: string[]
  habilidades: string[]
  texto: string
  padrao: boolean
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

// Escolhe o modelo cujas palavras-chave mais aparecem no título da vaga.
// Palavras mais longas pesam mais ("analista de sistemas" vence "sistemas").
export function escolherModelo(modelos: Modelo[], titulo: string): Modelo | null {
  if (!modelos.length) return null
  const t = normalizar(titulo)
  const pontos = (m: Modelo) => m.palavras_chave.reduce((s, p) => (p && t.includes(normalizar(p)) ? s + p.length : s), 0)
  const melhor = [...modelos].sort((a, b) => pontos(b) - pontos(a) || Number(b.padrao) - Number(a.padrao))[0]
  return pontos(melhor) > 0 ? melhor : modelos.find(m => m.padrao) ?? modelos[0]
}

// A Gupy usa o nome da página de carreiras, que às vezes vem com slogan
// ("Viaflow | Work Smarter") ou é só uma frase; nesse caso fica o genérico "empresa".
function nomeEmpresa(empresa: string | null | undefined) {
  const nome = (empresa ?? '').split(/\s+[|–-]\s+|\s*\|\s*/)[0].trim()
  return nome && nome.length <= 40 && !/[!?]/.test(nome) ? nome : 'empresa'
}

export const preencher = (texto: string, vaga: { empresa?: string | null; cargo?: string | null }) =>
  texto
    .replace(/%empresa%/gi, nomeEmpresa(vaga.empresa))
    .replace(/%cargo%/gi, vaga.cargo?.split('|')[0].trim() || 'vaga')
