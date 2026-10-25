import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { STATUS, hoje, statusInfo, supabase, type Evento, type Status, type TipoEvento, type Vaga } from './lib'
import Login from './Login'
import MindMap from './MindMap'
import Kanban from './Kanban'
import VagaPanel, { type VagaNova } from './VagaPanel'

type Visao = 'mapa' | 'kanban'

// Eventos registrados automaticamente quando a vaga muda de etapa
const EVENTO_DO_STATUS: Partial<Record<Status, TipoEvento>> = {
  aplicado: 'aplicacao', entrevista: 'entrevista', teste: 'teste', oferta: 'oferta', recusado: 'recusa',
}

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [vagas, setVagas] = useState<Vaga[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [visao, setVisao] = useState<Visao>(() => {
    try { return (localStorage.getItem('visao') as Visao) || 'mapa' } catch { return 'mapa' }
  })
  const [aberta, setAberta] = useState<Vaga | 'nova' | null>(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const carregar = useCallback(async () => {
    const [v, e] = await Promise.all([
      supabase.from('vagas').select('*').order('created_at', { ascending: false }),
      supabase.from('eventos').select('*'),
    ])
    if (v.error || e.error) return setErro((v.error ?? e.error)!.message)
    setVagas(v.data as Vaga[])
    setEventos(e.data as Evento[])
  }, [])

  useEffect(() => { if (sessao) carregar() }, [sessao, carregar])
  useEffect(() => { try { localStorage.setItem('visao', visao) } catch { /* sem storage */ } }, [visao])

  if (sessao === undefined) return <div className="carregando">Carregando…</div>
  if (!sessao) return <Login />

  const falhou = (e: { message: string } | null) => { if (e) { setErro(e.message); return true } return false }

  async function registrarEvento(vagaId: string, tipo: TipoEvento, data: string, descricao: string) {
    const { data: novo, error } = await supabase.from('eventos')
      .insert({ vaga_id: vagaId, tipo, data, descricao: descricao || null }).select().single()
    if (!falhou(error)) setEventos(es => [...es, novo as Evento])
  }

  async function salvar(dados: VagaNova, id?: string) {
    const anterior = vagas.find(v => v.id === id)
    const q = id
      ? supabase.from('vagas').update(dados).eq('id', id)
      : supabase.from('vagas').insert(dados)
    const { data, error } = await q.select().single()
    if (falhou(error)) return
    const v = data as Vaga
    setVagas(vs => id ? vs.map(x => x.id === id ? v : x) : [v, ...vs])
    if (!id && v.status !== 'interesse') {
      await registrarEvento(v.id, 'aplicacao', v.data_aplicacao ?? hoje(), 'Candidatura enviada')
    } else if (anterior && anterior.status !== v.status) {
      await registrarStatus(v, anterior.status)
    }
    setAberta(id ? v : null)
  }

  async function registrarStatus(v: Vaga, de: Status) {
    const tipo = EVENTO_DO_STATUS[v.status] ?? 'nota'
    await registrarEvento(v.id, tipo, hoje(), `${statusInfo(de).label} → ${statusInfo(v.status).label}`)
  }

  async function mover(v: Vaga, status: Status) {
    setVagas(vs => vs.map(x => x.id === v.id ? { ...x, status } : x))
    const { data, error } = await supabase.from('vagas').update({ status }).eq('id', v.id).select().single()
    if (falhou(error)) return carregar()
    setVagas(vs => vs.map(x => x.id === v.id ? data as Vaga : x))
    await registrarStatus(data as Vaga, v.status)
  }

  async function excluir(v: Vaga) {
    if (falhou((await supabase.from('vagas').delete().eq('id', v.id)).error)) return
    setVagas(vs => vs.filter(x => x.id !== v.id))
    setAberta(null)
  }

  async function excluirEvento(e: Evento) {
    if (falhou((await supabase.from('eventos').delete().eq('id', e.id)).error)) return
    setEventos(es => es.filter(x => x.id !== e.id))
  }

  const termo = busca.trim().toLowerCase()
  const filtradas = termo
    ? vagas.filter(v => `${v.empresa} ${v.cargo} ${v.origem ?? ''}`.toLowerCase().includes(termo))
    : vagas

  const enviadas = vagas.filter(v => v.status !== 'interesse').length
  const comResposta = vagas.filter(v => !['interesse', 'aplicado'].includes(v.status)).length
  const andamento = vagas.filter(v => ['em_analise', 'entrevista', 'teste'].includes(v.status)).length
  const ofertas = vagas.filter(v => v.status === 'oferta').length
  const vagaAberta = aberta && aberta !== 'nova' ? vagas.find(v => v.id === aberta.id) ?? null : null

  return (
    <div className="app">
      <header className="topo">
        <div className="marca">🧭 <span>Vagas Remotas</span></div>
        <div className="stats">
          <div><b>{enviadas}</b><small>enviadas</small></div>
          <div><b>{enviadas ? Math.round((comResposta / enviadas) * 100) : 0}%</b><small>responderam</small></div>
          <div><b>{andamento}</b><small>em processo</small></div>
          <div><b style={{ color: STATUS[5].cor }}>{ofertas}</b><small>ofertas</small></div>
        </div>
        <div className="controles">
          <input className="busca" placeholder="Buscar…" value={busca} onChange={e => setBusca(e.target.value)} />
          <div className="alterna">
            <button className={visao === 'mapa' ? 'on' : ''} onClick={() => setVisao('mapa')}>Mapa</button>
            <button className={visao === 'kanban' ? 'on' : ''} onClick={() => setVisao('kanban')}>Kanban</button>
          </div>
          <button className="btn primary" onClick={() => setAberta('nova')}>+ Vaga</button>
          <button className="btn ghost sair" onClick={() => supabase.auth.signOut()} title="Sair">Sair</button>
        </div>
      </header>

      {erro && <div className="erro" onClick={() => setErro(null)}>{erro} (toque para fechar)</div>}

      <main>
        {!vagas.length ? (
          <div className="vazio">
            <p>Nenhuma vaga ainda.</p>
            <button className="btn primary" onClick={() => setAberta('nova')}>Adicionar a primeira</button>
          </div>
        ) : visao === 'mapa'
          ? <MindMap vagas={filtradas} eventos={eventos} onAbrir={setAberta} />
          : <Kanban vagas={filtradas} eventos={eventos} onAbrir={setAberta} onMover={mover} />}
      </main>

      {aberta && (
        <VagaPanel
          key={aberta === 'nova' ? 'nova' : aberta.id}
          vaga={vagaAberta}
          eventos={eventos}
          onFechar={() => setAberta(null)}
          onSalvar={salvar}
          onExcluir={excluir}
          onEvento={registrarEvento}
          onExcluirEvento={excluirEvento}
        />
      )}
    </div>
  )
}
