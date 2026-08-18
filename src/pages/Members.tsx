import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Edit2, Check, X } from 'lucide-react'
import { api, type AdminMember } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const CLASS_COLORS: Record<string, string> = {
  'ELF': 'class-me',
  'BK': 'class-bk',
  'DL': 'class-dl',
  'MG': 'class-mg',
  'SM': 'class-sm',
}

const CLASSES = ['ELF', 'BK', 'DL', 'MG', 'SM']

const SORT_OPTIONS = [
  { value: 'resets', label: 'Resets' },
  { value: 'level', label: 'Level' },
  { value: 'name', label: 'Nome' },
  { value: 'char_class', label: 'Classe' },
]

export function Members() {
  const { profile } = useAuth()
  const isStaff = profile?.role === 'staff' || profile?.role === 'admin'

  const [members, setMembers] = useState<AdminMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('resets')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [classFilter, setClassFilter] = useState('all')

  // Edição
  const [editingNick, setEditingNick] = useState<string | null>(null)
  const [editClass, setEditClass] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = isStaff
        ? await api.getAllMembersAdmin()
        : await api.getAllMembers(sortBy, order) as unknown as AdminMember[]
      setMembers(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sortBy, order, isStaff])

  const classes = Array.from(new Set(members.map(m => m.char_class).filter(Boolean))).sort()

  const filtered = members.filter(m => {
    const matchSearch = m.name?.toLowerCase().includes(search.toLowerCase())
    const matchClass = classFilter === 'all' || m.char_class === classFilter
    return matchSearch && matchClass
  })

  // Ordena localmente se não for staff (staff já vem ordenado por nick)
  const sorted = isStaff
    ? [...filtered].sort((a, b) => {
        if (sortBy === 'resets') return order === 'desc' ? b.resets - a.resets : a.resets - b.resets
        if (sortBy === 'level') return order === 'desc' ? b.level - a.level : a.level - b.level
        if (sortBy === 'name') return order === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)
        if (sortBy === 'char_class') return order === 'desc' ? b.char_class.localeCompare(a.char_class) : a.char_class.localeCompare(b.char_class)
        return 0
      })
    : filtered

  function startEdit(nick: string, currentClass: string) {
    setEditingNick(nick)
    setEditClass(currentClass || 'ELF')
  }

  function cancelEdit() {
    setEditingNick(null)
    setEditClass('')
  }

  async function saveEdit() {
    if (!editingNick) return
    setSaving(true)
    try {
      await api.updateMember(editingNick, { char_class: editClass })
      setMembers(prev =>
        prev.map(m => m.name === editingNick ? { ...m, char_class: editClass } : m)
      )
      setEditingNick(null)
      setEditClass('')
    } catch (e) {
      console.error(e)
      alert('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Membros</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} de {members.length} membros
        </span>
      </div>

      <div className="page-body">
        {/* Filtros */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Busca */}
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', pointerEvents: 'none'
              }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar personagem..."
                style={{
                  width: '100%', padding: '8px 10px 8px 32px',
                  background: 'var(--bg-700)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text-primary)', fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            {/* Classe */}
            <select
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
              style={{
                padding: '8px 12px', background: 'var(--bg-700)',
                border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 13,
              }}
            >
              <option value="all">Todas as classes</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Ordenação */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                padding: '8px 12px', background: 'var(--bg-700)',
                border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 13,
              }}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>Ordenar: {o.label}</option>)}
            </select>

            {/* Ordem */}
            <button
              className="btn btn-ghost"
              onClick={() => setOrder(o => o === 'desc' ? 'asc' : 'desc')}
            >
              {order === 'desc' ? '↓ Maior' : '↑ Menor'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Personagem</th>
                  <th>Classe</th>
                  <th>Resets</th>
                  <th>Level</th>
                  {isStaff && <th>Status</th>}
                  {isStaff && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((m, i) => (
                  <tr key={`${m.name}`}>
                    <td><span className="rank-pos">{i + 1}</span></td>
                    <td>
                      <Link to={`/perfil/${m.name}`} style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {m.name}
                      </Link>
                    </td>
                    <td>
                      {editingNick === m.name ? (
                        <select
                          value={editClass}
                          onChange={e => setEditClass(e.target.value)}
                          style={{
                            padding: '4px 8px', background: 'var(--bg-700)',
                            border: '1px solid var(--accent)', borderRadius: 4,
                            color: 'var(--text-primary)', fontSize: 12,
                          }}
                        >
                          {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span className={CLASS_COLORS[m.char_class] ?? ''}>{m.char_class || '—'}</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{m.resets}</td>
                    <td>{m.level}</td>
                    {isStaff && (
                      <td>
                        <span className={`badge ${m.approved ? 'badge-member' : 'badge-pending'}`}>
                          {m.approved ? m.role : 'Pendente'}
                        </span>
                      </td>
                    )}
                    {isStaff && (
                      <td>
                        {editingNick === m.name ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn-ghost"
                              onClick={saveEdit}
                              disabled={saving}
                              style={{ padding: '4px 8px' }}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              className="btn btn-ghost"
                              onClick={cancelEdit}
                              style={{ padding: '4px 8px' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-ghost"
                            onClick={() => startEdit(m.name, m.char_class)}
                            style={{ padding: '4px 8px' }}
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                      </td>
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
