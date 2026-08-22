import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Eye, EyeOff, Users, X } from 'lucide-react'
import { api, type AltEntry, type AdminMember } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const CLASS_COLORS: Record<string, string> = {
  'ELF': 'class-me',
  'BK': 'class-bk',
  'DL': 'class-dl',
  'MG': 'class-mg',
  'SM': 'class-sm',
}
const CLASSES = ['ELF', 'BK', 'DL', 'MG', 'SM']

const SIDE_LABELS: Record<string, string> = {
  euphoria: 'Nossa Guilda',
  blacklist: 'Blacklist',
}

interface AltGroup {
  side: 'euphoria' | 'blacklist'
  mainNick: string
  mainClass: string | null
  rows: AltEntry[]        // linhas com alt_nick preenchido
  placeholderId: number | null // linha "só main, sem alt ainda" (alt_nick null)
  allIds: number[]
}

function buildGroups(entries: AltEntry[]): AltGroup[] {
  const map = new Map<string, AltGroup>()
  for (const e of entries) {
    const key = `${e.side}::${e.main_nick.toLowerCase()}`
    let g = map.get(key)
    if (!g) {
      g = { side: e.side, mainNick: e.main_nick, mainClass: e.main_class, rows: [], placeholderId: null, allIds: [] }
      map.set(key, g)
    }
    g.allIds.push(e.id)
    if (e.main_class && !g.mainClass) g.mainClass = e.main_class
    if (e.alt_nick) g.rows.push(e)
    else g.placeholderId = e.id
  }
  return Array.from(map.values()).sort((a, b) => a.mainNick.localeCompare(b.mainNick))
}

