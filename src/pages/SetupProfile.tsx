import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

const GUILDS = ['Euphoria', 'Euphor1a', 'Jackson5', 'HellBoyz']

export function SetupProfile() {
  const { user } = useUser()
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [nick, setNick] = useState(profile?.nick_mudomix ?? '')
  const [guild, setGuild] = useState(profile?.guild ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Extrai info do Discord via Clerk
  const discordAccount = user?.externalAccounts?.find(a => a.provider === 'discord')
  const discordUsername = discordAccount?.username ?? user?.username ?? null
  const discordId = discordAccount?.providerUserId ?? null
  const avatarUrl = user?.imageUrl ?? null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nick.trim() || !guild) { setError('Preencha todos os campos.'); return }

    setSaving(true)
    setError('')

    try {
      await api.saveProfile({
        nick_mudomix: nick.trim(),
        guild,
        discord_username: discordUsername ?? undefined,
        discord_id: discordId ?? undefined,
        avatar_url: avatarUrl ?? undefined,
      })
      await refreshProfile()
      navigate('/pendente')
    } catch {
      setError('Erro ao salvar. Verifique se o backend está rodando.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-900)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900,
            color: 'var(--accent)', letterSpacing: 3, marginBottom: 8,
          }}>EUPHORIA</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Complete seu perfil</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Informe seu nick no MU Domix e sua guilda para solicitar aprovação.
          </p>
        </div>

        <div className="card">
          {/* Discord info via Clerk */}
          {discordUsername && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', background: 'var(--bg-700)',
              borderRadius: 6, marginBottom: 20, border: '1px solid var(--border)',
            }}>
              {avatarUrl && (
                <img src={avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
              )}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{discordUsername}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Discord conectado via Clerk</div>
              </div>
              <span className="badge badge-online" style={{ marginLeft: 'auto' }}>✓</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600,
                color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase',
                letterSpacing: 1 }}>
                Nick no MU Domix
              </label>
              <input
                value={nick}
                onChange={e => setNick(e.target.value)}
                placeholder="Ex: MARLBORO"
                autoComplete="off"
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'var(--bg-700)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Exatamente como aparece no perfil do mudomix.com
              </p>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600,
                color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase',
                letterSpacing: 1 }}>
                Sua Guilda
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {GUILDS.map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGuild(g)}
                    style={{
                      padding: '10px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                      border: `1px solid ${guild === g ? 'var(--accent)' : 'var(--border)'}`,
                      background: guild === g ? 'rgba(201,168,76,0.12)' : 'var(--bg-700)',
                      color: guild === g ? 'var(--accent)' : 'var(--text-secondary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 6, marginBottom: 16,
                background: 'rgba(229,62,62,0.1)', border: '1px solid rgba(229,62,62,0.3)',
                color: 'var(--red)', fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
              style={{ width: '100%', padding: '12px', fontSize: 14, justifyContent: 'center' }}
            >
              {saving ? 'Salvando...' : 'Enviar solicitação'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
