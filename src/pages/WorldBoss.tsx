import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, RefreshCw, Plus, Trash2 } from 'lucide-react'
import { api, type WorldBossToday, type WorldBossCheckin, type WorldBossParty } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const GUILD_COLORS: Record<string, string> = {
  Euphoria: 'guild-euphoria',
  Euphor1a: 'guild-euphor1a',
  Jackson5: 'guild-jackson5',
  HellBoyz: 'guild-hellboyz',
}

const SCHEDULE = [
  { day: 'Segunda',  boss: 'Phoenix',   emoji: '🔥', weekday: 0 },
  { day: 'Terça',    boss: 'Hell Maine', emoji: '🔮', weekday: 1 },
  { day: 'Quarta',   boss: 'Phoenix',   emoji: '🔥', weekday: 2 },
  { day: 'Quinta',   boss: 'Kayn',      emoji: '⚔️', weekday: 3 },
  { day: 'Sexta',    boss: null,        emoji: '😴', weekday: 4 },
  { day: 'Sábado',  boss: 'Hydra',     emoji: '🐍', weekday: 5 },
  { day: 'Domingo',  boss: 'Zaikan',    emoji: '💀', weekday: 6 },
]

function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function countdown(target: Date, now: Date): string {
  const diff = Math.max(0, target.getTime() - now.getTime())
  if (diff === 0) return '00:00:00'
  const h = Math.floor(diff / 3600000).toString().padStart(2, '0')
  const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0')
  const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

const UNASSIGNED = '__none__'

export function WorldBoss() {
  const { profile, isStaff } = useAuth()
  const now = useNow()

  const [todayInfo, setTodayInfo] = useState<WorldBossToday | null>(null)
  const [checkins, setCheckins] = useState<WorldBossCheckin[]>([])
  const [savedParties, setSavedParties] = useState<WorldBossParty[]>([])
  const [partyNames, setPartyNames] = useState<string[]>(['PT 1', 'PT 2', 'PT 3', 'PT 4'])
  const [assignments, setAssignments] = useState<Record<string, string>>({}) // nick → party name
  const [loading, setLoading] = useState(true)
  const [checkingIn, setCheckingIn] = useState(false)
  const [saving, setSaving] = useState(false)

  const myNick = profile?.nick_mudomix
  const myCheckedIn = checkins.some(c => c.nick_mudomix === myNick)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [info, cins, pts] = await Promise.all([
        api.getWorldBossToday(),
        api.getWorldBossCheckins(),
        api.getWorldBossParties(),
      ])
      setTodayInfo(info)
      setCheckins(cins)
      setSavedParties(pts.parties || [])

      // Reconstrói o map de assignments a partir das partys salvas
      if (pts.parties?.length) {
        const names = pts.parties.map((p: WorldBossParty) => p.name)
        setPartyNames(names)
        const map: Record<string, string> = {}
        for (const pt of pts.parties) {
          for (const m of pt.members) map[m] = pt.name
        }
        setAssignments(map)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCheckin() {
    setCheckingIn(true)
    try {
      const res = await api.worldBossCheckin()
      if (res.already_checked_in) {
        alert('Você já fez check-in hoje!')
      } else {
        const cins = await api.getWorldBossCheckins()
        setCheckins(cins)
      }
    } catch (e: any) {
      alert(e?.message || 'Erro ao fazer check-in')
    } finally {
      setCheckingIn(false)
    }
  }

  async function handleCancelCheckin() {
    if (!confirm('Cancelar seu check-in?')) return
    setCheckingIn(true)
    try {
      await api.worldBossCancelCheckin()
      const cins = await api.getWorldBossCheckins()
      setCheckins(cins)
    } catch (e: any) {
      alert(e?.message || 'Erro ao cancelar')
    } finally {
      setCheckingIn(false)
    }
  }

  async function handleSaveParties() {
    setSaving(true)
    try {
      const parties: WorldBossParty[] = partyNames.map(name => ({
        name,
        members: checkins
          .filter(c => assignments[c.nick_mudomix] === name)
          .map(c => c.nick_mudomix),
      }))
      await api.saveWorldBossParties(parties)
      setSavedParties(parties)
      alert('Partys salvas com sucesso!')
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const eventDate = todayInfo ? new Date(todayInfo.event_time) : null
  const cd = eventDate ? countdown(eventDate, now) : '--:--:--'
  const isNear = eventDate
    ? eventDate.getTime() - now.getTime() < 30 * 60 * 1000 && eventDate.getTime() > now.getTime()
    : false
  const isOver = eventDate ? now > eventDate : false

  // Agrupa partys salvas por coluna (para exibição)

  return (
    <>
      <div className="page-header">
        <h2>World Boss</h2>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : (
          <>
            {/* ── Boss do dia ── */}
            {todayInfo?.boss_name ? (
              <div className="card" style={{
                marginBottom: 16,
                borderColor: isNear ? 'rgba(229,62,62,0.5)' : 'var(--border-accent)',
                background: isNear ? 'rgba(229,62,62,0.04)' : 'rgba(201,168,76,0.03)',
              }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ fontSize: 56 }}>{todayInfo.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase',
                      letterSpacing: 2, marginBottom: 4 }}>
                      Boss de hoje — 20:30
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900,
                      color: 'var(--accent)', marginBottom: 8 }}>
                      {todayInfo.boss_name}
                    </div>

                    {/* Countdown */}
                    {!isOver ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Começa em:</span>
                        <span style={{
                          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
                          color: isNear ? 'var(--red)' : 'var(--text-primary)', letterSpacing: 3,
                        }}>{cd}</span>
                        {isNear && <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: 12 }}>⚠️ QUASE NA HORA!</span>}
                      </div>
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Boss já iniciou hoje às 20:30.</span>
                    )}
                  </div>

                  {/* Check-in */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    {todayInfo.checkin_open ? (
                      myCheckedIn ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                            color: 'var(--green)', fontWeight: 700, fontSize: 14 }}>
                            <CheckCircle size={18} /> Check-in confirmado!
                          </div>
                          <button className="btn btn-ghost" style={{ fontSize: 12 }}
                            onClick={handleCancelCheckin} disabled={checkingIn}>
                            Cancelar presença
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-primary" style={{ padding: '12px 28px', fontSize: 15 }}
                          onClick={handleCheckin} disabled={checkingIn}>
                          {checkingIn ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Registrando…</> : '✅ Confirmar Presença'}
                        </button>
                      )
                    ) : (
                      <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                        Check-in encerrado<br />
                        <span style={{ fontSize: 11 }}>(abre meia-noite de cada dia)</span>
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {checkins.length} confirmado{checkins.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: '40px 24px', marginBottom: 16 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>😴</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700,
                  color: 'var(--text-secondary)' }}>
                  Sexta-feira — Dia de Descanso
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                  Não há World Boss hoje. Aproveite para descansar!
                </div>
              </div>
            )}

            {/* ── Escala semanal ── */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <span className="card-title">Escala Semanal — 20:30</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                {SCHEDULE.map(s => {
                  const isToday = todayInfo?.weekday === s.weekday
                  return (
                    <div key={s.day} style={{
                      textAlign: 'center', padding: '10px 4px', borderRadius: 8,
                      background: isToday ? 'rgba(201,168,76,0.1)' : 'var(--bg-700)',
                      border: `1px solid ${isToday ? 'var(--border-accent)' : 'var(--border)'}`,
                    }}>
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{s.emoji}</div>
                      <div style={{ fontSize: 11, fontWeight: 700,
                        color: isToday ? 'var(--accent)' : 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {s.day}
                      </div>
                      <div style={{ fontSize: 11, color: s.boss ? 'var(--text-secondary)' : 'var(--text-muted)',
                        marginTop: 2, fontWeight: s.boss ? 600 : 400 }}>
                        {s.boss ?? 'Off'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Lista de confirmados ── */}
            {checkins.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <span className="card-title">Confirmados para hoje ({checkins.length})</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Personagem</th>
                        <th>Guilda</th>
                        <th>Confirmado às</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkins.map((c, i) => (
                        <tr key={c.id} style={{ background: c.nick_mudomix === myNick ? 'rgba(201,168,76,0.05)' : undefined }}>
                          <td style={{ color: 'var(--text-muted)', width: 40 }}>{i + 1}</td>
                          <td style={{ fontWeight: c.nick_mudomix === myNick ? 700 : 500,
                            color: c.nick_mudomix === myNick ? 'var(--accent)' : 'var(--text-primary)' }}>
                            {c.nick_mudomix}
                            {c.nick_mudomix === myNick && (
                              <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--accent)',
                                background: 'rgba(201,168,76,0.15)', padding: '1px 6px', borderRadius: 4 }}>
                                você
                              </span>
                            )}
                          </td>
                          <td className={GUILD_COLORS[c.guild ?? ''] ?? ''}>{c.guild ?? '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Partys montadas (visível a todos) ── */}
            {savedParties.length > 0 && savedParties.some(p => p.members.length > 0) && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <span className="card-title">Partys Montadas</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  {savedParties.filter(p => p.members.length > 0).map(pt => (
                    <div key={pt.name} className="card" style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8,
                        fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                        ⚔️ {pt.name}
                      </div>
                      {pt.members.map((m, i) => {
                        const ci = checkins.find(c => c.nick_mudomix === m)
                        return (
                          <div key={m} style={{ fontSize: 12, padding: '3px 0',
                            color: 'var(--text-secondary)', display: 'flex', gap: 6 }}>
                            <span style={{ color: 'var(--text-muted)', minWidth: 16 }}>{i + 1}.</span>
                            <span style={{ fontWeight: 500 }}>{m}</span>
                            {ci?.guild && (
                              <span className={GUILD_COLORS[ci.guild] ?? ''} style={{ fontSize: 10 }}>
                                {ci.guild}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Admin: Montar Partys ── */}
            {isStaff && checkins.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">⚙️ Montar Partys (Staff)</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => {
                        const name = `PT ${partyNames.length + 1}`
                        setPartyNames(prev => [...prev, name])
                      }}>
                      <Plus size={12} /> Adicionar PT
                    </button>
                    <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 16px' }}
                      onClick={handleSaveParties} disabled={saving}>
                      {saving ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Salvando…</> : 'Salvar Partys'}
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                  Selecione a party de cada membro confirmado. Membros sem party ficam como "Não alocado".
                </p>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Personagem</th>
                        <th>Guilda</th>
                        <th style={{ minWidth: 150 }}>Party</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkins.map(c => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 500 }}>{c.nick_mudomix}</td>
                          <td className={GUILD_COLORS[c.guild ?? ''] ?? ''}>{c.guild ?? '—'}</td>
                          <td>
                            <select
                              value={assignments[c.nick_mudomix] ?? UNASSIGNED}
                              onChange={e => {
                                const val = e.target.value
                                setAssignments(prev => ({
                                  ...prev,
                                  [c.nick_mudomix]: val === UNASSIGNED ? '' : val,
                                }))
                              }}
                              style={{
                                padding: '5px 10px', background: 'var(--bg-600)',
                                border: '1px solid var(--border)', borderRadius: 6,
                                color: assignments[c.nick_mudomix] ? 'var(--accent)' : 'var(--text-muted)',
                                fontSize: 13, cursor: 'pointer',
                              }}
                            >
                              <option value={UNASSIGNED}>— Não alocado —</option>
                              {partyNames.map(name => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Preview das partys */}
                <div style={{ marginTop: 16, display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                  {partyNames.map(name => {
                    const members = checkins.filter(c => assignments[c.nick_mudomix] === name)
                    return (
                      <div key={name} style={{
                        padding: '10px 12px', background: 'var(--bg-700)',
                        border: '1px solid var(--border)', borderRadius: 8,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent)' }}>{name}</span>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{members.length}p</span>
                            <button
                              onClick={() => {
                                if (!confirm(`Remover ${name}?`)) return
                                setPartyNames(prev => prev.filter(n => n !== name))
                                setAssignments(prev => {
                                  const copy = { ...prev }
                                  for (const k in copy) if (copy[k] === name) copy[k] = ''
                                  return copy
                                })
                              }}
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
                                cursor: 'pointer', display: 'flex', padding: 2 }}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                        {members.length === 0 ? (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Vazia</div>
                        ) : (
                          members.map(m => (
                            <div key={m.nick_mudomix} style={{ fontSize: 11, color: 'var(--text-secondary)',
                              padding: '1px 0' }}>
                              {m.nick_mudomix}
                            </div>
                          ))
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

// ─── Invasões ────────────────────────────────────────────────────────────────

const INVASIONS = [
  { name: 'Invasão Kundun',       hours: [[2,0],[8,0],[14,0],[20,0]] as [number,number][] },
  { name: 'Invasão Erohim',       hours: [[1,0],[7,0],[13,0],[19,0]] as [number,number][] },
  { name: 'Invasão White Wizard', hours: [[0,30],[6,30],[12,30],[18,30]] as [number,number][] },
]

function nextTime(hours: [number, number][], now: Date): Date {
  for (const [h, m] of hours) {
    const t = new Date(now); t.setHours(h, m, 0, 0)
    if (t > now) return t
  }
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(hours[0][0], hours[0][1], 0, 0)
  return tomorrow
}

function countdownStr(target: Date, now: Date): string {
  const diff = Math.max(0, target.getTime() - now.getTime())
  const h = Math.floor(diff / 3600000).toString().padStart(2,'0')
  const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2,'0')
  const s = Math.floor((diff % 60000) / 1000).toString().padStart(2,'0')
  return `${h}:${m}:${s}`
}

function useNowInvasion() {
  const [n, setN] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setN(new Date()), 1000); return () => clearInterval(id) }, [])
  return n
}

export function Invasions() {
  const now = useNowInvasion()
  return (
    <>
      <div className="page-header"><h2>Invasões</h2></div>
      <div className="page-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {INVASIONS.map(inv => {
            const next = nextTime(inv.hours, now)
            const cd = countdownStr(next, now)
            const isNear = next.getTime() - now.getTime() < 10 * 60 * 1000
            return (
              <div key={inv.name} className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{inv.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Horários: {inv.hours.map(([h,m]) => `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`).join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700,
                    color: isNear ? 'var(--red)' : 'var(--accent)', letterSpacing: 2 }}>
                    {cd}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    às {next.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text-muted)',
          background: 'var(--bg-700)', padding: '10px 14px', borderRadius: 6 }}>
          ℹ️ Os horários de invasão são aproximados. Confirme sempre no canal de avisos do Discord.
        </p>
      </div>
    </>
  )
}
