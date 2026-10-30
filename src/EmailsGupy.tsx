import { useCallback, useEffect, useState } from 'react'
import { fmtData, supabase, type Vaga } from './lib'

type Conexao = { email: string | null; ultima_leitura: string | null; erro: string | null }
type Email = {
  id: string; recebido_em: string; assunto: string | null; trecho: string | null
  tipo: 'candidatura' | 'avanco' | 'teste' | 'entrevista' | 'oferta' | 'recusa' | 'outro'
  vaga_id: string | null
}

const TIPO: Record<Email['tipo'], string> = {
  candidatura: '📤 Candidatura', avanco: '➡️ Avançou', teste: '🧪 Teste', entrevista: '🎙️ Entrevista',
  oferta: '🎉 Proposta', recusa: '✖️ Encerrado', outro: '✉️ Outro',
}

// Conexão com o Outlook e os e-mails da Gupy lidos dele
export default function EmailsGupy({ vagas, onAtualizou }: { vagas: Vaga[]; onAtualizou: () => Promise<void> }) {
  const [conexao, setConexao] = useState<Conexao | null | undefined>(undefined)
  const [emails, setEmails] = useState<Email[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [c, e] = await Promise.all([
      supabase.from('conexoes_email').select('email, ultima_leitura, erro').maybeSingle(),
      supabase.from('emails_recebidos').select('id, recebido_em, assunto, trecho, tipo, vaga_id')
        .order('recebido_em', { ascending: false }).limit(30),
    ])
    setConexao(c.data as Conexao | null)
    setEmails((e.data ?? []) as Email[])
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function chamar(acao: 'conectar' | 'ler') {
    setOcupado(true)
    setMsg(null)
    const { data, error } = await supabase.functions.invoke('outlook', { body: { acao, volta: location.origin } })
    setOcupado(false)
    if (error || data?.erro) {
      const detalhe = await (error as { context?: Response })?.context?.json?.().catch(() => null)
      return setMsg(data?.erro ?? detalhe?.erro ?? 'Não deu certo. Tente de novo em alguns minutos.')
    }
    if (acao === 'conectar') return void (location.href = data.url)
    setMsg(`${data.lidos} e-mail(s) novo(s) da Gupy.`)
    await Promise.all([carregar(), onAtualizou()])
  }

  async function desconectar() {
    if (!confirm('Desconectar o Outlook? Os e-mails já lidos continuam aqui.')) return
    await supabase.from('conexoes_email').delete().neq('user_id', '00000000-0000-0000-0000-000000000000')
    setConexao(null)
  }

  async function vincular(email: Email, vagaId: string) {
    if (!vagaId) return
    await supabase.from('emails_recebidos').update({ vaga_id: vagaId }).eq('id', email.id)
    await supabase.from('eventos').insert({
      vaga_id: vagaId, tipo: 'nota', data: email.recebido_em.slice(0, 10),
      descricao: `Gupy: ${TIPO[email.tipo].replace(/^\S+ /, '')} (${email.assunto ?? 'sem assunto'})`,
    })
    setEmails(es => es.map(e => (e.id === email.id ? { ...e, vaga_id: vagaId } : e)))
    await onAtualizou()
  }

  if (conexao === undefined) return null

  return (
    <section className="emails-gupy">
      <h3>Outlook e e-mails da Gupy</h3>
      {!conexao ? (
        <>
          <p className="muted">
            Conecte seu Outlook para o app ler os e-mails da Gupy (só leitura) e mover suas vagas de etapa sozinho, de hora em hora.
          </p>
          <button className="btn primary" disabled={ocupado} onClick={() => chamar('conectar')}>📬 Conectar Outlook</button>
        </>
      ) : (
        <>
          <p className="muted">
            Conectado como <b>{conexao.email}</b>
            {conexao.ultima_leitura && <> · lido em {new Date(conexao.ultima_leitura).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</>}
          </p>
          {conexao.erro && <p className="aviso-erro">{conexao.erro}</p>}
          <div className="acoes alinhar-esq">
            {conexao.erro
              ? <button className="btn primary" disabled={ocupado} onClick={() => chamar('conectar')}>Reconectar</button>
              : <button className="btn" disabled={ocupado} onClick={() => chamar('ler')}>{ocupado ? 'Lendo…' : '🔄 Ler agora'}</button>}
            <button className="btn ghost" onClick={desconectar}>Desconectar</button>
          </div>
        </>
      )}
      {msg && <p className="aviso-busca">{msg}</p>}

      {emails.length > 0 && (
        <ul className="emails">
          {emails.map(e => {
            const vaga = vagas.find(v => v.id === e.vaga_id)
            return (
              <li key={e.id}>
                <div className="email-topo">
                  <span className="email-tipo">{TIPO[e.tipo]}</span>
                  <small>{fmtData(e.recebido_em.slice(0, 10))}</small>
                </div>
                <strong>{e.assunto ?? 'Sem assunto'}</strong>
                {vaga ? (
                  <small className="muted">→ {vaga.empresa} · {vaga.cargo}</small>
                ) : (
                  <select defaultValue="" onChange={ev => vincular(e, ev.target.value)} aria-label="Associar a uma vaga">
                    <option value="">Não identifiquei a vaga. Associar a…</option>
                    {vagas.map(v => <option key={v.id} value={v.id}>{v.empresa} · {v.cargo}</option>)}
                  </select>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
