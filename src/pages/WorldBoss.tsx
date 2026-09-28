import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, RefreshCw, Plus, Trash2 } from 'lucide-react'
import {
  api, type WorldBossToday, type WorldBossCheckin, type WorldBossParty, type WorldBossSlot, type WorldBossSlotRef,
} from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const CLASS_COLORS: Record<string, string> = {
  'ELF': 'class-me',
  'BK': 'class-bk',
  'DL': 'class-dl',
  'MG': 'class-mg',
  'SM': 'class-sm',
}

const BOSS_INFO: Record<string, { emoji: string; map: string; mapImage: string }> = {
  'Phoenix':    { emoji: '🔥', map: 'LOST TOWER 1 (covil)', mapImage: '/world-boss/phoenix-losttower.png' },
  'Hell Maine': { emoji: '🔮', map: 'AIDA',                 mapImage: '/world-boss/hellmaine-aida.png' },
  'Kayn':       { emoji: '⚔️', map: 'LOST TOWER 1',         mapImage: '/world-boss/kayn-losttower.png' },
  'Hydra':      { emoji: '🐍', map: 'ATLANS',               mapImage: '/world-boss/hydra-atlans.png' },
  'Zaikan':     { emoji: '💀', map: 'TARKAN',               mapImage: '/world-boss/zaikan-tarkan.png' },
}

const WEEKEND_SLOTS = [
  { time: '00:00', boss: 'Zaikan' },
  { time: '08:00', boss: 'Hydra' },
  { time: '16:00', boss: 'Kayn' },
]

const SCHEDULE: { day: string; weekday: number; rest?: string; restEmoji?: string; slots: { time: string; boss: string }[] }[] = [
  { day: 'Segunda', weekday: 0, slots: [{ time: '20:30', boss: 'Phoenix' }] },
  { day: 'Terça',   weekday: 1, slots: [{ time: '20:30', boss: 'Hell Maine' }] },
  { day: 'Quarta',  weekday: 2, slots: [{ time: '20:30', boss: 'Phoenix' }] },
  { day: 'Quinta',  weekday: 3, rest: 'PvP dos Admins', restEmoji: '⚔️', slots: [] },
  { day: 'Sexta',   weekday: 4, rest: 'Descanso', restEmoji: '😴', slots: [] },
  { day: 'Sábado',  weekday: 5, slots: WEEKEND_SLOTS },
  { day: 'Domingo', weekday: 6, slots: WEEKEND_SLOTS },
]

const DAY_FULL = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
const DAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const BRT = 'America/Sao_Paulo'

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: BRT })
}

function fmtDayTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: BRT })
  return `${date} às ${fmtTime(iso)}`
}

function sameSlot(a: WorldBossSlotRef | null, b: WorldBossSlotRef | null): boolean {
  return !!a && !!b && a.boss_date === b.boss_date && a.boss_name === b.boss_name
}

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

