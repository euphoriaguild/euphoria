import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api, type GuildMember } from '../lib/api'

const CLASS_COLORS: Record<string, string> = {
  'Blade Knight': 'class-bk',
  'Soul Master': 'class-sm',
  'Muse Elf': 'class-me',
  'Dark Lord': 'class-dl',
  'Magic Gladiator': 'class-mg',
  'Dark Wizard': 'class-dw',
  'Fairy Elf': 'class-me',
}

const GUILD_COLORS: Record<string, string> = {
  Euphoria: 'guild-euphoria',
  Euphor1a: 'guild-euphor1a',
  Jackson5: 'guild-jackson5',
  HellBoyz: 'guild-hellboyz',
}

const SORT_OPTIONS = [
  { value: 'resets', label: 'Resets' },
  { value: 'level', label: 'Level' },
  { value: 'name', label: 'Nome' },
  { value: 'guild', label: 'Guilda' },
  { value: 'char_class', label: 'Classe' },
]

export function Members() {
  const [members, setMembers] = useState<GuildMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('resets')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [guildFilter, setGuildFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('all')

  async function load() {
    setLoading(true)
    try {
      const data = await api.getAllMembers(sortBy, order)
      setMembers(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sortBy, order])

  const guilds = Array.from(new Set(members.map(m => m.guild))).sort()
  const classes = Array.from(new Set(members.map(m => m.char_class))).sort()

  const filtered = members.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase())
    const matchGuild = guildFilter === 'all' || m.guild === guildFilter
    const matchClass = classFilter === 'all' || m.char_class === classFilter
    return matchSearch && matchGuild && matchClass
  })

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

            {/* Guilda */}
            <select
              value={guildFilter}
              onChange={e => setGuildFilter(e.target.value)}
              style={{
                padding: '8px 12px', background: 'var(--bg-700)',
                border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 13,
              }}
            >
              <option value="all">Todas as guildas</option>
              {guilds.map(g => <option key={g} value={g}>{g}</option>)}
            </select>

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
                  <th>Guilda</th>
                  <th>Resets</th>
                  <th>Level</th>
                  <th>Cargo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={`${m.name}-${m.guild}`}>
                    <td><span className="rank-pos">{i + 1}</span></td>
                    <td>
                      <Link to={`/perfil/${m.name}`} style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {m.name}
                      </Link>
                    </td>
                    <td className={CLASS_COLORS[m.char_class] ?? ''}>{m.char_class}</td>
                    <td className={GUILD_COLORS[m.guild] ?? ''}>{m.guild}</td>
                    <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{m.resets}</td>
                    <td>{m.level}</td>
                    <td>
                      <span className={`badge ${m.member_level === 'Master' ? 'badge-master' : 'badge-member'}`}>
                        {m.member_level}
                      </span>
                    </td>
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
