import { useState } from 'react'
import { supabase, type Modelo } from './lib'

type Rascunho = Omit<Modelo, 'id'> & { id?: string }
const NOVO: Rascunho = { nome: '', palavras_chave: [], habilidades: [], texto: '', padrao: false }

export default function Modelos({ modelos, onMudou, onFechar }: {
  modelos: Modelo[]
  onMudou: (m: Modelo[]) => void
  onFechar: () => void
}) {
  const [editando, setEditando] = useState<Rascunho | null>(null)
  const [chaves, setChaves] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function abrir(m: Rascunho) {
    setEditando({ ...m, habilidades: [...m.habilidades, '', '', ''].slice(0, 3) })
    setChaves(m.palavras_chave.join(', '))
    setErro(null)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    setSalvando(true)
    const { id, ...resto } = editando
    const dados = {
      ...resto,
      palavras_chave: chaves.split(',').map(t => t.trim()).filter(Boolean),
      habilidades: editando.habilidades.map(h => h.trim()).filter(Boolean),
      // O primeiro modelo criado vira o padrão
      padrao: editando.padrao || !modelos.some(m => m.id !== id),
      updated_at: new Date().toISOString(),
    }
    const q = id ? supabase.from('modelos').update(dados).eq('id', id) : supabase.from('modelos').insert(dados)
    const { data, error } = await q.select().single()
    if (error) { setSalvando(false); return setErro(error.message) }
    const salvo = data as Modelo
    // Só um modelo pode ser o padrão
    if (salvo.padrao) await supabase.from('modelos').update({ padrao: false }).neq('id', salvo.id)
    setSalvando(false)
    const outros = modelos.filter(m => m.id !== salvo.id).map(m => (salvo.padrao ? { ...m, padrao: false } : m))
    onMudou(id ? modelos.map(m => (m.id === id ? salvo : outros.find(o => o.id === m.id)!)) : [...outros, salvo])
    setEditando(null)
  }

  async function excluir(m: Modelo) {
    if (!confirm(`Excluir o modelo "${m.nome}"?`)) return
    if ((await supabase.from('modelos').delete().eq('id', m.id)).error) return
    onMudou(modelos.filter(x => x.id !== m.id))
  }

  return (
    <>
      <div className="fundo" onClick={onFechar} />
      <aside className="painel painel-largo">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        {editando ? (
          <form onSubmit={salvar} className="form">
            <h2>{editando.id ? 'Editar modelo' : 'Novo modelo'}</h2>
            <label>Nome<input required placeholder="Ex.: Atendimento ao cliente" value={editando.nome}
              onChange={e => setEditando({ ...editando, nome: e.target.value })} /></label>
            <label>Usar quando o título da vaga tiver
              <input placeholder="atendimento, sac, customer success" value={chaves} onChange={e => setChaves(e.target.value)} />
              <small>Palavras separadas por vírgula. O app escolhe o modelo que mais combina com o título.</small>
            </label>
            <fieldset className="tres-hab">
              <legend>3 habilidades em destaque</legend>
              {editando.habilidades.map((h, i) => (
                <input key={i} value={h} placeholder={`Habilidade ${i + 1}`} onChange={e => {
                  const hs = [...editando.habilidades]
                  hs[i] = e.target.value
                  setEditando({ ...editando, habilidades: hs })
                }} />
              ))}
            </fieldset>
            <label>Texto sobre mim
              <textarea rows={12} required value={editando.texto} onChange={e => setEditando({ ...editando, texto: e.target.value })} />
              <small>
                Use <code>%empresa%</code> e <code>%cargo%</code>: são trocados pelo nome da empresa e pelo título da vaga.
                {' '}{editando.texto.length} caracteres.
              </small>
            </label>
            <label className="check">
              <input type="checkbox" checked={editando.padrao} onChange={e => setEditando({ ...editando, padrao: e.target.checked })} />
              Modelo padrão (usado quando nenhum outro combina)
            </label>
            {erro && <p className="aviso-erro">{erro}</p>}
            <div className="acoes">
              <button type="button" className="btn" onClick={() => setEditando(null)}>Voltar</button>
              <button className="btn primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar modelo'}</button>
            </div>
          </form>
        ) : (
          <>
            <h2>Modelos de apresentação</h2>
            <p className="muted">O texto "sobre mim" que a Gupy e outros sites pedem, com uma versão para cada tipo de vaga.</p>
            <ul className="modelos">
              {modelos.map(m => (
                <li key={m.id}>
                  <div>
                    <strong>{m.nome}</strong>{m.padrao && <span className="tag-padrao">padrão</span>}
                    <small>{m.palavras_chave.slice(0, 5).join(', ') || 'sem palavras-chave'}</small>
                    <div className="chips">{m.habilidades.map(h => <span key={h} className="chip-motivo">{h}</span>)}</div>
                  </div>
                  <div className="acoes">
                    <button className="btn" onClick={() => abrir(m)}>Editar</button>
                    <button className="btn ghost perigo" onClick={() => excluir(m)} aria-label={`Excluir ${m.nome}`}>×</button>
                  </div>
                </li>
              ))}
              {!modelos.length && <li className="muted">Nenhum modelo ainda.</li>}
            </ul>
            <button className="btn primary" onClick={() => abrir(NOVO)}>+ Novo modelo</button>
          </>
        )}
      </aside>
    </>
  )
}
