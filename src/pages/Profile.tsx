import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api, type CharacterProfile } from '../lib/api'

const CLASS_COLORS: Record<string, string> = {
  'Blade Knight': 'class-bk', 'Soul Master': 'class-sm',
  'Muse Elf': 'class-me', 'Dark Lord': 'class-dl',
  'Magic Gladiator': 'class-mg', 'Dark Wizard': 'class-dw',
}

export function Profile() {
  const { name: paramName } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [search, setSearch] = useState(paramName ?? '')
  const [profile, setProfile] = useState<CharacterProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function lookup(n: string) {
    if (!n.trim()) return
    setLoading(true)
    setError('')
    setProfile(null)
    try {
      const data = await api.getCharacter(n.trim())
      setProfile(data)
      navigate(`/perfil/${n.trim()}`, { replace: true })
    } catch {
      setError(`Personagem "${n}" não encontrado.`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (paramName) lookup(paramName)
  }, [paramName])

  return (
    <>
      <div className="page-header">
        <h2>Buscar Perfil</h2>
      </div>

      <div className="page-body">
        {/* Barra de busca */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookup(search)}
              placeholder="Nome do personagem..."
              autoFocus
              style={{
                flex: 1, padding: '10px 14px', background: 'var(--bg-700)',
                border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 14, outline: 'none',
              }}
            />
            <button className="btn btn-primary" onClick={() => lookup(search)}>
              <Search size={15} />
              Buscar
            </button>
          </div>
        </div>

        {loading && <div className="loading"><div className="spinner" /> Buscando...</div>}

        {error && (
          <div style={{
            padding: '14px 18px', borderRadius: 8,
            background: 'rgba(229,62,62,0.08)', border: '1px solid rgba(229,62,62,0.2)',
            color: 'var(--red)', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {profile && !loading && (
          profile.profile_blocked ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
              <h2 style={{ fontSize: 18, marginBottom: 8 }}>{profile.name}</h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Perfil bloqueado
                {profile.blocked_until && ` até ${profile.blocked_until}`}.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
              {/* Card principal */}
              <div className="card" style={{ textAlign: 'center' }}>
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt=""
                    style={{ width: 90, height: 90, borderRadius: 8, marginBottom: 12,
                      border: '2px solid var(--border-accent)' }} />
                ) : (
                  <div style={{ width: 90, height: 90, borderRadius: 8, background: 'var(--bg-600)',
                    margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 36 }}>⚔️</div>
                )}
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{profile.name}</h2>
                <div className={`badge ${CLASS_COLORS[profile.char_class] ?? ''}`}
                  style={{ background: 'var(--bg-700)', margin: '0 auto 16px', display: 'inline-flex' }}>
                  {profile.char_class}
                </div>

                {[
                  { label: 'Resets', value: profile.resets, accent: true },
                  { label: 'Level', value: profile.level },
                  { label: 'Mapa', value: profile.map ?? '—' },
                  { label: 'Guilda', value: profile.guild ?? '—' },
                ].map(row => (
                  <div key={row.label} style={{
                    display: 'flex', justifyContent: 'space-between', padding: '7px 0',
                    borderBottom: '1px solid var(--border)', fontSize: 13,
                  }}>
                    <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                    <span style={{ fontWeight: 600, color: row.accent ? 'var(--accent)' : 'var(--text-primary)' }}>
                      {row.value}
                    </span>
                  </div>
                ))}

                {profile.status && (
                  <div style={{ marginTop: 14 }}>
                    <span className={`badge ${profile.status === 'Online' ? 'badge-online' : 'badge-offline'}`}>
                      {profile.status}
                    </span>
                  </div>
                )}
              </div>

              {/* Equipamentos */}
              <div className="card">
                <div className="card-title" style={{ marginBottom: 14 }}>Equipamentos</div>
                {profile.equipment.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum equipamento visível.</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {profile.equipment.map((eq, i) => (
                      <span key={i} style={{
                        padding: '5px 12px', background: 'var(--bg-700)',
                        borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                      }}>
                        {eq}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </>
  )
}
