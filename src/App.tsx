import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { DEMO, STATUS, hoje, statusInfo, supabase, type Evento, type Status, type Modelo, type PerfilBusca, type Sugestao, type TipoEvento, type Vaga } from './lib'
import Login from './Login'
import MindMap from './MindMap'
import Kanban from './Kanban'
import Sugestoes from './Sugestoes'
import PerfilEditor from './PerfilEditor'
import Conta from './Conta'
import Modelos from './Modelos'
import VagaPanel, { type VagaNova } from './VagaPanel'

type Visao = 'mapa' | 'kanban' | 'sugestoes'

// Eventos registrados automaticamente quando a vaga muda de etapa
const EVENTO_DO_STATUS: Partial<Record<Status, TipoEvento>> = {
  aplicado: 'aplicacao', entrevista: 'entrevista', teste: 'teste', oferta: 'oferta', recusado: 'recusa',
}

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [vagas, setVagas] = useState<Vaga[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  // undefined = ainda carregando; null = usuário novo, sem perfil de busca
  const [perfil, setPerfil] = useState<PerfilBusca | null | undefined>(undefined)
  const [painel, setPainel] = useState<'perfil' | 'conta' | 'modelos' | null>(null)
  const [modelos, setModelos] = useState<Modelo[]>([])
  // Quem gerencia os convites; o e-mail fica no banco (config_privada), conferido por public.e_admin()
  const [admin, setAdmin] = useState(false)
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
    const [v, e, s, p, m, a] = await Promise.all([
      supabase.from('vagas').select('*').order('created_at', { ascending: false }),
      supabase.from('eventos').select('*'),
      supabase.from('sugestoes').select('*').eq('estado', 'nova')
        .order('nota', { ascending: false }).order('publicado_em', { ascending: false }),
      supabase.from('perfil_busca').select('*').maybeSingle(),
      supabase.from('modelos').select('*').order('created_at'),
      supabase.rpc('e_admin'),
    ])
    if (v.error || e.error || s.error || p.error) return setErro((v.error ?? e.error ?? s.error ?? p.error)!.message)
    setPerfil(p.data as PerfilBusca | null)
    setModelos((m.data ?? []) as Modelo[])
    setAdmin(a.data === true)
    setVagas(v.data as Vaga[])
    setEventos(e.data as Evento[])
    setSugestoes(s.data as Sugestao[])
  }, [])

  useEffect(() => { if (sessao) carregar() }, [sessao, carregar])
  useEffect(() => { try { localStorage.setItem('visao', visao) } catch { /* sem storage */ } }, [visao])

  // Volta do login da Microsoft: ?outlook=ok|erro
  useEffect(() => {
    const r = new URLSearchParams(location.search).get('outlook')
    if (!r) return
    history.replaceState(null, '', location.pathname)
    setPainel('conta')
    if (r !== 'ok') setErro('Não foi possível conectar o Outlook. Tente de novo pelo painel 👤.')
  }, [])

  if (sessao === undefined) return <div className="carregando">Carregando…</div>
  if (!sessao) return <Login />
  if (perfil === undefined && !erro) return <div className="carregando">Carregando…</div>
  if (perfil === null) {
    return <PerfilEditor perfil={null} primeiroAcesso onSalvo={async p => {
      setPerfil(p)
      setVisao('sugestoes')
      await supabase.functions.invoke('buscar-vagas')
      await carregar()
    }} />
  }

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

  async function marcarSugestao(s: Sugestao, estado: Sugestao['estado']) {
    setSugestoes(ss => ss.filter(x => x.id !== s.id))
    falhou((await supabase.from('sugestoes').update({ estado }).eq('id', s.id)).error)
  }

  async function salvarSugestao(s: Sugestao, aplicada: boolean) {
    const { data, error } = await supabase.from('vagas').insert({
      empresa: s.empresa ?? s.fonte, cargo: s.titulo, link: s.url, origem: s.fonte,
      local: s.local, salario: s.salario, notas: `Sugestão ${s.nota}/100: ${s.motivos.join('; ')}`,
      status: aplicada ? 'aplicado' : 'interesse', data_aplicacao: aplicada ? hoje() : null,
    }).select().single()
    if (falhou(error)) return
    setVagas(vs => [data as Vaga, ...vs])
    if (aplicada) await registrarEvento((data as Vaga).id, 'aplicacao', hoje(), `Candidatura enviada pela ${s.fonte}`)
    await marcarSugestao(s, 'salva')
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
            <button className={visao === 'sugestoes' ? 'on' : ''} onClick={() => setVisao('sugestoes')}>
              Sugestões{sugestoes.length > 0 && <span className="badge">{sugestoes.length}</span>}
            </button>
          </div>
          <button className="btn primary" onClick={() => setAberta('nova')}>+ Vaga</button>
          <button className="btn ghost sair" onClick={() => setPainel('conta')} title="Minha conta">👤</button>
        </div>
      </header>

      {DEMO && (
        <div className="faixa-demo">
          <span>🧪 <b>Demonstração</b> com dados fictícios: aplique, mova cards e anote à vontade. Ao sair ou recarregar, tudo volta ao início.</span>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Sair da demonstração</button>
        </div>
      )}

      {erro && <div className="erro" onClick={() => setErro(null)}>{erro} (toque para fechar)</div>}

      <main>
        {visao === 'sugestoes' ? (
          <Sugestoes sugestoes={sugestoes} perfil={perfil ?? null} modelos={modelos} onEditarPerfil={() => setPainel('perfil')}
            onGerenciarModelos={() => setPainel('modelos')} onAplicar={s => salvarSugestao(s, true)} onSalvar={s => salvarSugestao(s, false)}
            onDescartar={s => marcarSugestao(s, 'descartada')} onRecarregar={carregar} />
        ) : !vagas.length ? (
          <div className="vazio">
            <p>Nenhuma vaga ainda.</p>
            <button className="btn primary" onClick={() => setAberta('nova')}>Adicionar a primeira</button>
          </div>
        ) : visao === 'mapa'
          ? <MindMap nome={perfil?.nome?.split(' ')[0] || 'Você'} vagas={filtradas} eventos={eventos} onAbrir={setAberta} />
          : <Kanban vagas={filtradas} eventos={eventos} onAbrir={setAberta} onMover={mover} />}
      </main>

      {painel === 'perfil' && perfil && (
        <PerfilEditor perfil={perfil} onFechar={() => setPainel(null)} onSalvo={p => { setPerfil(p); setPainel(null) }} />
      )}
      {painel === 'modelos' && (
        <Modelos modelos={modelos} onMudou={setModelos} onFechar={() => setPainel(null)} />
      )}
      {painel === 'conta' && (
        <Conta email={sessao.user.email ?? ''} admin={admin} vagas={vagas} onAtualizou={carregar}
          onFechar={() => setPainel(null)} />
      )}

      {aberta && (
        <VagaPanel
          key={aberta === 'nova' ? 'nova' : aberta.id}
          vaga={vagaAberta}
          eventos={eventos}
          modelos={modelos}
          onGerenciarModelos={() => setPainel('modelos')}
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
