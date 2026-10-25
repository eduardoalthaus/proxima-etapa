import { useState } from 'react'
import { escolherModelo, preencher, type Modelo } from './lib'

// Texto de apresentação + habilidades prontos para colar no formulário da vaga
export default function Kit({ modelos, empresa, cargo, onGerenciar }: {
  modelos: Modelo[]
  empresa: string | null
  cargo: string
  onGerenciar: () => void
}) {
  const [escolhido, setEscolhido] = useState(() => escolherModelo(modelos, cargo)?.id ?? null)
  const modelo = modelos.find(m => m.id === escolhido) ?? escolherModelo(modelos, cargo)

  if (!modelo) {
    return (
      <div className="kit vazio-kit">
        <span>Crie um texto de apresentação para colar nas candidaturas.</span>
        <button className="btn" onClick={onGerenciar}>📝 Criar modelo</button>
      </div>
    )
  }

  return (
    <div className="kit">
      <div className="kit-topo">
        <select value={modelo.id} onChange={e => setEscolhido(e.target.value)} aria-label="Modelo de apresentação">
          {modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <button className="link" onClick={onGerenciar}>Editar modelos</button>
      </div>
      {/* key: ao trocar de modelo, o texto editado volta ao do novo modelo */}
      <TextoEditavel key={modelo.id} inicial={preencher(modelo.texto, { empresa, cargo })} />
      {modelo.habilidades.length > 0 && (
        <div className="kit-habilidades">
          <small>Habilidades em destaque:</small>
          {modelo.habilidades.map(h => <BotaoCopiar key={h} valor={h} className="chip-hab">{h}</BotaoCopiar>)}
        </div>
      )}
    </div>
  )
}

function TextoEditavel({ inicial }: { inicial: string }) {
  const [texto, setTexto] = useState(inicial)
  return (
    <div className="kit-texto">
      <textarea rows={9} value={texto} onChange={e => setTexto(e.target.value)} aria-label="Texto de apresentação" />
      <div className="kit-rodape">
        <BotaoCopiar valor={texto} className="btn primary">📋 Copiar texto</BotaoCopiar>
        <small>{texto.length} caracteres · ajustes aqui valem só para esta vaga</small>
      </div>
    </div>
  )
}

function BotaoCopiar({ valor, className, children }: { valor: string; className: string; children: React.ReactNode }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch { /* sem permissão de clipboard: o texto continua selecionável */ }
  }
  return <button type="button" className={className} onClick={copiar} title="Copiar">{copiado ? '✓ Copiado' : children}</button>
}
