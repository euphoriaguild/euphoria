import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseHashTokens, saveSelfSession } from '../lib/authStorage'

/** Conclui OAuth próprio (tokens no hash) e entra no app. */
export function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const tokens = parseHashTokens(window.location.hash || '')
    if (tokens.access_token && tokens.refresh_token) {
      saveSelfSession(
        tokens.access_token,
        tokens.refresh_token,
        tokens.expires_in ?? 3600,
      )
      window.location.replace('/')
      return
    }
    setError('Não foi possível concluir o login (tokens ausentes).')
  }, [navigate])

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg-900)', padding: 24,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        {error ? (
          <>
            <p style={{ color: 'var(--red)', marginBottom: 16 }}>{error}</p>
            <button className="btn btn-primary" onClick={() => navigate('/entrar')}>
              Voltar ao login
            </button>
          </>
        ) : (
          <>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Finalizando login Discord...</p>
          </>
        )}
      </div>
    </div>
  )
}
