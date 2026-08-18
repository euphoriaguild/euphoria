import { useEffect, useState } from 'react'
import { Search, Check, Edit2 } from 'lucide-react'
import { api, type DonationsData } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const CLASS_COLORS: Record<string, string> = {
  'ELF': 'class-me',
  'BK': 'class-bk',
  'DL': 'class-dl',
  'MG': 'class-mg',
  'SM': 'class-sm',
}

export function Donations() {
  const { isStaff } = useAuth()

  const [data, setData] = useState<DonationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingAmount, setEditingAmount] = useState(false)
  const [amountInput, setAmountInput] = useState('')
  const [busyNick, setBusyNick] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const d = await api.getDonations()
      setData(d)
      setAmountInput(d.weekly_amount)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function saveAmount() {
    if (!amountInput.trim()) return
    try {
      await api.setDonationConfig(amountInput.trim())
      setEditingAmount(false)
      await load()
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar valor')
    }
  }

  async function toggle(nick: string, paid: boolean) {
    setBusyNick(nick)
    // Atualização otimista
    setData(prev => prev ? {
      ...prev,
      members: prev.members.map(m => m.nick_mudomix === nick ? { ...m, paid } : m),
    } : prev)
    try {
      await api.toggleDonation(nick, paid)
    } catch (e: any) {
      alert(e?.message || 'Erro ao atualizar')
      await load()
    } finally {
      setBusyNick(null)
    }
  }

  const members = data?.members ?? []
  const filtered = members.filter(m => m.nick_mudomix.toLowerCase().includes(search.toLowerCase()))
  const paidCount = members.filter(m => m.paid).length

  const weekLabel = data?.week_start
    ? new Date(data.week_start + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : ''

  return (
    <>
      <div className="page-header">
        <h2>Doações de Zen</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Semana de {weekLabel}
        </span>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : data ? (
          <>
            {/* Card do valor + progresso */}
            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card">
                <div className="stat-label">Doação Semanal</div>
                {editingAmount ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                    <input
                      value={amountInput}
                      onChange={e => setAmountInput(e.target.value)}
                      placeholder="100kk"
                      style={{
                        width: 100, padding: '6px 8px', background: 'var(--bg-700)',
                        border: '1px solid var(--accent)', borderRadius: 6,
                        color: 'var(--text-primary)', fontSize: 18, fontWeight: 700,
                      }}
                    />
                    <button className="btn btn-primary" style={{ padding: '6px 10px' }} onClick={saveAmount}>
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="stat-value">{data.weekly_amount}</div>
                    {isStaff && (
                      <button className="btn btn-ghost" style={{ padding: '4px 6px' }}
                        onClick={() => setEditingAmount(true)}>
                        <Edit2 size={13} />
                      </button>
                    )}
                  </div>
                )}
                <div className="stat-sub">de zen por membro</div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Doaram esta semana</div>
                <div className="stat-value">{paidCount}/{members.length}</div>
                <div className="stat-sub">
                  {members.length ? Math.round((paidCount / members.length) * 100) : 0}% dos membros
                </div>
              </div>
            </div>

            {/* Busca */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ position: 'relative', maxWidth: 320 }}>
                <Search size={14} style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', pointerEvents: 'none'
                }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar membro..."
                  style={{
                    width: '100%', padding: '8px 10px 8px 32px',
                    background: 'var(--bg-700)', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Tabela */}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Membro</th>
                    <th>Classe</th>
                    <th>Status</th>
                    {isStaff && <th>Marcar</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, i) => (
                    <tr key={m.nick_mudomix} style={{ background: m.paid ? 'rgba(46,204,113,0.05)' : undefined }}>
                      <td style={{ color: 'var(--text-muted)', width: 40 }}>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{m.nick_mudomix}</td>
                      <td className={CLASS_COLORS[m.char_class] ?? ''}>{m.char_class || '—'}</td>
                      <td>
                        {m.paid ? (
                          <span className="badge" style={{ background: 'rgba(46,204,113,0.15)', color: 'var(--green)' }}>
                            ✓ Doou
                          </span>
                        ) : (
                          <span className="badge" style={{ background: 'rgba(229,62,62,0.12)', color: 'var(--red)' }}>
                            Pendente
                          </span>
                        )}
                      </td>
                      {isStaff && (
                        <td>
                          <div
                            onClick={() => busyNick !== m.nick_mudomix && toggle(m.nick_mudomix, !m.paid)}
                            style={{
                              width: 38, height: 22, borderRadius: 11, cursor: 'pointer',
                              transition: 'background 0.2s', display: 'inline-block',
                              background: m.paid ? 'var(--green)' : 'var(--bg-600)',
                              border: '1px solid var(--border)', position: 'relative',
                              opacity: busyNick === m.nick_mudomix ? 0.5 : 1,
                            }}
                          >
                            <div style={{
                              position: 'absolute', top: 3, left: m.paid ? 18 : 3,
                              width: 14, height: 14, borderRadius: '50%', background: '#fff',
                              transition: 'left 0.2s',
                            }} />
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!isStaff && (
              <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                Apenas a staff pode marcar quem doou.
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