// ── Autocomplete simples com sugestões (nick + classe) ──────────────────────
function AutocompleteInput({ value, onChange, suggestions, placeholder }: {
  value: string
  onChange: (v: string) => void
  suggestions: AdminMember[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)

  const matches = value.trim().length > 0
    ? suggestions.filter(m => m.name.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 6)
    : []

  return (
    <div style={{ position: 'relative', flex: '1 1 160px' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '8px 10px', background: 'var(--bg-700)',
          border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
        }}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: 'var(--bg-800)', border: '1px solid var(--border)', borderRadius: 6,
          marginTop: 4, boxShadow: '0 8px 20px rgba(0,0,0,0.4)', overflow: 'hidden',
        }}>
          {matches.map(m => (
            <div
              key={m.name}
              onMouseDown={() => { onChange(m.name); setOpen(false) }}
              style={{
                padding: '7px 10px', cursor: 'pointer', fontSize: 12,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: '1px solid var(--border)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-700)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontWeight: 600 }}>{m.name}</span>
              {m.char_class && (
                <span className={CLASS_COLORS[m.char_class] ?? ''} style={{ fontSize: 10 }}>{m.char_class}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Alts() {
  const { isStaff } = useAuth()

  const [entries, setEntries] = useState<AltEntry[]>([])
  const [members, setMembers] = useState<AdminMember[]>([])
  const [visibleToMembers, setVisibleToMembers] = useState(false)
  const [allowed, setAllowed] = useState(true)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sideFilter, setSideFilter] = useState<'all' | 'euphoria' | 'blacklist'>('all')
  const [busy, setBusy] = useState(false)

  // Form: criar novo vínculo
  const [formSide, setFormSide] = useState<'euphoria' | 'blacklist'>('euphoria')
  const [mainNick, setMainNick] = useState('')
  const [altNick, setAltNick] = useState('')
  const [mainClass, setMainClass] = useState('ELF')
  const [notes, setNotes] = useState('')

  // Adicionar alt a um grupo existente
  const [addingAltFor, setAddingAltFor] = useState<string | null>(null)
  const [addAltValue, setAddAltValue] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await api.getAlts()
      setEntries(data.entries)
      setVisibleToMembers(data.visible_to_members)
      setAllowed(true)
    } catch (e: any) {
      if (e?.message?.includes('403')) setAllowed(false)
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (isStaff) {
      api.getAllMembersAdmin().then(setMembers).catch(() => {})
    }
  }, [isStaff])

  const groups = useMemo(() => buildGroups(entries), [entries])

  const filteredGroups = groups.filter(g => {
    const matchSide = sideFilter === 'all' || g.side === sideFilter
    const q = search.trim().toLowerCase()
    const matchSearch = q === '' ||
      g.mainNick.toLowerCase().includes(q) ||
      g.rows.some(r => (r.alt_nick ?? '').toLowerCase().includes(q))
    return matchSide && matchSearch
  })

  async function handleCreate() {
    if (!mainNick.trim()) { alert('Informe a conta principal.'); return }
    setBusy(true)
    try {
      await api.createAlt({
        main_nick: mainNick.trim(),
        alt_nick: altNick.trim() || undefined,
        side: formSide,
        main_class: formSide === 'blacklist' ? mainClass : undefined,
        notes: notes.trim() || undefined,
      })
      setMainNick(''); setAltNick(''); setNotes('')
      await load()
    } catch (e: any) {
      alert(e?.message || 'Erro ao adicionar')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddAlt(group: AltGroup) {
    if (!addAltValue.trim()) return
    setBusy(true)
    try {
      await api.createAlt({
        main_nick: group.mainNick,
        alt_nick: addAltValue.trim(),
        side: group.side,
        main_class: group.mainClass ?? undefined,
      })
      // Remove o placeholder "sem alt" já que agora existe uma conta real
      if (group.placeholderId !== null) {
        await api.deleteAlt(group.placeholderId)
      }
      setAddAltValue('')
      setAddingAltFor(null)
      await load()
    } catch (e: any) {
      alert(e?.message || 'Erro ao adicionar conta')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveAlt(id: number) {
    if (!confirm('Remover esta conta?')) return
    setBusy(true)
    try {
      await api.deleteAlt(id)
      await load()
    } catch (e: any) {
      alert(e?.message || 'Erro ao remover')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveGroup(group: AltGroup) {
    if (!confirm(`Remover ${group.mainNick} e todas as contas vinculadas?`)) return
    setBusy(true)
    try {
      await Promise.all(group.allIds.map(id => api.deleteAlt(id)))
      await load()
    } catch (e: any) {
      alert(e?.message || 'Erro ao remover')
    } finally {
      setBusy(false)
    }
  }

  async function toggleVisibility() {
    setBusy(true)
    try {
      await api.setAltsVisibility(!visibleToMembers)
      setVisibleToMembers(v => !v)
    } catch (e: any) {
      alert(e?.message || 'Erro ao atualizar visibilidade')
    } finally {
      setBusy(false)
    }
  }

  if (!allowed && !loading) {
    return (
      <div className="page-body">
        <div className="loading" style={{ flexDirection: 'column', gap: 8 }}>
          <Users size={28} style={{ color: 'var(--text-muted)' }} />
          <span>Esta lista ainda não foi liberada para membros pela staff.</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <h2>Contas &amp; Alts</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {filteredGroups.length} de {groups.length} contas principais
        </span>
      </div>

      <div className="page-body">
        {/* Staff: visibilidade */}
        {isStaff && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
                  Visível para membros
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {visibleToMembers
                    ? 'Todos os membros aprovados podem ver esta lista.'
                    : 'Apenas staff/admin podem ver esta lista no momento.'}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={toggleVisibility} disabled={busy}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {visibleToMembers ? <Eye size={14} /> : <EyeOff size={14} />}
                {visibleToMembers ? 'Liberado' : 'Restrito à staff'}
              </button>
            </div>
          </div>
        )}

        {/* Staff: cadastro */}
        {isStaff && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <button
                onClick={() => setFormSide('euphoria')}
                className={formSide === 'euphoria' ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ fontSize: 12 }}
              >
                + Nossa Guilda
              </button>
              <button
                onClick={() => setFormSide('blacklist')}
                className={formSide === 'blacklist' ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ fontSize: 12 }}
              >
                + Blacklist
              </button>
            </div>

            {formSide === 'euphoria' ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <AutocompleteInput value={mainNick} onChange={setMainNick} suggestions={members} placeholder="Conta principal (nick de membro)" />
                <AutocompleteInput value={altNick} onChange={setAltNick} suggestions={members} placeholder="Nick do alt (opcional)" />
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Observações (opcional)"
                  style={{
                    flex: '2 1 200px', padding: '8px 10px', background: 'var(--bg-700)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  }}
                />
                <button className="btn btn-primary" onClick={handleCreate} disabled={busy}>
                  <Plus size={14} /> Adicionar
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={mainNick}
                  onChange={e => setMainNick(e.target.value)}
                  placeholder="Nick da main (blacklist)"
                  style={{
                    flex: '1 1 160px', padding: '8px 10px', background: 'var(--bg-700)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  }}
                />
                <select
                  value={mainClass}
                  onChange={e => setMainClass(e.target.value)}
                  style={{
                    padding: '8px 10px', background: 'var(--bg-700)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 13,
                  }}
                >
                  {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  value={altNick}
                  onChange={e => setAltNick(e.target.value)}
                  placeholder="Conta dele (opcional, pode add depois)"
                  style={{
                    flex: '1 1 180px', padding: '8px 10px', background: 'var(--bg-700)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  }}
                />
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Observações (opcional)"
                  style={{
                    flex: '2 1 200px', padding: '8px 10px', background: 'var(--bg-700)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  }}
                />
                <button className="btn btn-primary" onClick={handleCreate} disabled={busy}>
                  <Plus size={14} /> Adicionar
                </button>
              </div>
            )}
          </div>
        )}

        {/* Filtros */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nick..."
              style={{
                flex: 1, minWidth: 200, padding: '8px 10px', background: 'var(--bg-700)',
                border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 13, outline: 'none',
              }}
            />
            <select
              value={sideFilter}
              onChange={e => setSideFilter(e.target.value as 'all' | 'euphoria' | 'blacklist')}
              style={{
                padding: '8px 12px', background: 'var(--bg-700)',
                border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 13,
              }}
            >
              <option value="all">Todos</option>
              <option value="euphoria">Nossa Guilda</option>
              <option value="blacklist">Blacklist</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : filteredGroups.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum registro encontrado.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {filteredGroups.map(g => {
              const key = `${g.side}::${g.mainNick}`
              return (
                <div key={key} className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{g.mainNick}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                          color: g.side === 'euphoria' ? 'var(--accent)' : 'var(--red)',
                          background: g.side === 'euphoria' ? 'rgba(201,168,76,0.12)' : 'rgba(229,62,62,0.12)',
                        }}>
                          {SIDE_LABELS[g.side]}
                        </span>
                        {g.mainClass && (
                          <span className={CLASS_COLORS[g.mainClass] ?? ''} style={{ fontSize: 11 }}>
                            {g.mainClass}
                          </span>
                        )}
                      </div>
                    </div>
                    {isStaff && (
                      <button onClick={() => handleRemoveGroup(g)} disabled={busy}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {/* Lista de alts */}
                  {g.rows.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                      Nenhuma conta vinculada ainda.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                      {g.rows.map(r => (
                        <div key={r.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '4px 8px', background: 'var(--bg-700)', borderRadius: 5, fontSize: 12,
                        }}>
                          <span>{r.alt_nick}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {r.notes && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{r.notes}</span>}
                            {isStaff && (
                              <button onClick={() => handleRemoveAlt(r.id)} disabled={busy}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}>
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Adicionar conta ao grupo */}
                  {isStaff && (
                    addingAltFor === key ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {g.side === 'euphoria' ? (
                          <AutocompleteInput value={addAltValue} onChange={setAddAltValue} suggestions={members} placeholder="Nick do alt" />
                        ) : (
                          <input
                            value={addAltValue}
                            onChange={e => setAddAltValue(e.target.value)}
                            placeholder="Nick do alt"
                            autoFocus
                            style={{
                              flex: 1, padding: '6px 8px', background: 'var(--bg-700)',
                              border: '1px solid var(--accent)', borderRadius: 6,
                              color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                            }}
                          />
                        )}
                        <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 12 }}
                          onClick={() => handleAddAlt(g)} disabled={busy}>+</button>
                        <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }}
                          onClick={() => { setAddingAltFor(null); setAddAltValue('') }}>✕</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', width: '100%', justifyContent: 'center' }}
                        onClick={() => { setAddingAltFor(key); setAddAltValue('') }}>
                        <Plus size={11} /> Adicionar conta
                      </button>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
