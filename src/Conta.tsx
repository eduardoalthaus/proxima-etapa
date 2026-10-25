import { useEffect, useState } from 'react'
import { supabase, type Vaga } from './lib'
import EmailsGupy from './EmailsGupy'

type Convite = { email: string; convidado_em: string }

export default function Conta({ email, admin, vagas, onAtualizou, onFechar }: {
  email: string; admin: boolean; vagas: Vaga[]; onAtualizou: () => Promise<void>; onFechar: () => void
}) {
  const [convites, setConvites] = useState<Convite[]>([])
  const [novo, setNovo] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (admin) supabase.from('convites').select('*').order('convidado_em', { ascending: false })
      .then(({ data }) => setConvites((data ?? []) as Convite[]))
  }, [admin])

  async function convidar(e: React.FormEvent) {
    e.preventDefault()
    const em = novo.trim().toLowerCase()
    const { data, error } = await supabase.from('convites').insert({ email: em }).select().single()
    if (error) return setMsg(error.code === '23505' ? 'Esse e-mail já foi convidado.' : error.message)
    setConvites(c => [data as Convite, ...c])
    setNovo('')
    setMsg(`Pronto. Peça para ${em} criar a conta em ${location.origin}.`)
  }

  async function remover(c: Convite) {
    if ((await supabase.from('convites').delete().eq('email', c.email)).error) return
    setConvites(cs => cs.filter(x => x.email !== c.email))
  }

  async function excluirConta() {
    const ok = prompt('Isso apaga sua conta, vagas, andamento e sugestões para sempre. Digite EXCLUIR para confirmar.')
    if (ok !== 'EXCLUIR') return
    const { error } = await supabase.rpc('excluir_minha_conta')
    if (error) return setMsg(error.message)
    await supabase.auth.signOut()
  }

  return (
    <>
      <div className="fundo" onClick={onFechar} />
      <aside className="painel">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        <h2>Minha conta</h2>
        <p className="muted">{email}</p>
        <div className="acoes">
          <button className="btn" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>

        <EmailsGupy vagas={vagas} onAtualizou={onAtualizou} />

        {admin && (
          <>
            <h3>Convites</h3>
            <p className="muted">Só e-mails convidados conseguem criar conta.</p>
            <form onSubmit={convidar} className="convite-form">
              <input type="email" required placeholder="email@exemplo.com" value={novo} onChange={e => setNovo(e.target.value)} />
              <button className="btn primary">Convidar</button>
            </form>
            {msg && <p className="aviso-busca">{msg}</p>}
            <ul className="convites">
              {convites.map(c => (
                <li key={c.email}>
                  <span>{c.email}</span>
                  <button className="x" onClick={() => remover(c)} aria-label={`Remover convite de ${c.email}`}>×</button>
                </li>
              ))}
              {!convites.length && <li className="muted">Nenhum convite ainda.</li>}
            </ul>
          </>
        )}

        <h3>Privacidade</h3>
        <p className="muted">
          Seu currículo é lido no navegador e não fica guardado: salvamos só o perfil de busca que você confere.
          Ninguém além de você vê suas vagas e sugestões.
        </p>
        {!admin && msg && <p className="aviso-erro">{msg}</p>}
        <div className="acoes">
          <button className="btn perigo" onClick={excluirConta}>Excluir minha conta e dados</button>
        </div>
      </aside>
    </>
  )
}
