import { useEffect, useState } from 'react'
import { supabase, type PerfilBusca, type Sugestao } from './lib'

const corNota = (n: number) => (n >= 75 ? '#2fb86b' : n >= 60 ? '#4c8dff' : '#e8a33d')

function haQuanto(d: string | null) {
  if (!d) return null
  const dias = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  return dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`
}

export default function Sugestoes({ sugestoes, onAplicar, onSalvar, onDescartar, onRecarregar }: {
  sugestoes: Sugestao[]
  onAplicar: (s: Sugestao) => void
  onSalvar: (s: Sugestao) => void
  onDescartar: (s: Sugestao) => void
  onRecarregar: () => Promise<void>
}) {
  const [perfil, setPerfil] = useState<PerfilBusca | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [fonte, setFonte] = useState('todas')
  // Vagas cuja página de candidatura foi aberta, esperando eu confirmar que enviei
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const alternar = (id: string, on: boolean) =>
    setAbertas(a => { const n = new Set(a); if (on) n.add(id); else n.delete(id); return n })

  useEffect(() => {
    supabase.from('perfil_busca').select('*').maybeSingle().then(({ data }) => setPerfil(data as PerfilBusca | null))
  }, [])

  async function buscarAgora() {
    setBuscando(true)
    setMsg(null)
    const { data, error } = await supabase.functions.invoke('buscar-vagas')
    setBuscando(false)
    if (error) return setMsg('A busca falhou. Tente de novo em alguns minutos.')
    const r = data?.resultados?.[0]
    setMsg(r ? `${r.analisadas} vagas analisadas, ${r.aprovadas} passaram no filtro.` : 'Busca concluída.')
    setPerfil(p => p && { ...p, ultima_busca: new Date().toISOString() })
    await onRecarregar()
  }

  const novas = sugestoes.filter(s => s.estado === 'nova')
  const fontes = [...new Set(novas.map(s => s.fonte))].sort()
  const lista = novas.filter(s => fonte === 'todas' || s.fonte === fonte)

  return (
    <div className="sugestoes">
      <div className="sug-topo">
        <div>
          <h2>Vagas para o seu perfil</h2>
          <p className="muted">
            Busca diária às 7h em Gupy, Remotive, Himalayas, Jobicy e RemoteOK
            {perfil?.ultima_busca && <> · última: {new Date(perfil.ultima_busca).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</>}
          </p>
        </div>
        <div className="sug-acoes">
          <select value={fonte} onChange={e => setFonte(e.target.value)} aria-label="Filtrar por fonte">
            <option value="todas">Todas as fontes</option>
            {fontes.map(f => <option key={f}>{f}</option>)}
          </select>
          <button className="btn" onClick={() => setEditando(true)}>⚙️ Filtro</button>
          <button className="btn primary" onClick={buscarAgora} disabled={buscando}>{buscando ? 'Buscando…' : '🔎 Buscar agora'}</button>
        </div>
      </div>
      {msg && <p className="aviso-busca">{msg}</p>}

      {!lista.length ? (
        <div className="vazio-sug">
          <p>Nenhuma sugestão nova{fonte !== 'todas' ? ` em ${fonte}` : ''}.</p>
          <p className="muted">As vagas que você salva ou descarta saem desta lista.</p>
        </div>
      ) : (
        <ul className="sug-lista">
          {lista.map(s => (
            <li key={s.id} className={`sug-card ${abertas.has(s.id) ? 'aberta' : ''}`}>
              <span className="nota" style={{ background: corNota(s.nota) }} title="Compatibilidade com seu perfil">{s.nota}</span>
              <div className="sug-corpo">
                <a href={s.url} target="_blank" rel="noreferrer" className="sug-titulo">{s.titulo}</a>
                <p className={`salario ${s.salario ? '' : 'sem'}`}>💰 {s.salario ?? 'Salário não informado'}</p>
                <p className="sug-meta">
                  {s.empresa && <strong>{s.empresa}</strong>}
                  <span>📍 {s.local ?? 'Remoto'}</span>
                  <span>via {s.fonte}</span>
                  {haQuanto(s.publicado_em) && <span>🕒 {haQuanto(s.publicado_em)}</span>}
                </p>
                <div className="chips">{s.motivos.map(m => <span key={m} className="chip-motivo">{m}</span>)}</div>
              </div>
              {abertas.has(s.id) ? (
                <div className="sug-botoes confirma">
                  <span>Enviou a candidatura?</span>
                  <button className="btn primary" onClick={() => { alternar(s.id, false); onAplicar(s) }}>✓ Apliquei</button>
                  <button className="btn ghost" onClick={() => alternar(s.id, false)}>Ainda não</button>
                </div>
              ) : (
                <div className="sug-botoes">
                  <a className="btn primary" href={s.url} target="_blank" rel="noreferrer" onClick={() => alternar(s.id, true)}>Aplicar ↗</a>
                  <button className="btn" onClick={() => onSalvar(s)} title="Guardar no mapa como Interesse">☆ Depois</button>
                  <button className="btn ghost" onClick={() => onDescartar(s)}>Descartar</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editando && perfil && (
        <FiltroPanel perfil={perfil} onFechar={() => setEditando(false)} onSalvo={p => { setPerfil(p); setEditando(false) }} />
      )}
    </div>
  )
}

const CAMPOS: { k: keyof PerfilBusca; label: string; ajuda: string }[] = [
  { k: 'termos_br', label: 'Buscas na Gupy (Brasil)', ajuda: 'O que digitar na busca da Gupy, já filtrada para remoto.' },
  { k: 'termos_global', label: 'Buscas internacionais', ajuda: 'Termos em inglês para Remotive, Himalayas e Jobicy.' },
  { k: 'cargos', label: 'Cargos que me interessam', ajuda: 'No título da vaga vale +45 pontos.' },
  { k: 'competencias', label: 'Minhas competências', ajuda: '+4 pontos cada uma encontrada (máx. 30).' },
  { k: 'excluir', label: 'Descartar se o título tiver', ajuda: 'A vaga é ignorada na hora.' },
]

function FiltroPanel({ perfil, onFechar, onSalvo }: {
  perfil: PerfilBusca; onFechar: () => void; onSalvo: (p: PerfilBusca) => void
}) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS.map(c => [c.k, (perfil[c.k] as string[]).join(', ')])))
  const [notaMinima, setNotaMinima] = useState(perfil.nota_minima)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const dados = {
      ...Object.fromEntries(CAMPOS.map(c => [c.k, form[c.k].split(',').map(t => t.trim()).filter(Boolean)])),
      nota_minima: notaMinima,
      updated_at: new Date().toISOString(),
    }
    const { data } = await supabase.from('perfil_busca').update(dados).eq('user_id', perfil.user_id).select().single()
    setSalvando(false)
    if (data) onSalvo(data as PerfilBusca)
  }

  return (
    <>
      <div className="fundo" onClick={onFechar} />
      <aside className="painel">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        <form onSubmit={salvar} className="form">
          <h2>Filtro de vagas</h2>
          <p className="muted">Separe os termos por vírgula. Vale a partir da próxima busca.</p>
          {CAMPOS.map(c => (
            <label key={c.k}>
              {c.label}
              <textarea rows={3} value={form[c.k]} onChange={e => setForm({ ...form, [c.k]: e.target.value })} />
              <small>{c.ajuda}</small>
            </label>
          ))}
          <label>
            Nota mínima: <b>{notaMinima}</b>
            <input type="range" min={20} max={90} step={5} value={notaMinima}
              onChange={e => setNotaMinima(Number(e.target.value))} />
          </label>
          <div className="acoes">
            <button type="button" className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar filtro'}</button>
          </div>
        </form>
      </aside>
    </>
  )
}
