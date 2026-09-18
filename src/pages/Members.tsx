import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, RefreshCw, ArrowUpDown, Wifi, WifiOff } from 'lucide-react'
import { api, type LiveMember, type LiveMembersData } from '../lib/api'

const CLASS_COLORS: Record<string, string> = {
  'Magic Gladiator': 'class-mg',
  'Blade Knight': 'class-bk',
  'Dark Knight': 'class-bk',
  'Soul Master': 'class-sm',
  'Dark Wizard': 'class-sm',
  'Muse Elf': 'class-me',
  'Fairy Elf': 'class-me',
  'Dark Lord': 'class-dl',
}

type SortKey = 'name' | 'guild' | 'char_class' | 'resets' | 'level' | 'online' | 'site_registered'

const GUILD_PRIORITY: Record<string, number> = {
  euphoria: 0,
  euph0ria: 1,
  euphor1a: 2,
}

function defaultSort(a: LiveMember, b: LiveMember): number {
  if (b.resets !== a.resets) return b.resets - a.resets
  const ga = GUILD_PRIORITY[a.guild.toLowerCase()] ?? 99
  const gb = GUILD_PRIORITY[b.guild.toLowerCase()] ?? 99
  if (ga !== gb) return ga - gb
  return a.name.localeCompare(b.name)
}

function compare(a: LiveMember, b: LiveMember, key: SortKey, dir: 'asc' | 'desc'): number {
  const mul = dir === 'asc' ? 1 : -1
  const av = a[key]
  const bv = b[key]
  if (typeof av === 'boolean' && typeof bv === 'boolean') {
    return mul * (Number(av) - Number(bv))
  }
  if (typeof av === 'number' && typeof bv === 'number') {
    return mul * (av - bv)
  }
  return mul * String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' })
}

export function Members() {
  const [data, setData] = useState<LiveMembersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('resets')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [useDefaultSort, setUseDefaultSort] = useState(true)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.getMembersLive()
      setData(res)
      setUseDefaultSort(true)
      setSortKey('resets')
      setSortDir('desc')
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Falha ao carregar membros')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const classes = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.members.map(m => m.char_class).filter(Boolean))).sort()
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.members.filter(m => {
      const matchSearch = !search.trim() || m.name.toLowerCase().includes(search.trim().toLowerCase())
      const matchClass = classFilter === 'all' || m.char_class === classFilter
      const matchOnline = !onlineOnly || m.online
      return matchSearch && matchClass && matchOnline
    })
  }, [data, search, classFilter, onlineOnly])

  const sorted = useMemo(() => {
    const list = [...filtered]
    if (useDefaultSort) {
      list.sort(defaultSort)
      return list
    }
    list.sort((a, b) => compare(a, b, sortKey, sortDir))
    return list
  }, [filtered, useDefaultSort, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    setUseDefaultSort(false)
    if (sortKey === key) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'guild' || key === 'char_class' ? 'asc' : 'desc')
    }
  }

  function SortTh({ label, col }: { label: string; col: SortKey }) {
    const active = !useDefaultSort && sortKey === col
    return (
      <th
        onClick={() => toggleSort(col)}
        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
        title="Clique para ordenar"
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {label}
          <ArrowUpDown size={12} style={{ opacity: active ? 1 : 0.35 }} />
          {active && <span style={{ fontSize: 10, color: 'var(--accent)' }}>{sortDir === 'desc' ? '↓' : '↑'}</span>}
        </span>
      </th>
    )
  }

  return (
    <>
      <div className="page-header">
        <h2>Membros</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {sorted.length} de {data?.total ?? 0} personagens
            {data ? ` · ${data.online_count} online` : ''}
          </span>
          <button className="btn btn-ghost" onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', pointerEvents: 'none',
              }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nick..."
                style={{
                  width: '100%', padding: '8px 10px 8px 32px',
                  background: 'var(--bg-700)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                }}
              />
            </div>

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

            <button
              type="button"
              className={onlineOnly ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => setOnlineOnly(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Filtrar apenas online"
            >
              {onlineOnly ? <Wifi size={14} /> : <WifiOff size={14} />}
              {onlineOnly ? 'Somente online' : 'Todos (online/off)'}
            </button>
          </div>
        </div>

        {error && (
          <div className="card" style={{
            marginBottom: 16, borderColor: 'rgba(229,62,62,0.4)',
            color: 'var(--red)', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {data?.errors && data.errors.length > 0 && (
          <div className="card" style={{ marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            Aviso ao buscar guildas:{' '}
            {data.errors.map(e => `${e.guilda} (${e.erro})`).join(' · ')}
          </div>
        )}

        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando membros ao vivo...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <SortTh label="Personagem" col="name" />
                  <SortTh label="Guilda" col="guild" />
                  <SortTh label="Classe" col="char_class" />
                  <SortTh label="Resets" col="resets" />
                  <SortTh label="Level" col="level" />
                  <SortTh label="Status" col="online" />
                  <SortTh label="No site" col="site_registered" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((m, i) => (
                  <tr key={`${m.guild}-${m.name}`}>
                    <td><span className="rank-pos">{i + 1}</span></td>
                    <td>
                      <Link to={`/perfil/${encodeURIComponent(m.name)}`} style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {m.name}
                      </Link>
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                        background: 'rgba(201,168,76,0.1)', color: 'var(--accent)',
                      }}>
                        {m.guild}
                      </span>
                    </td>
                    <td>
                      <span className={CLASS_COLORS[m.char_class] ?? ''}>{m.char_class || '—'}</span>
                    </td>
                    <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{m.resets}</td>
                    <td>{m.level}</td>
                    <td>
                      <span className={`badge ${m.online ? 'badge-online' : 'badge-pending'}`}>
                        {m.online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td>
                      {m.site_registered ? (
                        <span className="badge badge-member" title={m.site_role ?? ''}>Sim</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Não</span>
                      )}
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                      Nenhum personagem encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
