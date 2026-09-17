import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api, type AltEntry, type StatuteData } from '../lib/api'

export function Onboarding() {
  const {
    isLoaded, isSignedIn, isApproved, needsOnboarding,
    profile, refreshProfile, signOut,
  } = useAuth()
  const navigate = useNavigate()

  const [alts, setAlts] = useState<AltEntry[]>([])
  const [newAlt, setNewAlt] = useState('')
  const [adding, setAdding] = useState(false)
  const [statute, setStatute] = useState<StatuteData | null>(null)
  const [discordUrl, setDiscordUrl] = useState('')
  const [whatsappUrl, setWhatsappUrl] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const mainNick = profile?.nick_mudomix ?? ''

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) { navigate('/entrar', { replace: true }); return }
    if (!profile?.nick_mudomix) { navigate('/configurar', { replace: true }); return }
    if (!isApproved) { navigate('/pendente', { replace: true }); return }
    if (!needsOnboarding) { navigate('/', { replace: true }); return }
  }, [isLoaded, isSignedIn, profile, isApproved, needsOnboarding, navigate])

  useEffect(() => {
    if (!isApproved || !needsOnboarding) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const [altsData, statuteData, links] = await Promise.all([
          api.getAlts(),
          api.getStatute(),
          api.getGuildLinks(),
        ])
        if (cancelled) return
        const mine = (altsData.entries || []).filter(
          (e) =>
            e.side === 'euphoria' &&
            e.main_nick.toLowerCase() === mainNick.toLowerCase() &&
            e.alt_nick,
        )
        setAlts(mine)
        setStatute(statuteData)
        setDiscordUrl(links.discord_url)
        setWhatsappUrl(links.whatsapp_url)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar onboarding.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isApproved, needsOnboarding, mainNick])

  async function handleAddAlt() {
    const nick = newAlt.trim()
    if (!nick || !mainNick) return
    if (nick.toLowerCase() === mainNick.toLowerCase()) {
      setError('O nick da alt deve ser diferente do main.')
      return
    }
    setAdding(true)
    setError('')
    try {
      const created = await api.createAlt({
        main_nick: mainNick,
        alt_nick: nick,
        side: 'euphoria',
      })
      if (created?.id) {
        setAlts((prev) => [...prev, created])
      } else {
        const data = await api.getAlts()
        setAlts(
          (data.entries || []).filter(
            (e) =>
              e.side === 'euphoria' &&
              e.main_nick.toLowerCase() === mainNick.toLowerCase() &&
              e.alt_nick,
          ),
        )
      }
      setNewAlt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar alt.')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemoveAlt(id: number) {
    setError('')
    try {
      await api.deleteAlt(id)
      setAlts((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover alt.')
    }
  }

  async function handleContinue() {
    if (!accepted) return
    setSaving(true)
    setError('')
    try {
      await api.completeOnboarding()
      await refreshProfile()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao concluir onboarding.')
    } finally {
      setSaving(false)
    }
  }

  if (!isLoaded || loading) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg-900)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-900)',
      padding: '32px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 560, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900,
            color: 'var(--accent)', letterSpacing: 3, marginBottom: 8,
          }}>EUPHORIA</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Bem-vindo à guild</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Complete o onboarding para acessar a plataforma.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
          }}>Nick main</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
            {mainNick || '—'}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            Informado no cadastro. Alts são opcionais.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 1,
            }}>Alts (opcional)</div>
          </div>

          {alts.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Nenhuma alt cadastrada.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
              {alts.map((a) => (
                <li key={a.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14,
                }}>
                  <span>{a.alt_nick}</span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => handleRemoveAlt(a.id)}
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newAlt}
              onChange={(e) => setNewAlt(e.target.value)}
              placeholder="Nick da alt"
              autoComplete="off"
              style={{
                flex: 1, padding: '10px 14px',
                background: 'var(--bg-700)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-primary)', fontSize: 14, outline: 'none',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAlt() } }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={adding || !newAlt.trim()}
              onClick={handleAddAlt}
              style={{ minWidth: 44, justifyContent: 'center' }}
              title="Adicionar alt"
            >
              {adding ? '…' : '+'}
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
          }}>Comunidade</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              className="btn btn-primary"
              href={discordUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flex: 1, minWidth: 140, justifyContent: 'center', textDecoration: 'none' }}
            >
              Discord da guild
            </a>
            <a
              className="btn btn-ghost"
              href={whatsappUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1, minWidth: 140, justifyContent: 'center', textDecoration: 'none',
                border: '1px solid var(--border)',
              }}
            >
              WhatsApp da guild
            </a>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
          }}>Estatuto da guild</div>
          <div style={{
            maxHeight: 280, overflowY: 'auto', padding: 14,
            background: 'var(--bg-700)', borderRadius: 6, border: '1px solid var(--border)',
            fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap', marginBottom: 14,
          }}>
            {statute?.content?.trim()
              ? statute.content
              : 'Nenhum estatuto cadastrado ainda. Peça à staff para publicar em Estatuto.'}
          </div>
          <label style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13,
          }}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--accent)' }}
            />
            <span>Li e concordo com o Estatuto da Euphoria.</span>
          </label>
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
          type="button"
          className="btn btn-primary"
          disabled={!accepted || saving}
          onClick={handleContinue}
          style={{ width: '100%', padding: 12, fontSize: 14, justifyContent: 'center', opacity: accepted ? 1 : 0.45 }}
        >
          {saving ? 'Salvando...' : 'Continuar / Acessar a aplicação'}
        </button>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => signOut().then(() => navigate('/entrar'))}
          style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
        >
          Sair
        </button>
      </div>
    </div>
  )
}
