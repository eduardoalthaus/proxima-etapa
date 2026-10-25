import { useState } from 'react'
import {
  STATUS, TIPOS, fmtData, hoje, statusInfo, tipoInfo,
  type Evento, type TipoEvento, type Vaga,
} from './lib'

export type VagaNova = Omit<Vaga, 'id' | 'created_at' | 'updated_at'>

const VAZIA: VagaNova = {
  empresa: '', cargo: '', link: '', origem: '', salario: '', local: 'Remoto',
  status: 'aplicado', prioridade: 2, data_aplicacao: hoje(), contato: '', notas: '',
}

export default function VagaPanel({ vaga, eventos, onFechar, onSalvar, onExcluir, onEvento, onExcluirEvento }: {
  vaga: Vaga | null // null = nova vaga
  eventos: Evento[]
  onFechar: () => void
  onSalvar: (dados: VagaNova, id?: string) => Promise<void>
  onExcluir: (v: Vaga) => void
  onEvento: (vagaId: string, tipo: TipoEvento, data: string, descricao: string) => Promise<void>
  onExcluirEvento: (e: Evento) => void
}) {
  const [form, setForm] = useState<VagaNova>(vaga ?? VAZIA)
  const [editando, setEditando] = useState(!vaga)
  const [salvando, setSalvando] = useState(false)
  const [ev, setEv] = useState({ tipo: 'resposta' as TipoEvento, data: hoje(), descricao: '' })

  const campo = (k: keyof VagaNova) => ({
    value: (form[k] ?? '') as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value }),
  })

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    await onSalvar({ ...form, prioridade: Number(form.prioridade) as 1 | 2 | 3, data_aplicacao: form.data_aplicacao || null }, vaga?.id)
    setSalvando(false)
    if (vaga) setEditando(false)
  }

  async function addEvento(e: React.FormEvent) {
    e.preventDefault()
    if (!vaga) return
    await onEvento(vaga.id, ev.tipo, ev.data, ev.descricao)
    setEv({ ...ev, descricao: '' })
  }

  const linha = eventos.filter(e => e.vaga_id === vaga?.id)
    .sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at))
  const st = statusInfo(form.status)

  return (
    <>
      <div className="fundo" onClick={onFechar} />
      <aside className="painel">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>

        {editando ? (
          <form onSubmit={salvar} className="form">
            <h2>{vaga ? 'Editar vaga' : 'Nova vaga'}</h2>
            <label>Empresa*<input required {...campo('empresa')} /></label>
            <label>Cargo*<input required {...campo('cargo')} /></label>
            <label>Link da vaga<input type="url" placeholder="https://" {...campo('link')} /></label>
            <div className="duas">
              <label>Status<select {...campo('status')}>{STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
              <label>Prioridade<select {...campo('prioridade')}><option value={1}>Alta</option><option value={2}>Média</option><option value={3}>Baixa</option></select></label>
            </div>
            <div className="duas">
              <label>Onde achei<input placeholder="LinkedIn, Remotar…" {...campo('origem')} /></label>
              <label>Aplicado em<input type="date" {...campo('data_aplicacao')} /></label>
            </div>
            <div className="duas">
              <label>Salário<input placeholder="US$ 3k/mês" {...campo('salario')} /></label>
              <label>Local<input {...campo('local')} /></label>
            </div>
            <label>Contato / recrutador<input {...campo('contato')} /></label>
            <label>Notas<textarea rows={3} {...campo('notas')} /></label>
            <div className="acoes">
              {vaga && <button type="button" className="btn" onClick={() => { setForm(vaga); setEditando(false) }}>Cancelar</button>}
              <button className="btn primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        ) : vaga && (
          <>
            <span className="chip" style={{ background: st.cor }}>{st.label}</span>
            <h2>{vaga.empresa}</h2>
            <p className="cargo">{vaga.cargo}</p>
            <dl className="infos">
              {vaga.link && <><dt>Link</dt><dd><a href={vaga.link} target="_blank" rel="noreferrer">Abrir vaga ↗</a></dd></>}
              {vaga.data_aplicacao && <><dt>Aplicado</dt><dd>{fmtData(vaga.data_aplicacao)}</dd></>}
              {vaga.origem && <><dt>Origem</dt><dd>{vaga.origem}</dd></>}
              {vaga.salario && <><dt>Salário</dt><dd>{vaga.salario}</dd></>}
              {vaga.local && <><dt>Local</dt><dd>{vaga.local}</dd></>}
              {vaga.contato && <><dt>Contato</dt><dd>{vaga.contato}</dd></>}
            </dl>
            {vaga.notas && <p className="notas">{vaga.notas}</p>}
            <div className="acoes">
              <button className="btn" onClick={() => setEditando(true)}>✏️ Editar</button>
              <button className="btn perigo" onClick={() => confirm(`Excluir ${vaga.empresa}?`) && onExcluir(vaga)}>Excluir</button>
            </div>

            <h3>Andamento</h3>
            <form onSubmit={addEvento} className="novo-evento">
              <select value={ev.tipo} onChange={e => setEv({ ...ev, tipo: e.target.value as TipoEvento })}>
                {TIPOS.map(t => <option key={t.id} value={t.id}>{t.icone} {t.label}</option>)}
              </select>
              <input type="date" value={ev.data} onChange={e => setEv({ ...ev, data: e.target.value })} />
              <input placeholder="O que aconteceu?" value={ev.descricao} onChange={e => setEv({ ...ev, descricao: e.target.value })} />
              <button className="btn primary">+</button>
            </form>
            <ol className="timeline">
              {linha.map(e => (
                <li key={e.id}>
                  <span className="ic">{tipoInfo(e.tipo).icone}</span>
                  <div>
                    <small>{fmtData(e.data)} · {tipoInfo(e.tipo).label}</small>
                    {e.descricao && <p>{e.descricao}</p>}
                  </div>
                  <button className="x" onClick={() => onExcluirEvento(e)} aria-label="Excluir evento">×</button>
                </li>
              ))}
              {!linha.length && <li className="muted">Nada registrado ainda.</li>}
            </ol>
          </>
        )}
      </aside>
    </>
  )
}
