// Modo demonstração: imita a parte do cliente do Supabase que o app usa, com os dados guardados só na memória da aba.
// Cada visitante tem a própria cópia; sair, recarregar ou fechar a aba volta tudo ao início.
import type { SupabaseClient } from '@supabase/supabase-js'
import { USUARIO, dadosIniciais } from './demonstracao-dados'

type Linha = Record<string, unknown>
type Erro = { message: string; code?: string }
type Resultado = { data: unknown; error: Erro | null }

// Chave usada no upsert quando a chamada não informa onConflict
const CHAVE: Record<string, string> = { perfil_busca: 'user_id', conexoes_email: 'user_id', convites: 'email' }

const copia = <T,>(v: T): T => structuredClone(v)

export function criarDemonstracao(): SupabaseClient {
  const db = dadosIniciais()
  const tabela = (t: string) => (db[t] ??= [])

  function completar(t: string, l: Linha): Linha {
    const agora = new Date().toISOString()
    return {
      id: crypto.randomUUID(), user_id: USUARIO.id, created_at: agora,
      ...(t === 'vagas' ? { updated_at: agora } : {}),
      ...(t === 'convites' ? { convidado_em: agora } : {}),
      ...l,
    }
  }

  class Consulta implements PromiseLike<Resultado> {
    private filtros: ((l: Linha) => boolean)[] = []
    private ordens: [string, boolean][] = []
    private limite = Infinity
    private modo: 'lista' | 'um' | 'talvez' = 'lista'
    private acao: 'ler' | 'inserir' | 'alterar' | 'apagar' | 'gravar' = 'ler'
    private dados: Linha | Linha[] = {}
    private conflito: string | undefined
    private t: string

    constructor(t: string) { this.t = t }

    select() { return this }
    eq(c: string, v: unknown) { this.filtros.push(l => l[c] === v); return this }
    neq(c: string, v: unknown) { this.filtros.push(l => l[c] !== v); return this }
    order(c: string, o?: { ascending?: boolean }) { this.ordens.push([c, o?.ascending ?? true]); return this }
    limit(n: number) { this.limite = n; return this }
    single() { this.modo = 'um'; return this }
    maybeSingle() { this.modo = 'talvez'; return this }
    insert(d: Linha | Linha[]) { this.acao = 'inserir'; this.dados = d; return this }
    update(d: Linha) { this.acao = 'alterar'; this.dados = d; return this }
    delete() { this.acao = 'apagar'; return this }
    upsert(d: Linha | Linha[], o?: { onConflict?: string }) { this.acao = 'gravar'; this.dados = d; this.conflito = o?.onConflict; return this }

    then<A = Resultado, B = never>(ok?: ((r: Resultado) => A | PromiseLike<A>) | null, falha?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve().then(() => this.executar()).then(ok, falha)
    }

    private executar(): Resultado {
      const linhas = tabela(this.t)
      const passa = (l: Linha) => this.filtros.every(f => f(l))
      const lista = Array.isArray(this.dados) ? this.dados : [this.dados]
      let afetadas: Linha[]

      if (this.acao === 'inserir') {
        if (this.t === 'convites' && lista.some(d => linhas.some(l => l.email === d.email))) {
          return { data: null, error: { message: 'duplicate key', code: '23505' } }
        }
        afetadas = lista.map(d => completar(this.t, d))
        linhas.push(...afetadas)
      } else if (this.acao === 'alterar') {
        afetadas = linhas.filter(passa)
        for (const l of afetadas) Object.assign(l, this.dados, this.t === 'vagas' ? { updated_at: new Date().toISOString() } : {})
      } else if (this.acao === 'apagar') {
        afetadas = linhas.filter(passa)
        db[this.t] = linhas.filter(l => !passa(l))
        // Mesmo efeito do "on delete cascade" / "set null" do banco
        if (this.t === 'vagas') {
          const ids = new Set(afetadas.map(v => v.id))
          db.eventos = tabela('eventos').filter(e => !ids.has(e.vaga_id))
          for (const e of tabela('emails_recebidos')) if (ids.has(e.vaga_id)) e.vaga_id = null
        }
      } else if (this.acao === 'gravar') {
        const chaves = (this.conflito ?? CHAVE[this.t] ?? 'id').split(',')
        afetadas = lista.map(d => {
          const existente = linhas.find(l => chaves.every(k => l[k] === d[k]))
          if (existente) return Object.assign(existente, d)
          const nova = completar(this.t, d)
          linhas.push(nova)
          return nova
        })
      } else {
        afetadas = linhas.filter(passa)
        for (const [c, asc] of [...this.ordens].reverse()) {
          afetadas = [...afetadas].sort((a, b) => String(a[c] ?? '').localeCompare(String(b[c] ?? ''), 'pt-BR', { numeric: true }) * (asc ? 1 : -1))
        }
        afetadas = afetadas.slice(0, this.limite)
      }

      if (this.modo === 'um') {
        return afetadas.length === 1
          ? { data: copia(afetadas[0]), error: null }
          : { data: null, error: { message: 'Registro não encontrado na demonstração.' } }
      }
      if (this.modo === 'talvez') return { data: afetadas[0] ? copia(afetadas[0]) : null, error: null }
      return { data: copia(afetadas), error: null }
    }
  }

  const sessao = { access_token: 'demonstracao', user: { id: USUARIO.id, email: USUARIO.email } }

  // "Buscar agora" encontra algumas vagas da reserva a cada clique
  function buscarVagas(): Resultado {
    const novas = tabela('reserva').splice(0, 2).map(s => ({ ...s, publicado_em: new Date().toISOString() }))
    tabela('sugestoes').push(...novas)
    for (const p of tabela('perfil_busca')) p.ultima_busca = new Date().toISOString()
    return { data: { ok: true, resultados: [{ analisadas: 140 + Math.floor(Math.random() * 80), novas: novas.length }] }, error: null }
  }

  const cliente = {
    from: (t: string) => new Consulta(t),
    rpc: async (nome: string): Promise<Resultado> => nome === 'excluir_minha_conta'
      ? { data: null, error: { message: 'Na demonstração não há conta para excluir. Ao sair, tudo volta ao início.' } }
      : { data: false, error: null },
    functions: {
      invoke: async (nome: string, opcoes?: { body?: { acao?: string } }): Promise<Resultado> => {
        if (nome === 'buscar-vagas') return buscarVagas()
        if (opcoes?.body?.acao === 'conectar') {
          return { data: { erro: 'Na demonstração não dá para conectar um Outlook de verdade. Os e-mails abaixo são de exemplo.' }, error: null }
        }
        for (const c of tabela('conexoes_email')) c.ultima_leitura = new Date().toISOString()
        return { data: { ok: true, lidos: 0 }, error: null }
      },
    },
    auth: {
      getSession: async () => ({ data: { session: sessao }, error: null }),
      getUser: async () => ({ data: { user: sessao.user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      // Sair da demonstração = voltar para a tela de login, sem o ?demo
      signOut: async () => { location.href = location.pathname; return { error: null } },
    },
  }
  return cliente as unknown as SupabaseClient
}
