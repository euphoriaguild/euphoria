import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Eye, EyeOff, Users, X, Pencil, Check, Search } from 'lucide-react'
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
  const [restrictedMode, setRestrictedMode] = useState(false)
  const [myNick, setMyNick] = useState<string | null>(null)
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

  // Editar alt existente
  const [editingAltId, setEditingAltId] = useState<number | null>(null)
  const [editAltNick, setEditAltNick] = useState('')
  const [editAltNotes, setEditAltNotes] = useState('')

  // Modal de detalhes
  const [selectedGroup, setSelectedGroup] = useState<AltGroup | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await api.getAlts()
      setEntries(data.entries)
      setVisibleToMembers(data.visible_to_members)
      setRestrictedMode(data.restricted_mode ?? false)
      setMyNick(data.my_nick ?? null)
      setAllowed(true)
      // Atualiza o modal se estiver aberto
      if (selectedGroup) {
        const newGroups = buildGroups(data.entries)
        const key = `${selectedGroup.side}::${selectedGroup.mainNick.toLowerCase()}`
        const updated = newGroups.find(g => `${g.side}::${g.mainNick.toLowerCase()}` === key)
        setSelectedGroup(updated ?? null)
      }
    } catch (e: any) {
      if (e?.message?.includes('403')) setAllowed(false)
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Carrega membros para autocomplete (staff e membros podem editar)
    api.getAllMembersAdmin().then(setMembers).catch(() => {})
  }, [])

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
    // Em modo restrito, usa o nick do membro logado
    const nickToUse = restrictedMode && myNick ? myNick : mainNick.trim()
    if (!nickToUse) { alert('Informe a conta principal.'); return }
    setBusy(true)
    try {
      await api.createAlt({
        main_nick: nickToUse,
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
        // Para "Nossa Guilda" a classe é sempre puxada ao vivo do perfil (não precisa salvar).
        main_class: group.side === 'blacklist' ? (group.mainClass ?? undefined) : undefined,
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

  function startEditAlt(r: AltEntry) {
    setEditingAltId(r.id)
    setEditAltNick(r.alt_nick ?? '')
    setEditAltNotes(r.notes ?? '')
  }

  async function handleSaveEditAlt() {
    if (editingAltId === null) return
    setBusy(true)
    try {
      await api.updateAlt(editingAltId, {
        alt_nick: editAltNick.trim() || undefined,
        notes: editAltNotes.trim() || undefined,
      })
      setEditingAltId(null)
      setEditAltNick('')
      setEditAltNotes('')
      await load()
    } catch (e: any) {
      alert(e?.message || 'Erro ao atualizar')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveGroup(group: AltGroup) {
    if (!confirm(`Remover ${group.mainNick} e todas as contas vinculadas?`)) return
    setBusy(true)
    try {
      await Promise.all(group.allIds.map(id => api.deleteAlt(id)))
      setSelectedGroup(null)
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
                    : 'Apenas staff/admin podem ver esta lista no momento. Membros só veem suas próprias contas.'}
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

        {/* Aviso para membros em modo restrito */}
        {restrictedMode && !isStaff && (
          <div className="card" style={{ marginBottom: 16, background: 'var(--bg-800)', border: '1px solid var(--accent-yellow)', borderLeft: '4px solid var(--accent-yellow)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <EyeOff size={20} style={{ color: 'var(--accent-yellow)', marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: 'var(--accent-yellow)' }}>
                  Lista restrita no momento
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  A lista completa de contas está visível apenas para a staff. Você pode cadastrar e gerenciar suas próprias contas abaixo.
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                  <strong>Precisa de ajuda?</strong> Procure as lideranças: <span style={{ color: 'var(--accent-primary)' }}>Weliz</span>, <span style={{ color: 'var(--accent-primary)' }}>pacheco</span>, <span style={{ color: 'var(--accent-primary)' }}>Alezin</span> ou <span style={{ color: 'var(--accent-primary)' }}>ka0z</span>.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Formulário de cadastro - disponível para todos os membros */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            <button
                onClick={() => setFormSide('euphoria')}
                className={formSide === 'euphoria' ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ fontSize: 12 }}
              >
                + Nossa Guilda
              </button>
              {/* Botão de blacklist só aparece quando não está em modo restrito */}
              {!restrictedMode && (
                <button
                  onClick={() => setFormSide('blacklist')}
                  className={formSide === 'blacklist' ? 'btn btn-primary' : 'btn btn-ghost'}
                  style={{ fontSize: 12 }}
                >
                  + Blacklist
                </button>
              )}
            </div>

            {formSide === 'euphoria' ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* Em modo restrito, o nick da main é fixo no nick do membro logado */}
                {restrictedMode && myNick ? (
                  <input
                    value={myNick}
                    disabled
                    style={{
                      flex: '1 1 160px', padding: '8px 10px', background: 'var(--bg-800)',
                      border: '1px solid var(--border)', borderRadius: 6,
                      color: 'var(--text-muted)', fontSize: 13, outline: 'none',
                    }}
                  />
                ) : (
                  <AutocompleteInput value={mainNick} onChange={setMainNick} suggestions={members} placeholder="Conta principal (nick de membro)" />
                )}
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

        {/* Filtros */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nick (main ou alt)..."
                style={{
                  width: '100%', padding: '8px 10px 8px 34px', background: 'var(--bg-700)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                }}
              />
            </div>
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
          <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {search.trim() ? `Nenhum resultado para "${search}"` : 'Nenhum registro encontrado.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {filteredGroups.map(g => {
              const key = `${g.side}::${g.mainNick}`
              const visibleAlts = g.rows.slice(0, 5)
              const hiddenCount = g.rows.length - 5
              return (
                <div key={key} className="card" style={{ padding: '12px 14px' }}>
                  {/* Header */}
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
                    <button onClick={(e) => { e.stopPropagation(); handleRemoveGroup(g) }} disabled={busy}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Lista de alts (máximo 5) */}
                  {g.rows.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                      Nenhuma conta vinculada ainda.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                      {visibleAlts.map(r => (
                        <div key={r.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '4px 8px', background: 'var(--bg-700)', borderRadius: 5, fontSize: 12,
                        }}>
                          <span>{r.alt_nick}</span>
                          <button onClick={(e) => { e.stopPropagation(); handleRemoveAlt(r.id) }} disabled={busy}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}>
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      {hiddenCount > 0 && (
                        <button
                          onClick={() => setSelectedGroup(g)}
                          style={{
                            padding: '6px 8px', background: 'var(--bg-700)', borderRadius: 5, fontSize: 11,
                            color: 'var(--text-muted)', border: 'none', cursor: 'pointer', textAlign: 'center',
                          }}
                        >
                          ... +{hiddenCount} conta{hiddenCount !== 1 ? 's' : ''} (ver todas)
                        </button>
                      )}
                    </div>
                  )}

                  {/* Botão adicionar */}
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: '4px 10px', width: '100%', justifyContent: 'center' }}
                    onClick={() => setSelectedGroup(g)}
                  >
                    <Plus size={11} /> Adicionar / Editar
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal de detalhes */}
      {selectedGroup && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
          onClick={() => { setSelectedGroup(null); setAddingAltFor(null); setEditingAltId(null) }}
        >
          <div
            className="card"
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480, maxHeight: '80vh', overflow: 'auto',
              padding: 20, position: 'relative',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{selectedGroup.mainNick}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
                    color: selectedGroup.side === 'euphoria' ? 'var(--accent)' : 'var(--red)',
                    background: selectedGroup.side === 'euphoria' ? 'rgba(201,168,76,0.12)' : 'rgba(229,62,62,0.12)',
                  }}>
                    {SIDE_LABELS[selectedGroup.side]}
                  </span>
                  {selectedGroup.mainClass && (
                    <span className={CLASS_COLORS[selectedGroup.mainClass] ?? ''} style={{ fontSize: 12 }}>
                      {selectedGroup.mainClass}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleRemoveGroup(selectedGroup)} disabled={busy}
                  style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4 }}>
                  <Trash2 size={16} />
                </button>
                <button onClick={() => { setSelectedGroup(null); setAddingAltFor(null); setEditingAltId(null) }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Lista de alts */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                Contas vinculadas ({selectedGroup.rows.length})
              </div>
              {selectedGroup.rows.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>
                  Nenhuma conta vinculada ainda.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selectedGroup.rows.map(r => (
                    editingAltId === r.id ? (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 10px', background: 'var(--bg-700)', borderRadius: 6,
                      }}>
                        <input
                          value={editAltNick}
                          onChange={e => setEditAltNick(e.target.value)}
                          placeholder="Nick"
                          autoFocus
                          style={{
                            flex: 1, padding: '6px 8px', background: 'var(--bg-800)',
                            border: '1px solid var(--accent)', borderRadius: 4,
                            color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                          }}
                        />
                        <input
                          value={editAltNotes}
                          onChange={e => setEditAltNotes(e.target.value)}
                          placeholder="Observação"
                          style={{
                            width: 100, padding: '6px 8px', background: 'var(--bg-800)',
                            border: '1px solid var(--border)', borderRadius: 4,
                            color: 'var(--text-muted)', fontSize: 11, outline: 'none',
                          }}
                        />
                        <button onClick={handleSaveEditAlt} disabled={busy}
                          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 4 }}>
                          <Check size={14} />
                        </button>
                        <button onClick={() => setEditingAltId(null)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 10px', background: 'var(--bg-700)', borderRadius: 6, fontSize: 13,
                      }}>
                        <span style={{ fontWeight: 500 }}>{r.alt_nick}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {r.notes && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.notes}</span>}
                          <button onClick={() => startEditAlt(r)} disabled={busy}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => handleRemoveAlt(r.id)} disabled={busy}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>

            {/* Adicionar nova alt */}
            {addingAltFor === `${selectedGroup.side}::${selectedGroup.mainNick}` ? (
              <div style={{ display: 'flex', gap: 6 }}>
                {selectedGroup.side === 'euphoria' ? (
                  <AutocompleteInput value={addAltValue} onChange={setAddAltValue} suggestions={members} placeholder="Nick do alt" />
                ) : (
                  <input
                    value={addAltValue}
                    onChange={e => setAddAltValue(e.target.value)}
                    placeholder="Nick do alt"
                    autoFocus
                    style={{
                      flex: 1, padding: '8px 10px', background: 'var(--bg-700)',
                      border: '1px solid var(--accent)', borderRadius: 6,
                      color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                    }}
                  />
                )}
                <button className="btn btn-primary" style={{ padding: '8px 14px' }}
                  onClick={() => handleAddAlt(selectedGroup)} disabled={busy}>
                  <Plus size={14} />
                </button>
                <button className="btn btn-ghost" style={{ padding: '8px 14px' }}
                  onClick={() => { setAddingAltFor(null); setAddAltValue('') }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                onClick={() => { setAddingAltFor(`${selectedGroup.side}::${selectedGroup.mainNick}`); setAddAltValue('') }}
              >
                <Plus size={14} /> Adicionar conta
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
