import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  children: React.ReactNode
  requireStaff?: boolean
}

export function ProtectedRoute({ children, requireStaff = false }: Props) {
  const { isSignedIn, isLoaded, profile, loadingProfile, isApproved, isStaff, signOut } = useAuth()

  if (!isLoaded || loadingProfile) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg-900)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Verificando autenticação...</p>
        </div>
      </div>
    )
  }

  if (!isSignedIn) return <Navigate to="/entrar" replace />

  if (!profile || !profile.nick_mudomix) return <Navigate to="/configurar" replace />

  if (profile?.role === 'rejected') {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg-900)', padding: 24,
      }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Acesso negado</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
            Sua solicitação foi recusada pela staff. Entre em contato pelo Discord da guilda.
          </p>
          <button className="btn btn-ghost" onClick={() => signOut()}>Sair</button>
        </div>
      </div>
    )
  }

  if (!isApproved) return <Navigate to="/pendente" replace />
  if (profile && !profile.onboarding_completed_at) return <Navigate to="/onboarding" replace />
  if (requireStaff && !isStaff) return <Navigate to="/" replace />

  return <>{children}</>
}