export function WorldBoss() {
  const { profile, isStaff } = useAuth()
  const now = useNow()

  const [todayInfo, setTodayInfo] = useState<WorldBossToday | null>(null)
  const [selectedRef, setSelectedRef] = useState<WorldBossSlotRef | null>(null)
  const [checkins, setCheckins] = useState<WorldBossCheckin[]>([])
  const [savedParties, setSavedParties] = useState<WorldBossParty[]>([])
  const [partyNames, setPartyNames] = useState<string[]>(['PT 1', 'PT 2', 'PT 3', 'PT 4'])
  const [assignments, setAssignments] = useState<Record<string, string>>({}) // nick → party name
  const [loading, setLoading] = useState(true)
  const [checkingIn, setCheckingIn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draggedNick, setDraggedNick] = useState<string | null>(null)
  const [dragOverParty, setDragOverParty] = useState<string | null>(null)
  const [mapModal, setMapModal] = useState<{ title: string; src: string } | null>(null)

  const myNick = profile?.nick_mudomix
  const myCheckedIn = checkins.some(c => c.nick_mudomix === myNick)
  const slot: WorldBossSlot | null =
    todayInfo?.slots.find(s => sameSlot(s, selectedRef)) ?? todayInfo ?? null
  const slotRef: WorldBossSlotRef | null = slot ? { boss_date: slot.boss_date, boss_name: slot.boss_name } : null
  const slotInfo = slot ? BOSS_INFO[slot.boss_name] : undefined
  const slotLabel = slot ? `${slot.boss_name} (${DAY_SHORT[slot.weekday]} ${fmtTime(slot.event_time)})` : ''

  function openMapModal(boss: string | null, map: string | null, mapImage: string | null) {
    if (!mapImage || !map) return
    setMapModal({
      title: boss ? `${boss} — ${map}` : map,
      src: mapImage,
    })
  }

  const loadSlot = useCallback(async (ref: WorldBossSlotRef) => {
    const [cins, pts] = await Promise.all([
      api.getWorldBossCheckins(ref),
      api.getWorldBossParties(ref),
    ])
    setCheckins(cins)
    setSavedParties(pts.parties || [])

    // Reconstrói o map de assignments a partir das partys salvas
    const map: Record<string, string> = {}
    if (pts.parties?.length) {
      setPartyNames(pts.parties.map((p: WorldBossParty) => p.name))
      for (const pt of pts.parties) {
        for (const m of pt.members) map[m] = pt.name
      }
    } else {
      setPartyNames(['PT 1', 'PT 2', 'PT 3', 'PT 4'])
    }
    setAssignments(map)
  }, [])

  const load = useCallback(async (keepRef?: WorldBossSlotRef | null) => {
    setLoading(true)
    try {
      const info = await api.getWorldBossToday()
      setTodayInfo(info)
      const kept = keepRef ? info.slots.find(s => sameSlot(s, keepRef)) : undefined
      const ref = kept ?? info
      setSelectedRef({ boss_date: ref.boss_date, boss_name: ref.boss_name })
      await loadSlot({ boss_date: ref.boss_date, boss_name: ref.boss_name })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [loadSlot])

  useEffect(() => { load() }, [load])

  async function selectSlot(ref: WorldBossSlotRef) {
    if (sameSlot(ref, selectedRef)) return
    setSelectedRef(ref)
    setLoading(true)
    try {
      await loadSlot(ref)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!mapModal) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMapModal(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mapModal])

  async function handleCheckin() {
    if (!slotRef) return
    setCheckingIn(true)
    try {
      const res = await api.worldBossCheckin(slotRef)
      if (res.already_checked_in) {
        alert('Você já fez check-in para este boss!')
      } else {
        const cins = await api.getWorldBossCheckins(slotRef)
        setCheckins(cins)
      }
    } catch (e: any) {
      alert(e?.message || 'Erro ao fazer check-in')
    } finally {
      setCheckingIn(false)
    }
  }

  async function handleCancelCheckin() {
    if (!slotRef || !confirm('Cancelar seu check-in?')) return
    setCheckingIn(true)
    try {
      await api.worldBossCancelCheckin(slotRef)
      const cins = await api.getWorldBossCheckins(slotRef)
      setCheckins(cins)
    } catch (e: any) {
      alert(e?.message || 'Erro ao cancelar')
    } finally {
      setCheckingIn(false)
    }
  }

  async function handleSaveParties() {
    if (!slotRef) return
    setSaving(true)
    try {
      const parties: WorldBossParty[] = partyNames.map(name => ({
        name,
        members: checkins
          .filter(c => assignments[c.nick_mudomix] === name)
          .map(c => c.nick_mudomix),
      }))
      await api.saveWorldBossParties(slotRef, parties)
      setSavedParties(parties)
      alert('Partys salvas com sucesso!')
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // Atribui o membro arrastado a uma party (ou "" = pool não alocado)
  function assignTo(nick: string, party: string) {
    setAssignments(prev => ({ ...prev, [nick]: party }))
  }

  function handleDrop(party: string) {
    if (draggedNick) assignTo(draggedNick, party)
    setDraggedNick(null)
    setDragOverParty(null)
  }

  const eventDate = slot ? new Date(slot.event_time) : null
  const opensDate = slot ? new Date(slot.checkin_opens_at) : null
  const checkinOpen = !!eventDate && !!opensDate && now >= opensDate && now < eventDate
  const cd = eventDate ? countdown(eventDate, now) : '--:--:--'
  const isNear = eventDate
    ? eventDate.getTime() - now.getTime() < 30 * 60 * 1000 && eventDate.getTime() > now.getTime()
    : false
  const isOver = eventDate ? now > eventDate : false

  const restDay = todayInfo?.rest_reason ? SCHEDULE[todayInfo.today_weekday] : undefined

  return (
    <>
      <div className="page-header">
        <h2>World Boss</h2>
        <button className="btn btn-ghost" onClick={() => load(selectedRef)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : (
          <>
            {/* ── Dia sem boss ── */}
            {restDay && todayInfo && (
              <div className="card" style={{ textAlign: 'center', padding: '24px', marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 6 }}>{restDay.restEmoji}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700,
                  color: 'var(--text-secondary)' }}>
                  {DAY_FULL[todayInfo.today_weekday]} — {restDay.rest}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                  Não há World Boss hoje. Confira abaixo o próximo boss.
                </div>
              </div>
            )}

            {/* ── Seleção de boss (dia com mais de um boss ou próximo boss) ── */}
            {todayInfo && todayInfo.slots.length > 1 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {todayInfo.slots.map(s => {
                  const active = sameSlot(s, slotRef)
                  const open = now >= new Date(s.checkin_opens_at) && now < new Date(s.event_time)
                  return (
                    <button
                      key={`${s.boss_date}|${s.boss_name}`}
                      type="button"
                      className={active ? 'btn btn-primary' : 'btn btn-ghost'}
                      style={{ fontSize: 12, padding: '6px 12px' }}
                      onClick={() => selectSlot({ boss_date: s.boss_date, boss_name: s.boss_name })}
                    >
                      {s.emoji} {DAY_SHORT[s.weekday]} {fmtTime(s.event_time)} — {s.boss_name}
                      {open && <span style={{ marginLeft: 6, fontSize: 10 }}>● check-in aberto</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── Boss selecionado ── */}
            {slot && todayInfo && (
              <div className="card" style={{
                marginBottom: 16,
                borderColor: isNear ? 'rgba(229,62,62,0.5)' : 'var(--border-accent)',
                background: isNear ? 'rgba(229,62,62,0.04)' : 'rgba(201,168,76,0.03)',
              }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ fontSize: 56 }}>{slot.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase',
                      letterSpacing: 2, marginBottom: 4 }}>
                      {slot.boss_date === todayInfo.server_now.slice(0, 10) ? 'Boss de hoje' : 'Próximo boss'}
                      {' — '}{DAY_FULL[slot.weekday]} {fmtTime(slot.event_time)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900,
                      color: 'var(--accent)', marginBottom: slotInfo ? 4 : 8 }}>
                      {slot.boss_name}
                    </div>
                    {slotInfo && (
                      <button
                        type="button"
                        onClick={() => openMapModal(slot.boss_name, slotInfo.map, slotInfo.mapImage)}
                        style={{
                          display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8,
                          background: 'none', border: 'none', padding: 0,
                          cursor: 'pointer',
                          textDecoration: 'none', textAlign: 'left',
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                      >
                        Mapa: {slotInfo.map}
                      </button>
                    )}

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
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        Boss iniciado em {fmtDayTime(slot.event_time)}.
                      </span>
                    )}
                  </div>

                  {/* Check-in */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    {checkinOpen ? (
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
                        {isOver ? (
                          'Check-in encerrado'
                        ) : (
                          <>
                            Check-in ainda não abriu<br />
                            <span style={{ fontSize: 11 }}>
                              (abre {opensDate ? fmtDayTime(opensDate.toISOString()) : ''})
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {checkins.length} confirmado{checkins.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Escala semanal ── */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <span className="card-title">Escala Semanal (horário de Brasília)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                {SCHEDULE.map(s => {
                  const isToday = todayInfo?.today_weekday === s.weekday
                  return (
                    <div key={s.day} style={{
                      textAlign: 'center', padding: '10px 4px', borderRadius: 8,
                      background: isToday ? 'rgba(201,168,76,0.1)' : 'var(--bg-700)',
                      border: `1px solid ${isToday ? 'var(--border-accent)' : 'var(--border)'}`,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6,
                        color: isToday ? 'var(--accent)' : 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {s.day}
                      </div>
                      {s.slots.length === 0 ? (
                        <>
                          <div style={{ fontSize: 18, marginBottom: 4 }}>{s.restEmoji}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.rest}</div>
                        </>
                      ) : (
                        s.slots.map(sl => {
                          const info = BOSS_INFO[sl.boss]
                          return (
                            <div key={sl.time} style={{ marginBottom: 6 }}>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                                {info?.emoji} {sl.time}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                                {sl.boss}
                              </div>
                              {info && (
                                <button
                                  type="button"
                                  onClick={() => openMapModal(sl.boss, info.map, info.mapImage)}
                                  style={{
                                    display: 'block', width: '100%', fontSize: 10, color: 'var(--text-muted)',
                                    marginTop: 2, lineHeight: 1.3, background: 'none', border: 'none',
                                    padding: 0, cursor: 'pointer',
                                    textDecoration: 'none', transition: 'color 0.15s',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)' }}
                                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                                >
                                  {info.map}
                                </button>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Lista de confirmados ── */}
            {checkins.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <span className="card-title">Confirmados — {slotLabel} ({checkins.length})</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Personagem</th>
                        <th>Classe</th>
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
                          <td className={CLASS_COLORS[c.char_class ?? ''] ?? ''}>{c.char_class ?? '—'}</td>
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
                  <span className="card-title">Partys Montadas — {slotLabel}</span>
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
                            {ci?.char_class && (
                              <span className={CLASS_COLORS[ci.char_class] ?? ''} style={{ fontSize: 10 }}>
                                {ci.char_class}
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
                  <span className="card-title">⚙️ Montar Partys (Staff) — {slotLabel}</span>
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
                  Arraste 🖱️ cada membro para a party desejada. Solte na caixa "Não alocados" para remover de uma PT.
                </p>

                {(() => {
                  // Renderiza um chip arrastável de membro
                  const Chip = ({ c }: { c: WorldBossCheckin }) => (
                    <div
                      draggable
                      onDragStart={() => setDraggedNick(c.nick_mudomix)}
                      onDragEnd={() => { setDraggedNick(null); setDragOverParty(null) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px', marginBottom: 6, borderRadius: 6,
                        background: 'var(--bg-600)', border: '1px solid var(--border)',
                        cursor: 'grab', fontSize: 12,
                        opacity: draggedNick === c.nick_mudomix ? 0.4 : 1,
                        userSelect: 'none',
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>⋮⋮</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.nick_mudomix}</span>
                      {c.char_class && (
                        <span className={CLASS_COLORS[c.char_class] ?? ''} style={{ fontSize: 10, marginLeft: 'auto' }}>
                          {c.char_class}
                        </span>
                      )}
                    </div>
                  )

                  const poolMembers = checkins.filter(c => !assignments[c.nick_mudomix])

                  // Caixa (drop zone) genérica
                  const DropBox = ({ party, title, children, isPool = false, onRemove }: {
                    party: string; title: string; children: React.ReactNode; isPool?: boolean; onRemove?: () => void
                  }) => (
                    <div
                      onDragOver={e => { e.preventDefault(); setDragOverParty(party) }}
                      onDragLeave={() => setDragOverParty(prev => prev === party ? null : prev)}
                      onDrop={() => handleDrop(party)}
                      style={{
                        padding: '10px 12px', borderRadius: 8, minHeight: 90,
                        background: dragOverParty === party ? 'rgba(201,168,76,0.10)' : 'var(--bg-700)',
                        border: `1.5px ${dragOverParty === party ? 'dashed var(--accent)' : 'solid var(--border)'}`,
                        transition: 'background 0.15s, border-color 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 12,
                          color: isPool ? 'var(--text-muted)' : 'var(--accent)' }}>
                          {title}
                        </span>
                        {onRemove && (
                          <button onClick={onRemove}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
                              cursor: 'pointer', display: 'flex', padding: 2 }}>
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                      {children}
                    </div>
                  )

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14, alignItems: 'start' }}>
                      {/* Pool de não alocados */}
                      <DropBox party="" title={`Não alocados (${poolMembers.length})`} isPool>
                        {poolMembers.length === 0 ? (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Todos alocados ✓</div>
                        ) : (
                          poolMembers.map(c => <Chip key={c.id} c={c} />)
                        )}
                      </DropBox>

                      {/* Partys */}
                      <div style={{ display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                        {partyNames.map(name => {
                          const members = checkins.filter(c => assignments[c.nick_mudomix] === name)
                          return (
                            <DropBox
                              key={name}
                              party={name}
                              title={`⚔️ ${name} (${members.length})`}
                              onRemove={() => {
                                if (!confirm(`Remover ${name}?`)) return
                                setPartyNames(prev => prev.filter(n => n !== name))
                                setAssignments(prev => {
                                  const copy = { ...prev }
                                  for (const k in copy) if (copy[k] === name) copy[k] = ''
                                  return copy
                                })
                              }}
                            >
                              {members.length === 0 ? (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  Arraste membros aqui
                                </div>
                              ) : (
                                members.map(c => <Chip key={c.id} c={c} />)
                              )}
                            </DropBox>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </>
        )}
      </div>

      {mapModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setMapModal(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            className="card"
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 920, maxHeight: '90vh',
              padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{mapModal.title}</div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setMapModal(null)}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                Fechar
              </button>
            </div>
            <div style={{ overflow: 'auto', textAlign: 'center' }}>
              <img
                src={mapModal.src}
                alt={mapModal.title}
                style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 6, border: '1px solid var(--border)' }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

