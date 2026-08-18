import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { api, type AllianceStats } from '../lib/api'

const CLASS_COLORS: Record<string, string> = {
  'ELF': 'class-me',
  'BK': 'class-bk',
  'DL': 'class-dl',
  'MG': 'class-mg',
  'SM': 'class-sm',
}

const CLASS_LABELS: Record<string, string> = {
  'ELF': 'Elf',
  'BK': 'Blade Knight',
  'DL': 'Dark Lord',
  'MG': 'Magic Gladiator',
  'SM': 'Soul Master',
}

export function Dashboard() {
  const [stats, setStats] = useState<AllianceStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const s = await api.getStats()
      setStats(s)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await api.refresh()
    await load()
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <button className="btn btn-ghost" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Atualizando...' : 'Atualizar dados'}
        </button>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando dados...</div>
        ) : stats ? (
          <>
            {/* Stat cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Total de Membros</div>
                <div className="stat-value">{stats.total_members}</div>
                <div className="stat-sub">Membros aprovados</div>
              </div>
              {Object.entries(stats.class_distribution)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([cls, count]) => (
                  <div className="stat-card" key={cls}>
                    <div className="stat-label">{CLASS_LABELS[cls] ?? cls}</div>
                    <div className="stat-value">{count}</div>
                    <div className="stat-sub">
                      {Math.round((count / Math.max(stats.total_members, 1)) * 100)}% dos membros
                    </div>
                  </div>
                ))}
            </div>

            {/* Distribuição de classes */}
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <span className="card-title">Distribuição de Classes</span>
                <Link to="/membros" style={{ fontSize: 12, color: 'var(--accent)' }}>
                  Ver membros →
                </Link>
              </div>
              {Object.entries(stats.class_distribution)
                .sort(([, a], [, b]) => b - a)
                .map(([cls, count]) => {
                  const pct = Math.round((count / Math.max(stats.total_members, 1)) * 100)
                  return (
                    <div key={cls} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className={CLASS_COLORS[cls] ?? ''} style={{ fontWeight: 600, fontSize: 13 }}>
                          {CLASS_LABELS[cls] ?? cls}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div style={{
                        height: 4, background: 'var(--bg-600)', borderRadius: 2, overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: 'var(--accent)', borderRadius: 2,
                          transition: 'width 0.5s ease'
                        }} />
                      </div>
                    </div>
                  )
                })}
            </div>

            {stats.last_updated && (
              <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                Última atualização: {new Date(stats.last_updated).toLocaleString('pt-BR')}
              </p>
            )}
          </>
        ) : (
          <div className="loading">Backend offline. Inicie o servidor Python.</div>
        )}
      </div>
    </>
  )
}
