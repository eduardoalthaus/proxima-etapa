import { useState } from 'react'
import { supabase } from './lib'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [criando, setCriando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setCarregando(true)
    setMsg(null)
    const { error } = criando
      ? await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin } })
      : await supabase.auth.signInWithPassword({ email, password: senha })
    setCarregando(false)
    if (error) setMsg(error.message.includes('Cadastro fechado') || error.message.includes('Database error')
      ? 'Cadastro só por convite. Peça um convite para quem administra a plataforma.'
      : error.message)
    else if (criando) setMsg('Conta criada. Confirme pelo link que chegou no seu e-mail e depois entre.')
  }

  return (
    <div className="login">
      <form onSubmit={enviar} className="login-card">
        <div className="logo">📡</div>
        <h1>Radar de Vagas</h1>
        <p className="muted">As vagas certas para o seu currículo</p>
        <input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        <input type="password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} required minLength={8}
          autoComplete={criando ? 'new-password' : 'current-password'} />
        <button className="btn primary" disabled={carregando}>{criando ? 'Criar conta' : 'Entrar'}</button>
        {msg && <p className="aviso">{msg}</p>}
        <button type="button" className="link" onClick={() => { setCriando(!criando); setMsg(null) }}>
          {criando ? 'Já tenho conta' : 'Primeiro acesso? Criar conta'}
        </button>
        <div className="demo-convite">
          <span>Só quer conhecer?</span>
          <a className="btn" href={`${location.pathname}?demo`}>Ver demonstração sem login</a>
          <small className="muted">Dados fictícios. Nada do que você fizer fica salvo.</small>
        </div>
      </form>
    </div>
  )
}
