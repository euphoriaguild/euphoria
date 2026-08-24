import { useEffect, useState } from 'react'
import { RefreshCw, ClipboardCheck } from 'lucide-react'
import { api, type WorldBossReport } from '../lib/api'

const CLASS_COLORS: Record<string, string> = {
  'ELF': 'class-me',
  'BK': 'class-bk',
  'DL': 'class-dl',
  'MG': 'class-mg',
  'SM': 'class-sm',
}

const RANGE_OPTIONS = [
  { label: '7 dias', value: 7 },
  { label: '14 dias', value: 14 },
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
]

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function Presenca() {
  const [report, setReport] = useState<WorldBossReport | null>(null)
  const [days, setDays] = useState(14)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load(range: number) {
    setLoading(true)
    try {
      const data = await api.getWorldBossReport(range)
      setReport(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(days) }, [days])

  const members = (report?.members ?? []).filter(m =>
    m.nick_mudomix.toLowerCase().includes(search.trim().toLowerCase())
  )
  const reportDays = report?.days ?? []

  return (
    <>
      <div className="page-header">
        <h2>Presença — World Boss</h2>
        <button className="btn btn-ghost" onClick={() => load(days)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="page-body">
        {/* Filtros */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar membro..."
              style={{
                flex: 1, minWidth: 200, padding: '8px 10px', background: 'var(--bg-700)',
                border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 13, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              {RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={days === opt.value ? 'btn btn-primary' : 'btn btn-ghost'}
                  style={{ fontSize: 12 }}
                  onClick={() => setDays(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {report && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
              Período: {formatDay(report.range_start)} até {formatDay(report.range_end)} · {reportDays.length} dia{reportDays.length !== 1 ? 's' : ''} com boss registrado
            </div>
          )}
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : !report || reportDays.length === 0 || members.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <ClipboardCheck size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Nenhum check-in registrado no período selecionado.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Membro</th>
                  <th>Classe</th>
                  <th>Presenças</th>
                  {reportDays.map(day => (
                    <th key={day} style={{ textAlign: 'center', padding: '10px 6px' }}>
                      {formatDay(day)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.nick_mudomix}>
                    <td><span className="rank-pos">{i + 1}</span></td>
                    <td style={{ fontWeight: 600 }}>{m.nick_mudomix}</td>
                    <td>
                      <span className={CLASS_COLORS[m.char_class] ?? ''}>{m.char_class || '—'}</span>
                    </td>
                    <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{m.total}</td>
                    {reportDays.map(day => {
                      const attended = m.attended_days.includes(day)
                      return (
                        <td key={day} style={{ textAlign: 'center', padding: '6px' }}>
                          <span
                            title={`${formatDay(day)} — ${attended ? 'presente' : 'ausente'}`}
                            style={{
                              display: 'inline-flex', width: 20, height: 20, borderRadius: 4, fontSize: 10,
                              alignItems: 'center', justifyContent: 'center',
                              background: attended ? 'rgba(72,187,120,0.2)' : 'var(--bg-700)',
                              color: attended ? '#48bb78' : 'var(--text-muted)',
                              border: attended ? '1px solid rgba(72,187,120,0.4)' : '1px solid var(--border)',
                            }}
                          >
                            {attended ? '✓' : ''}
                          </span>
                        </td>
                      )
                    })}
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
