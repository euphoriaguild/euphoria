import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { api, type LiveMembersData } from '../lib/api'

const BAR_ACCENT = '#c9a84c'
const BAR_ONLINE = '#4caf7a'
const BAR_OFFLINE = '#6b7280'
const BAR_SITE = '#5b8def'
const BAR_GUILD = ['#c9a84c', '#5b8def', '#9b6bff']

function distToBars(dist: Record<string, number>) {
  return Object.entries(dist)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

export function Dashboard() {
  const [data, setData] = useState<LiveMembersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const live = await api.getMembersLive()
      setData(live)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Falha ao carregar dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await load()
  }

  useEffect(() => { load() }, [])

  const classBars = useMemo(() => distToBars(data?.class_distribution ?? {}), [data])
  const guildBars = useMemo(() => distToBars(data?.guild_distribution ?? {}), [data])
  const presenceBars = useMemo(() => {
    if (!data) return []
    return [
      { name: 'Online', value: data.online_count },
      { name: 'Offline', value: data.offline_count },
    ]
  }, [data])
  const siteBars = useMemo(() => {
    if (!data) return []
    return [
      { name: 'No site', value: data.site_registered_count },
      { name: 'Só no jogo', value: Math.max(0, data.total - data.site_registered_count) },
    ]
  }, [data])

  const onlinePct = data && data.total
    ? Math.round((data.online_count / data.total) * 100)
    : 0
  const sitePct = data && data.total
    ? Math.round((data.site_registered_count / data.total) * 100)
    : 0

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <button className="btn btn-ghost" onClick={handleRefresh} disabled={refreshing || loading}>
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Atualizando...' : 'Atualizar dados'}
        </button>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando dados ao vivo...</div>
        ) : error ? (
          <div className="card" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>
        ) : data ? (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Personagens</div>
                <div className="stat-value">{data.total}</div>
                <div className="stat-sub">Euphoria + Euph0ria + Euphor1a</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Online agora</div>
                <div className="stat-value" style={{ color: 'var(--green)' }}>{data.online_count}</div>
                <div className="stat-sub">{onlinePct}% da aliança</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Cadastrados no site</div>
                <div className="stat-value">{data.site_registered_count}</div>
                <div className="stat-sub">{sitePct}% com acesso</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Offline</div>
                <div className="stat-value">{data.offline_count}</div>
                <div className="stat-sub">
                  <Link to="/membros" style={{ color: 'var(--accent)' }}>Ver membros →</Link>
                </div>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
              marginTop: 16,
            }}>
              <HBarCard
                title="Distribuição por classe"
                data={classBars}
                color={BAR_ACCENT}
                height={Math.max(220, classBars.length * 28)}
              />
              <HBarCard
                title="Personagens por guilda"
                data={guildBars}
                colors={BAR_GUILD}
                height={220}
              />
              <HBarCard
                title="Presença (online × offline)"
                data={presenceBars}
                colors={[BAR_ONLINE, BAR_OFFLINE]}
                height={200}
              />
              <HBarCard
                title="Cadastro no site"
                data={siteBars}
                colors={[BAR_SITE, BAR_OFFLINE]}
                height={200}
              />
            </div>

            {data.errors?.length > 0 && (
              <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                Avisos: {data.errors.map(e => `${e.guilda} (${e.erro})`).join(' · ')}
              </p>
            )}
          </>
        ) : (
          <div className="loading">Sem dados. Verifique a API MU Domix.</div>
        )}
      </div>
    </>
  )
}

function HBarCard({
  title,
  data,
  color,
  colors,
  height,
}: {
  title: string
  data: { name: string; value: number }[]
  color?: string
  colors?: string[]
  height: number
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="card-header" style={{ marginBottom: 8, padding: 0, border: 'none' }}>
        <span className="card-title">{title}</span>
      </div>
      {data.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>
          Sem dados
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(201,168,76,0.08)' }}
              contentStyle={{
                background: 'var(--bg-800)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={colors ? colors[i % colors.length] : (color ?? BAR_ACCENT)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
