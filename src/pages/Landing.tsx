import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { SignInButton, useAuth as useClerkAuth } from '@clerk/clerk-react'
import { useAuth } from '../contexts/AuthContext'

const FEATURES = [
  { section: 'COMUNIDADE', items: [
    { icon: '👥', title: 'Membros', desc: 'Diretório completo com stats em tempo real.' },
    { icon: '🛡️', title: 'Guildas', desc: 'Euphoria, Euphor1a, Jackson5 e HellBoyz unidas.' },
  ]},
  { section: 'COMPETIÇÃO', items: [
    { icon: '🏆', title: 'Rankings', desc: 'Resets em tempo real com destaque da Euphoria.' },
    { icon: '📊', title: 'Estatísticas', desc: 'KPIs e distribuição de classes da guilda.' },
  ]},
  { section: 'EVENTOS', items: [
    { icon: '⚔️', title: 'Blood Castle / IT', desc: 'Check-in organizado por canal com countdown.' },
    { icon: '🌍', title: 'World Boss', desc: 'Acompanhe o próximo spawn com contagem regressiva.' },
    { icon: '⚡', title: 'Invasões', desc: 'Horários de invasões do servidor.' },
  ]},
  { section: 'FERRAMENTAS', items: [
    { icon: '🎡', title: 'Sorteio', desc: 'Roleta interativa com histórico de ganhadores.' },
    { icon: '👤', title: 'Perfil', desc: 'Consulte qualquer personagem do servidor.' },
  ]},
]

export function Landing() {
  const { isSignedIn, isLoaded } = useClerkAuth()
  const { isApproved, profile, loadingProfile } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoaded || loadingProfile) return
    if (isSignedIn) {
      if (!profile?.nick_mudomix) navigate('/configurar')
      else if (isApproved) navigate('/')
      else navigate('/pendente')
    }
  }, [isSignedIn, isLoaded, isApproved, profile, loadingProfile])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-900)' }}>
      {/* Header */}
      <header style={{
        padding: '0 40px', height: 60, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-800)', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 900,
          color: 'var(--accent)', letterSpacing: 3, textTransform: 'uppercase' }}>
          Euphoria
        </div>
        <SignInButton mode="modal">
          <button className="btn btn-primary" style={{ gap: 8 }}>
            <DiscordIcon />
            Entrar com Discord
          </button>
        </SignInButton>
      </header>

      {/* Hero */}
      <section style={{
        minHeight: 'calc(100vh - 61px)', display: 'flex',
        flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '60px 24px', textAlign: 'center',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 3,
          color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 16,
        }}>
          EUPHORIA · MU DOMIX SEASON 2
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 6vw, 64px)',
          fontWeight: 900, lineHeight: 1.1, marginBottom: 20,
          background: 'linear-gradient(135deg, #f0f4f8 0%, #c9a84c 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          A plataforma oficial<br />da Euphoria
        </h1>

        <p style={{
          fontSize: 16, color: 'var(--text-secondary)', maxWidth: 520,
          lineHeight: 1.7, marginBottom: 36,
        }}>
          Membros, rankings, eventos, sorteios e estatísticas —<br />
          tudo em um só lugar. Acesso exclusivo para membros aprovados.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <SignInButton mode="modal">
            <button className="btn btn-primary" style={{ padding: '12px 28px', fontSize: 15, gap: 10 }}>
              <DiscordIcon />
              Entrar com Discord
            </button>
          </SignInButton>
          <a href="#features" className="btn btn-ghost" style={{ padding: '12px 28px', fontSize: 15 }}>
            Ver recursos
          </a>
        </div>

        {/* Badge de guildas */}
        <div style={{ display: 'flex', gap: 12, marginTop: 48, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['Euphoria', 'Euphor1a', 'Jackson5', 'HellBoyz'].map(g => (
            <span key={g} style={{
              padding: '4px 14px', borderRadius: 20,
              border: '1px solid var(--border-accent)',
              fontSize: 12, fontWeight: 600, color: 'var(--accent)',
              background: 'rgba(201,168,76,0.08)',
            }}>{g}</span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{
        maxWidth: 900, margin: '0 auto', padding: '60px 24px',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
          textAlign: 'center', marginBottom: 8, color: 'var(--text-primary)',
        }}>
          Tudo que a Euphoria precisa
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 48 }}>
          Ferramentas organizadas por área, exclusivas para membros.
        </p>

        {FEATURES.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 40 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 2,
              color: 'var(--text-muted)', marginBottom: 16,
            }}>{section}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {items.map(item => (
                <div key={item.title} className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 22 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* CTA final */}
      <section style={{
        maxWidth: 700, margin: '0 auto 80px', padding: '0 24px', textAlign: 'center',
      }}>
        <div className="card" style={{
          padding: '40px', borderColor: 'var(--border-accent)',
          background: 'rgba(201,168,76,0.04)',
        }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 12, color: 'var(--accent)' }}>
            Faça parte da Euphoria
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 }}>
            Entre com seu Discord, complete o perfil e aguarde aprovação da staff.
          </p>
          <SignInButton mode="modal">
            <button className="btn btn-primary" style={{ padding: '12px 32px', fontSize: 15, gap: 10 }}>
              <DiscordIcon />
              Cadastrar com Discord
            </button>
          </SignInButton>
        </div>
      </section>
    </div>
  )
}

function DiscordIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 71 55" fill="currentColor">
      <path d="M60.1 4.9A58.5 58.5 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.7 40.7 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.7 37.7 0 0 0 25.5.5a.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.7 4.9a.2.2 0 0 0-.1.1C1.6 18.1-.9 31 .3 43.7a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.8a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36.1 36.1 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9c.1.1.2.1.3.1a58.6 58.6 0 0 0 17.7-9 .2.2 0 0 0 .1-.1C73 29.1 69.5 16.3 60.2 5a.2.2 0 0 0-.1-.1ZM23.7 36.1c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.7 0 6.5 3.3 6.5 7.2 0 4-2.8 7.2-6.5 7.2Z" />
    </svg>
  )
}
