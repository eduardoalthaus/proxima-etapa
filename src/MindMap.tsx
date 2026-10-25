import { useMemo } from 'react'
import {
  ReactFlow, Background, Controls, Handle, Position,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { STATUS, diasParado, type Evento, type Vaga } from './lib'

type CentroData = { total: number }
type RamoData = { label: string; cor: string; qtd: number }
type FolhaData = { vaga: Vaga; cor: string; parado: number | null }

const handles = (
  <>
    <Handle type="target" position={Position.Top} className="h-oculto" />
    <Handle type="source" position={Position.Bottom} className="h-oculto" />
  </>
)

function Centro({ data }: NodeProps<Node<CentroData>>) {
  return <div className="n-centro">{handles}<strong>Eduardo</strong><span>{data.total} vagas</span></div>
}

function Ramo({ data }: NodeProps<Node<RamoData>>) {
  return (
    <div className="n-ramo" style={{ borderColor: data.cor, opacity: data.qtd ? 1 : 0.45 }}>
      {handles}
      <span className="dot" style={{ background: data.cor }} />
      {data.label}<b>{data.qtd}</b>
    </div>
  )
}

function Folha({ data }: NodeProps<Node<FolhaData>>) {
  const { vaga, cor, parado } = data
  return (
    <div className="n-folha" style={{ borderLeftColor: cor }}>
      {handles}
      <strong>{vaga.empresa}</strong>
      <span>{vaga.cargo}</span>
      {parado !== null && parado >= 7 && <em className="parado">⏳ {parado}d sem resposta</em>}
    </div>
  )
}

const nodeTypes = { centro: Centro, ramo: Ramo, folha: Folha }

const R_RAMO = 270
const R_FOLHA = 580
const PASSO_FOLHA = 190 // distância em px entre folhas vizinhas no mesmo anel

export default function MindMap({ vagas, eventos, onAbrir }: {
  vagas: Vaga[]; eventos: Evento[]; onAbrir: (v: Vaga) => void
}) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [{ id: 'centro', type: 'centro', position: { x: -70, y: -35 }, data: { total: vagas.length } }]
    const edges: Edge[] = []

    STATUS.forEach((s, i) => {
      const ang = (i / STATUS.length) * Math.PI * 2 - Math.PI / 2
      const doRamo = vagas.filter(v => v.status === s.id)
      const rid = `s-${s.id}`
      nodes.push({
        id: rid, type: 'ramo', data: { label: s.label, cor: s.cor, qtd: doRamo.length },
        position: { x: Math.cos(ang) * R_RAMO - 72, y: Math.sin(ang) * R_RAMO - 18 },
      })
      edges.push({ id: `e-${rid}`, source: 'centro', target: rid, style: { stroke: s.cor, strokeWidth: 2.5 } })

      // Folhas em anéis concêntricos, abertas em leque na direção do ramo
      let restante = [...doRamo].sort((a, b) => a.prioridade - b.prioridade)
      let anel = 0
      while (restante.length) {
        const r = R_FOLHA + anel * 150
        const leque = (Math.PI * 2) / STATUS.length * 0.92
        const cabe = Math.max(1, Math.floor((leque * r) / PASSO_FOLHA))
        const aqui = restante.slice(0, cabe)
        restante = restante.slice(cabe)
        const passo = PASSO_FOLHA / r
        aqui.forEach((v, j) => {
          const a = ang + (j - (aqui.length - 1) / 2) * passo
          nodes.push({
            id: v.id, type: 'folha',
            data: { vaga: v, cor: s.cor, parado: diasParado(v, eventos) },
            position: { x: Math.cos(a) * r - 80, y: Math.sin(a) * r - 28 },
          })
          edges.push({ id: `e-${v.id}`, source: rid, target: v.id, style: { stroke: s.cor, opacity: 0.6 } })
        })
        anel++
      }
    })
    return { nodes, edges }
  }, [vagas, eventos])

  return (
    <div className="mapa">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.2}
        nodesDraggable={false} nodesConnectable={false}
        onNodeClick={(_, n) => n.type === 'folha' && onAbrir((n.data as FolhaData).vaga)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={28} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
