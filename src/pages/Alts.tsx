import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit2, Check, X, Eye, EyeOff, Users } from 'lucide-react'
import { api, type AltEntry } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const SIDE_LABELS: Record<string, string> = {
  euphoria: 'Nossa Guilda',
  enemy: 'Guilda Inimiga',
}

export function Alts() {
  const { isStaff } = useAuth()

  const [entries, setEntries] = useState<AltEntry[]>([])
  const [visibleToMembers, setVisibleToMembers] = useState(false)
  const [allowed, setAllowed] = useState(true)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sideFilter, setSideFilter] = useState<'all' | 'euphoria' | 'enemy'>('all')

  // Novo registro
  const [mainNick, setMainNick] = useState('')
  const [altNick, setAltNick] = useState('')
  const [side, setSide] = useState<'euphoria' | 'enemy'>('euphoria')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  // Edição inline
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editMain, setEditMain] = useState('')
  const [editAlt, setEditAlt] = useState('')
  const [editSide, setEditSide] = useState<'euphoria' | 'enemy'>('euphoria')
  const [editNotes, setEditNotes] = useState('')

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

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!mainNick.trim() || !altNick.trim()) { alert('Preencha conta principal e alt.'); return }
    setBusy(true)
    try {
      await api.createAlt({ main_nick: mainNick.trim(), alt_nick: altNick.trim(), side, notes: notes.trim() || undefined })
      setMainNick(''); setAltNick(''); setNotes(''); setSide('euphoria')
      await load()
    } catch (e: any) {
      alert(e?.message || 'Erro ao adicionar')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(e: AltEntry) {
    setEditingId(e.id)
    setEditMain(e.main_nick)
    setEditAlt(e.alt_nick)
    setEditSide(e.side)
    setEditNotes(e.notes ?? '')
  }

  async function saveEdit() {
    if (editingId === null) return
    setBusy(true)
    try {
      await api.updateAlt(editingId, { main_nick: editMain.trim(), alt_nick: editAlt.trim(), side: editSide, notes: editNotes.trim() })
      setEditingId(null)
      await load()
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remover este registro?')) return
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

  const filtered = entries.filter(e => {
    const matchSearch = (e.main_nick + ' ' + e.alt_nick).toLowerCase().includes(search.toLowerCase())
    const matchSide = sideFilter === 'all' || e.side === sideFilter
    return matchSearch && matchSide
  })

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
          {filtered.length} de {entries.length} registros
        </span>
      </div>

      <div className="page-body">
        {/* Staff: visibilidade + cadastro */}
        {isStaff && (
          <>
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

            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                + Adicionar conta/alt
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={mainNick}
                  onChange={e => setMainNick(e.target.value)}
                  placeholder="Conta principal"
                  style={{
                    flex: '1 1 160px', padding: '8px 10px', background: 'var(--bg-700)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  }}
                />
                <input
                  value={altNick}
                  onChange={e => setAltNick(e.target.value)}
                  placeholder="Nick do alt"
                  style={{
                    flex: '1 1 160px', padding: '8px 10px', background: 'var(--bg-700)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  }}
                />
                <select
                  value={side}
                  onChange={e => setSide(e.target.value as 'euphoria' | 'enemy')}
                  style={{
                    padding: '8px 10px', background: 'var(--bg-700)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 13,
                  }}
                >
                  <option value="euphoria">Nossa Guilda</option>
                  <option value="enemy">Guilda Inimiga</option>
                </select>
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
            </div>
          </>
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
              onChange={e => setSideFilter(e.target.value as 'all' | 'euphoria' | 'enemy')}
              style={{
                padding: '8px 12px', background: 'var(--bg-700)',
                border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 13,
              }}
            >
              <option value="all">Todos</option>
              <option value="euphoria">Nossa Guilda</option>
              <option value="enemy">Guilda Inimiga</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum registro encontrado.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Conta Principal</th>
                  <th>Alt</th>
                  <th>Lado</th>
                  <th>Observações</th>
                  {isStaff && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id}>
                    {editingId === e.id ? (
                      <>
                        <td>
                          <input value={editMain} onChange={ev => setEditMain(ev.target.value)}
                            style={{ padding: '4px 8px', background: 'var(--bg-700)', border: '1px solid var(--accent)',
                              borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, width: '100%' }} />
                        </td>
                        <td>
                          <input value={editAlt} onChange={ev => setEditAlt(ev.target.value)}
                            style={{ padding: '4px 8px', background: 'var(--bg-700)', border: '1px solid var(--accent)',
                              borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, width: '100%' }} />
                        </td>
                        <td>
                          <select value={editSide} onChange={ev => setEditSide(ev.target.value as 'euphoria' | 'enemy')}
                            style={{ padding: '4px 8px', background: 'var(--bg-700)', border: '1px solid var(--accent)',
                              borderRadius: 4, color: 'var(--text-primary)', fontSize: 12 }}>
                            <option value="euphoria">Nossa Guilda</option>
                            <option value="enemy">Guilda Inimiga</option>
                          </select>
                        </td>
                        <td>
                          <input value={editNotes} onChange={ev => setEditNotes(ev.target.value)}
                            style={{ padding: '4px 8px', background: 'var(--bg-700)', border: '1px solid var(--accent)',
                              borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, width: '100%' }} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost" onClick={saveEdit} disabled={busy} style={{ padding: '4px 8px' }}>
                              <Check size={14} />
                            </button>
                            <button className="btn btn-ghost" onClick={() => setEditingId(null)} style={{ padding: '4px 8px' }}>
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: 600 }}>{e.main_nick}</td>
                        <td>{e.alt_nick}</td>
                        <td>
                          <span className={e.side === 'euphoria' ? 'guild-euphoria' : ''} style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                            color: e.side === 'euphoria' ? 'var(--accent)' : 'var(--red)',
                            background: e.side === 'euphoria' ? 'rgba(201,168,76,0.12)' : 'rgba(229,62,62,0.12)',
                          }}>
                            {SIDE_LABELS[e.side]}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{e.notes || '—'}</td>
                        {isStaff && (
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-ghost" onClick={() => startEdit(e)} style={{ padding: '4px 8px' }}>
                                <Edit2 size={14} />
                              </button>
                              <button className="btn btn-ghost" onClick={() => handleDelete(e.id)} style={{ padding: '4px 8px' }}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
