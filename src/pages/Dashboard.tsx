import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { api, type AllianceStats, type AllianceData } from '../lib/api'

function classColor(cls: string) {
  const map: Record<string, string> = {
    'Blade Knight': 'class-bk',
    'Soul Master': 'class-sm',
    'Muse Elf': 'class-me',
    'Dark Lord': 'class-dl',
    'Magic Gladiator': 'class-mg',
    'Dark Wizard': 'class-dw',
    'Fairy Elf': 'class-me',
  }
  return map[cls] ?? ''
}

function guildColor(name: string) {
  const map: Record<string, string> = {
    Euphoria: 'guild-euphoria',
    Euphor1a: 'guild-euphor1a',
    Jackson5: 'guild-jackson5',
    HellBoyz: 'guild-hellboyz',
  }
  return map[name] ?? ''
}

export function Dashboard() {
  const [stats, setStats] = useState<AllianceStats | null>(null)
  const [alliance, setAlliance] = useState<AllianceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [s, a] = await Promise.all([api.getStats(), api.getAlliance()])
      setStats(s)
      setAlliance(a)
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
        ) : stats && alliance ? (
          <>
            {/* Stat cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Total de Membros</div>
                <div className="stat-value">{stats.total_members}</div>
                <div className="stat-sub">{alliance.guilds.length} guildas</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Resets Totais</div>
                <div className="stat-value">{stats.total_resets.toLocaleString('pt-BR')}</div>
                <div className="stat-sub">Soma de todos os membros</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Média de Resets</div>
                <div className="stat-value">{stats.avg_resets}</div>
                <div className="stat-sub">Por membro</div>
              </div>
              {stats.top10_resets[0] && (
                <div className="stat-card">
                  <div className="stat-label">Top Reset</div>
                  <div className="stat-value" style={{ fontSize: 20 }}>
                    {stats.top10_resets[0].name}
                  </div>
                  <div className="stat-sub">
                    {stats.top10_resets[0].resets} resets ·{' '}
                    <span className={guildColor(stats.top10_resets[0].guild)}>
                      {stats.top10_resets[0].guild}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Distribuição de guildas + Top 10 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* Distribuição por guilda */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Membros por Guilda</span>
                </div>
                {Object.entries(stats.guild_distribution)
                  .sort(([, a], [, b]) => b - a)
                  .map(([guild, count]) => {
                    const pct = Math.round((count / stats.total_members) * 100)
                    return (
                      <div key={guild} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Link to={`/guilda/${guild}`} className={`guild-link ${guildColor(guild)}`}
                            style={{ fontWeight: 600, fontSize: 13 }}>
                            {guild}
                          </Link>
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

              {/* Distribuição por classe */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Distribuição de Classes</span>
                </div>
                {Object.entries(stats.class_distribution)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cls, count]) => {
                    const pct = Math.round((count / stats.total_members) * 100)
                    return (
                      <div key={cls} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                        borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                        <span className={classColor(cls)}>{cls}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{count} ({pct}%)</span>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* Top 10 Resets */}
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <span className="card-title">Top 10 Resets</span>
                <Link to="/rankings" style={{ fontSize: 12, color: 'var(--accent)' }}>
                  Ver todos →
                </Link>
              </div>
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
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top10_resets.map((m, i) => (
                      <tr key={m.name}>
                        <td>
                          <span className={`rank-pos ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>
                            {i + 1}
                          </span>
                        </td>
                        <td>
                          <Link to={`/perfil/${m.name}`} style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                            {m.name}
                          </Link>
                        </td>
                        <td className={classColor(m.char_class)}>{m.char_class}</td>
                        <td className={guildColor(m.guild)}>{m.guild}</td>
                        <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{m.resets}</td>
                        <td>{m.level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
