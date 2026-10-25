import { useState } from 'react'
import { analisar, exclusoesPadrao, extrairTexto } from './curriculo'
import { ESTADOS } from './dicionario'
import { supabase, type Modalidade, type Nivel, type PerfilBusca } from './lib'

type Form = {
  nome: string
  nivel: Nivel
  modalidades: Modalidade[]
  cidade: string
  estado: string
  abrangencia: 'cidade' | 'estado'
  cargos: string
  termos_br: string
  termos_global: string
  competencias: string
  excluir: string
  nota_minima: number
  curriculo_nome: string | null
}

const lista = (s: string) => s.split(',').map(t => t.trim()).filter(Boolean)
const texto = (a: string[] | null | undefined) => (a ?? []).join(', ')

function doPerfil(p: PerfilBusca | null): Form {
  return {
    nome: p?.nome ?? '', nivel: p?.nivel ?? 'pleno', modalidades: p?.modalidades ?? ['remoto'],
    cidade: p?.cidade ?? '', estado: p?.estado ?? '', abrangencia: p?.abrangencia ?? 'cidade',
    cargos: texto(p?.cargos), termos_br: texto(p?.termos_br), termos_global: texto(p?.termos_global),
    competencias: texto(p?.competencias), excluir: texto(p?.excluir ?? exclusoesPadrao('pleno')),
    nota_minima: p?.nota_minima ?? 50, curriculo_nome: p?.curriculo_nome ?? null,
  }
}

const MODALIDADES: { id: Modalidade; label: string }[] = [
  { id: 'remoto', label: '🏠 Remoto' },
  { id: 'hibrido', label: '🔀 Híbrido' },
  { id: 'presencial', label: '🏢 Presencial' },
]

