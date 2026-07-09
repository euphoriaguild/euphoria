import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClerk } from '@clerk/clerk-react'
import { useAuth } from '../contexts/AuthContext'

export function Pending() {
  const { profile, refreshProfile, isApproved } = useAuth()
  const { signOut } = useClerk()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(false)

  // Quando aprovado, redireciona para o dashboard automaticamente
  useEffect(() => {
    if (isApproved) navigate('/', { replace: true })
  }, [isApproved, navigate])

  // Faz polling a cada 15s para verificar se foi aprovado
  useEffect(() => {
    const id = setInterval(async () => {
      await refreshProfile()
    }, 15_000)
    return () => clearInterval(id)
  }, [refreshProfile])

  async function handleCheck() {
    setChecking(true)
    await refreshProfile()
    setChecking(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-900)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900,
          color: 'var(--accent)', letterSpacing: 3, marginBottom: 32,
        }}>EUPHORIA</div>

        <div className="card" style={{ padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>

          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            Aguardando aprovação
          </h1>

          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
            Sua solicitação foi recebida. Um membro da staff irá revisar
            seu perfil e liberar o acesso em breve.
          </p>

          {/* Info do perfil enviado */}
          {profile && (
            <div style={{
              background: 'var(--bg-700)', borderRadius: 8, padding: 16,
              border: '1px solid var(--border)', marginBottom: 24, textAlign: 'left',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10,
                textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
                Dados enviados
              </div>
              <Row label="Discord" value={profile.discord_username ?? '—'} />
              <Row label="Nick MU" value={profile.nick_mudomix ?? '(não informado)'} />
              <Row label="Guilda" value={profile.guild ?? '(não informada)'} />
              <Row label="Status" value="Pendente" valueColor="var(--accent)" />
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={handleCheck} disabled={checking}>
              {checking ? 'Verificando...' : '↻ Verificar status'}
            </button>
            <button className="btn btn-danger" onClick={() => signOut()}>
              Sair
            </button>
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 20 }}>
            Verificação automática a cada 15 segundos.
          </p>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between',
      padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: valueColor ?? 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}
