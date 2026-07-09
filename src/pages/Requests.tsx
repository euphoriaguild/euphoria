import { useEffect, useState } from 'react'
import { Check, X, RefreshCw, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { api, type PendingMember } from '../lib/api'

const GUILD_COLORS: Record<string, string> = {
  Euphoria: 'guild-euphoria', Euphor1a: 'guild-euphor1a',
  Jackson5: 'guild-jackson5', HellBoyz: 'guild-hellboyz',
}

export function Requests() {
  const { isStaff } = useAuth()
  const [pending, setPending] = useState<PendingMember[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await api.getPendingMembers()
      setPending(data)
    } catch { /* staff-only endpoint */ }
    setLoading(false)
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000) // poll a cada 30s
    return () => clearInterval(id)
  }, [])

  async function approve(clerkId: string, role = 'member') {
    setActing(clerkId)
    await api.approveProfile(clerkId, role)
    await load()
    setActing(null)
  }

  async function reject(clerkId: string) {
    setActing(clerkId)
    await api.approveProfile(clerkId, 'rejected')
    await load()
    setActing(null)
  }

  if (!isStaff) {
    return (
      <div className="page-body">
        <div className="loading">Acesso restrito a staff e admin.</div>
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <h2>Solicitações de Acesso</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {pending.length} pendente{pending.length !== 1 ? 's' : ''}
          </span>
          <button className="btn btn-ghost" onClick={load}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : pending.length === 0 ? (
          <div className="loading" style={{ flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 32 }}>✓</span>
            <span>Nenhuma solicitação pendente.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(m => (
              <div key={m.clerk_id} className="card" style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px',
              }}>
                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'var(--bg-600)', flexShrink: 0,
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {m.avatar_url
                    ? <img src={m.avatar_url} alt="" style={{ width: '100%' }} />
                    : <span style={{ fontSize: 20 }}>👤</span>
                  }
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {m.discord_username ?? 'Desconhecido'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Nick: <strong style={{ color: 'var(--text-primary)' }}>{m.nick_mudomix ?? '(não informado)'}</strong>
                    {' · '}
                    Guilda: <strong className={GUILD_COLORS[m.guild ?? ''] ?? ''}>
                      {m.guild ?? '(não informada)'}
                    </strong>
                    {' · '}
                    <span style={{ color: 'var(--text-muted)' }}>
                      {new Date(m.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    className="btn"
                    onClick={() => approve(m.clerk_id, 'admin')}
                    disabled={acting === m.clerk_id}
                    style={{
                      background: 'rgba(201,168,76,0.15)', color: 'var(--accent)',
                      border: '1px solid rgba(201,168,76,0.3)', padding: '6px 12px', fontSize: 12,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    title="Aprovar como Admin"
                  >
                    <ShieldCheck size={13} /> Admin
                  </button>
                  <button
                    className="btn"
                    onClick={() => approve(m.clerk_id, 'staff')}
                    disabled={acting === m.clerk_id}
                    style={{
                      background: 'rgba(159,122,234,0.15)', color: 'var(--purple)',
                      border: '1px solid rgba(159,122,234,0.3)', padding: '6px 12px', fontSize: 12,
                    }}
                    title="Aprovar como Staff"
                  >
                    Staff
                  </button>
                  <button
                    className="btn"
                    onClick={() => approve(m.clerk_id, 'member')}
                    disabled={acting === m.clerk_id}
                    style={{
                      background: 'rgba(72,187,120,0.15)', color: 'var(--green)',
                      border: '1px solid rgba(72,187,120,0.3)', padding: '6px 12px', fontSize: 12,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    title="Aprovar como Membro"
                  >
                    <Check size={13} /> Membro
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => reject(m.clerk_id)}
                    disabled={acting === m.clerk_id}
                    style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Rejeitar"
                  >
                    <X size={13} /> Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