export default function PerfilEditor({ perfil, primeiroAcesso, onSalvo, onFechar }: {
  perfil: PerfilBusca | null
  primeiroAcesso?: boolean
  onSalvo: (p: PerfilBusca) => void
  onFechar?: () => void
}) {
  const [form, setForm] = useState<Form>(() => doPerfil(perfil))
  const [lendo, setLendo] = useState(false)
  const [leitura, setLeitura] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [avancado, setAvancado] = useState(!primeiroAcesso)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))
  const presencial = form.modalidades.some(m => m !== 'remoto')

  async function lerCurriculo(arquivo: File) {
    setLendo(true)
    setErro(null)
    try {
      const r = analisar(await extrairTexto(arquivo))
      if (!r.cargos.length && !r.competencias.length) {
        setErro('Não reconheci cargos nem competências nesse arquivo. Se for um PDF escaneado (imagem), envie a versão em texto ou preencha abaixo.')
      }
      setForm(f => ({
        ...f,
        nome: r.nome || f.nome,
        nivel: r.nivel,
        cidade: r.cidade ?? f.cidade,
        estado: r.estado ?? f.estado,
        cargos: texto([...new Set(r.cargos.flatMap(c => [...c.pt, ...c.en]))]),
        termos_br: texto(r.cargos.map(c => c.pt[0])),
        termos_global: r.ingles ? texto([...new Set(r.cargos.map(c => c.en[0]))]) : '',
        competencias: texto(r.competencias),
        excluir: texto(exclusoesPadrao(r.nivel)),
        curriculo_nome: arquivo.name,
      }))
      setLeitura(`Encontrei ${r.cargos.length} cargo(s), ${r.competencias.length} competência(s)` +
        (r.anos !== null ? `, cerca de ${r.anos} anos de experiência` : '') +
        (r.ingles ? ' e inglês intermediário ou melhor' : '') + '. Confira e ajuste abaixo.')
    } catch (e) {
      setErro((e as Error).message || 'Não consegui ler esse arquivo.')
    }
    setLendo(false)
  }

  function alternarModalidade(m: Modalidade) {
    const tem = form.modalidades.includes(m)
    if (tem && form.modalidades.length === 1) return
    set('modalidades', tem ? form.modalidades.filter(x => x !== m) : [...form.modalidades, m])
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!lista(form.termos_br).length && !lista(form.termos_global).length) {
      return setErro('Informe pelo menos um termo de busca (ou envie o currículo).')
    }
    if (presencial && (!form.estado || (form.abrangencia === 'cidade' && !form.cidade))) {
      return setErro('Para vagas híbridas ou presenciais, informe estado e cidade.')
    }
    setSalvando(true)
    setErro(null)
    const { data: u } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('perfil_busca').upsert({
      user_id: u.user!.id,
      nome: form.nome.trim() || null, nivel: form.nivel, modalidades: form.modalidades,
      cidade: form.cidade.trim() || null, estado: form.estado || null, abrangencia: form.abrangencia,
      cargos: lista(form.cargos), termos_br: lista(form.termos_br),
      termos_global: form.modalidades.includes('remoto') ? lista(form.termos_global) : [],
      competencias: lista(form.competencias), excluir: lista(form.excluir), nota_minima: form.nota_minima,
      curriculo_nome: form.curriculo_nome,
      curriculo_em: form.curriculo_nome !== perfil?.curriculo_nome ? new Date().toISOString() : perfil?.curriculo_em,
      updated_at: new Date().toISOString(),
    }).select().single()
    setSalvando(false)
    if (error) return setErro(error.message)
    onSalvo(data as PerfilBusca)
  }

  const corpo = (
    <form onSubmit={salvar} className="form perfil-form">
      {primeiroAcesso ? (
        <>
          <h2>Vamos montar seu perfil</h2>
          <p className="muted">Envie seu currículo e eu preencho o filtro de vagas. Você confere tudo antes de salvar.</p>
        </>
      ) : <h2>Meu perfil de busca</h2>}

      <label className={`upload ${lendo ? 'lendo' : ''}`}>
        <input type="file" accept=".pdf,.docx" hidden disabled={lendo}
          onChange={e => e.target.files?.[0] && lerCurriculo(e.target.files[0])} />
        <span className="upload-icone">📄</span>
        <span>
          <b>{lendo ? 'Lendo currículo…' : form.curriculo_nome ? 'Trocar currículo' : 'Enviar currículo'}</b>
          <small>{form.curriculo_nome ?? 'PDF ou Word (.docx). O arquivo é lido no seu navegador e não é guardado.'}</small>
        </span>
      </label>
      {leitura && <p className="aviso-busca">{leitura}</p>}
      {erro && <p className="aviso-erro">{erro}</p>}

      <div className="duas">
        <label>Seu nome<input value={form.nome} onChange={e => set('nome', e.target.value)} /></label>
        <label>Nível
          <select value={form.nivel} onChange={e => set('nivel', e.target.value as Nivel)}>
            <option value="junior">Júnior / início de carreira</option>
            <option value="pleno">Pleno</option>
            <option value="senior">Sênior / especialista</option>
          </select>
        </label>
      </div>

      <fieldset className="modalidades">
        <legend>Onde quer trabalhar</legend>
        {MODALIDADES.map(m => (
          <button type="button" key={m.id} className={form.modalidades.includes(m.id) ? 'on' : ''}
            onClick={() => alternarModalidade(m.id)}>{m.label}</button>
        ))}
      </fieldset>

      {presencial && (
        <>
          <div className="duas">
            <label>Cidade<input value={form.cidade} onChange={e => set('cidade', e.target.value)} /></label>
            <label>Estado
              <select value={form.estado} onChange={e => set('estado', e.target.value)}>
                <option value="">Selecione</option>
                {ESTADOS.map(([uf, nome]) => <option key={uf} value={nome}>{nome}</option>)}
              </select>
            </label>
          </div>
          <label>Vagas híbridas e presenciais
            <select value={form.abrangencia} onChange={e => set('abrangencia', e.target.value as Form['abrangencia'])}>
              <option value="cidade">Só na minha cidade</option>
              <option value="estado">Em todo o estado</option>
            </select>
          </label>
        </>
      )}

      <label>Cargos que me interessam
        <textarea rows={3} value={form.cargos} onChange={e => set('cargos', e.target.value)} />
        <small>Separados por vírgula. Cargo no título da vaga vale +45 pontos.</small>
      </label>
      <label>Minhas competências
        <textarea rows={3} value={form.competencias} onChange={e => set('competencias', e.target.value)} />
        <small>+4 pontos por competência encontrada na vaga (máx. 30).</small>
      </label>

      <button type="button" className="link alinhar" onClick={() => setAvancado(!avancado)}>
        {avancado ? '▾' : '▸'} Ajustes avançados
      </button>
      {avancado && (
        <>
          <label>Buscas na Gupy (Brasil)
            <textarea rows={2} value={form.termos_br} onChange={e => set('termos_br', e.target.value)} />
            <small>O que digitar na busca da Gupy, em cada modalidade escolhida.</small>
          </label>
          {form.modalidades.includes('remoto') && (
            <label>Buscas internacionais (remoto)
              <textarea rows={2} value={form.termos_global} onChange={e => set('termos_global', e.target.value)} />
              <small>Termos em inglês para Remotive, Himalayas e Jobicy. Deixe vazio para só vagas do Brasil.</small>
            </label>
          )}
          <label>Descartar se o título tiver
            <textarea rows={2} value={form.excluir} onChange={e => set('excluir', e.target.value)} />
          </label>
          <label>Nota mínima: <b>{form.nota_minima}</b>
            <input type="range" min={20} max={90} step={5} value={form.nota_minima}
              onChange={e => set('nota_minima', Number(e.target.value))} />
          </label>
        </>
      )}

      <div className="acoes">
        {onFechar && <button type="button" className="btn" onClick={onFechar}>Cancelar</button>}
        <button className="btn primary" disabled={salvando || lendo}>
          {salvando ? 'Salvando…' : primeiroAcesso ? 'Salvar e buscar vagas' : 'Salvar perfil'}
        </button>
      </div>
    </form>
  )

  if (primeiroAcesso) return <div className="onboarding">{corpo}</div>
  return (
    <>
      <div className="fundo" onClick={onFechar} />
      <aside className="painel">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        {corpo}
      </aside>
    </>
  )
}
