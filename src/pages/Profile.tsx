import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Search, Pencil, Save, X, Shield } from 'lucide-react'
import { api, type CharacterProfile, type MemberProfileData } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const CLASS_COLORS: Record<string, string> = {
  'Blade Knight': 'class-bk', 'Soul Master': 'class-sm',
  'Muse Elf': 'class-me', 'Dark Lord': 'class-dl',
  'Magic Gladiator': 'class-mg', 'Dark Wizard': 'class-dw',
}

export function Profile() {
  const { name: paramName } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { isStaff } = useAuth()
  const [search, setSearch] = useState(paramName ?? '')
  const [profile, setProfile] = useState<CharacterProfile | null>(null)
  const [member, setMember] = useState<MemberProfileData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Edição de equipamento
  const [editingEquip, setEditingEquip] = useState(false)
  const [equipSet, setEquipSet] = useState('')
  const [equipWeapon, setEquipWeapon] = useState('')
  const [equipAccessory, setEquipAccessory] = useState('')
  const [savingEquip, setSavingEquip] = useState(false)

  async function lookup(n: string) {
    if (!n.trim()) return
    setLoading(true)
    setError('')
    setProfile(null)
    setMember(null)
    setEditingEquip(false)

    const [scraped, memberData] = await Promise.allSettled([
      api.getCharacter(n.trim()),
      api.getMemberProfile(n.trim()),
    ])

    if (scraped.status === 'fulfilled') setProfile(scraped.value)
    if (memberData.status === 'fulfilled') setMember(memberData.value)

    if (scraped.status === 'rejected' && memberData.status === 'rejected') {
      setError(`Personagem "${n}" não encontrado.`)
    } else {
      navigate(`/perfil/${n.trim()}`, { replace: true })
    }
    setLoading(false)
  }

  useEffect(() => {
    if (paramName) lookup(paramName)
  }, [paramName])

  function startEditEquip() {
    setEquipSet(member?.equip_set ?? '')
    setEquipWeapon(member?.equip_weapon ?? '')
    setEquipAccessory(member?.equip_accessory ?? '')
    setEditingEquip(true)
  }

  async function handleSaveEquip() {
    if (!member) return
    setSavingEquip(true)
    try {
      await api.updateMemberEquipment(member.nick_mudomix, {
        equip_set: equipSet.trim(),
        equip_weapon: equipWeapon.trim(),
        equip_accessory: equipAccessory.trim(),
      })
      setMember({ ...member, equip_set: equipSet.trim(), equip_weapon: equipWeapon.trim(), equip_accessory: equipAccessory.trim() })
      setEditingEquip(false)
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar equipamento')
    } finally {
      setSavingEquip(false)
    }
  }

  const canEditEquip = !!member && (member.is_me || isStaff)

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

        {error && !loading && (
          <div style={{
            padding: '14px 18px', borderRadius: 8,
            background: 'rgba(229,62,62,0.08)', border: '1px solid rgba(229,62,62,0.2)',
            color: 'var(--red)', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {!loading && !error && (profile || member) && (
          profile?.profile_blocked && !member ? (
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
                {(profile?.avatar_url || member?.avatar_url) ? (
                  <img src={profile?.avatar_url || member?.avatar_url || ''} alt=""
                    style={{ width: 90, height: 90, borderRadius: 8, marginBottom: 12,
                      border: '2px solid var(--border-accent)' }} />
                ) : (
                  <div style={{ width: 90, height: 90, borderRadius: 8, background: 'var(--bg-600)',
                    margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 36 }}>⚔️</div>
                )}
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
                  {profile?.name || member?.nick_mudomix}
                </h2>
                <div className={`badge ${CLASS_COLORS[profile?.char_class ?? ''] ?? ''}`}
                  style={{ background: 'var(--bg-700)', margin: '0 auto 16px', display: 'inline-flex' }}>
                  {profile?.char_class || member?.char_class || '—'}
                </div>

                {[
                  { label: 'Resets', value: profile?.resets ?? member?.resets ?? 0, accent: true },
                  { label: 'Level', value: profile?.level ?? member?.level ?? 0 },
                  { label: 'Mapa', value: profile?.map ?? '—' },
                  { label: 'Guilda', value: profile?.guild ?? member?.guild ?? '—' },
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

                {profile?.status && (
                  <div style={{ marginTop: 14 }}>
                    <span className={`badge ${profile.status === 'Online' ? 'badge-online' : 'badge-offline'}`}>
                      {profile.status}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Equipamento cadastrado manualmente pelo membro/staff */}
                {member && (
                  <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Shield size={14} /> Equipamento
                      </div>
                      {canEditEquip && !editingEquip && (
                        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={startEditEquip}>
                          <Pencil size={12} /> Editar
                        </button>
                      )}
                      {editingEquip && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleSaveEquip} disabled={savingEquip}>
                            <Save size={12} /> Salvar
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditingEquip(false)} disabled={savingEquip}>
                            <X size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {editingEquip ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                          { label: 'Set / Shield', value: equipSet, setValue: setEquipSet },
                          { label: 'Arma', value: equipWeapon, setValue: setEquipWeapon },
                          { label: 'Acessório', value: equipAccessory, setValue: setEquipAccessory },
                        ].map(f => (
                          <div key={f.label}>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                              {f.label}
                            </label>
                            <input
                              value={f.value}
                              onChange={e => f.setValue(e.target.value)}
                              placeholder={`Ex: ${f.label}...`}
                              style={{
                                width: '100%', padding: '8px 10px', background: 'var(--bg-700)',
                                border: '1px solid var(--border)', borderRadius: 6,
                                color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[
                          { label: 'Set / Shield', value: member.equip_set },
                          { label: 'Arma', value: member.equip_weapon },
                          { label: 'Acessório', value: member.equip_accessory },
                        ].map(f => (
                          <div key={f.label} style={{
                            display: 'flex', justifyContent: 'space-between', padding: '7px 0',
                            borderBottom: '1px solid var(--border)', fontSize: 13,
                          }}>
                            <span style={{ color: 'var(--text-muted)' }}>{f.label}</span>
                            <span style={{ fontWeight: 500 }}>{f.value || '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Equipamentos via scan externo (mudomix.com) */}
                {profile && (
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 14 }}>Equipamentos (scan externo)</div>
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
                )}
              </div>
            </div>
          )
        )}
      </div>
    </>
  )
}
