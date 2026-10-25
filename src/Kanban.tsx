import { useState } from 'react'
import { STATUS, diasParado, fmtData, type Evento, type Status, type Vaga } from './lib'

export default function Kanban({ vagas, eventos, onAbrir, onMover }: {
  vagas: Vaga[]; eventos: Evento[]
  onAbrir: (v: Vaga) => void
  onMover: (v: Vaga, s: Status) => void
}) {
  const [arrastando, setArrastando] = useState<Vaga | null>(null)
  const [sobre, setSobre] = useState<Status | null>(null)

  return (
    <div className="kanban">
      {STATUS.map(s => {
        const col = vagas.filter(v => v.status === s.id)
        return (
          <section
            key={s.id}
            className={`coluna ${sobre === s.id ? 'sobre' : ''}`}
            onDragOver={e => { e.preventDefault(); setSobre(s.id) }}
            onDragLeave={() => setSobre(null)}
            onDrop={() => {
              if (arrastando && arrastando.status !== s.id) onMover(arrastando, s.id)
              setArrastando(null); setSobre(null)
            }}
          >
            <header style={{ borderTopColor: s.cor }}>
              <span>{s.label}</span><b>{col.length}</b>
            </header>
            <div className="cards">
              {col.map(v => {
                const parado = diasParado(v, eventos)
                return (
                  <article
                    key={v.id} className="card" draggable
                    onDragStart={() => setArrastando(v)}
                    onClick={() => onAbrir(v)}
                  >
                    <div className="card-topo">
                      <strong>{v.empresa}</strong>
                      <span className={`prio p${v.prioridade}`} title="Prioridade" />
                    </div>
                    <span>{v.cargo}</span>
                    <div className="card-meta">
                      {v.data_aplicacao && <small>📤 {fmtData(v.data_aplicacao)}</small>}
                      {v.origem && <small>{v.origem}</small>}
                      {parado !== null && parado >= 7 && <em className="parado">⏳ {parado}d</em>}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
