import { useState, useEffect } from 'react'

// Horários do World Boss (Brasília) — ajuste conforme o servidor
const WORLD_BOSS_HOURS: [number, number][] = [
  [13, 0],
  [19, 0],
  [23, 0],
]

const INVASIONS = [
  { name: 'Invasão Kundun', hours: [[2,0],[8,0],[14,0],[20,0]] as [number,number][] },
  { name: 'Invasão Erohim', hours: [[1,0],[7,0],[13,0],[19,0]] as [number,number][] },
  { name: 'Invasão White Wizard', hours: [[0,30],[6,30],[12,30],[18,30]] as [number,number][] },
]

function nextTime(hours: [number, number][], now: Date): Date {
  const today = new Date(now)
  for (const [h, m] of hours) {
    const t = new Date(today)
    t.setHours(h, m, 0, 0)
    if (t > now) return t
  }
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(hours[0][0], hours[0][1], 0, 0)
  return tomorrow
}

function countdown(target: Date, now: Date): string {
  const diff = Math.max(0, target.getTime() - now.getTime())
  const h = Math.floor(diff / 3600000).toString().padStart(2, '0')
  const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0')
  const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function WorldBoss() {
  const now = useNow()
  const next = nextTime(WORLD_BOSS_HOURS, now)
  const cd = countdown(next, now)
  const isNear = next.getTime() - now.getTime() < 15 * 60 * 1000

  return (
    <>
      <div className="page-header">
        <h2>World Boss</h2>
      </div>

      <div className="page-body">
        {/* Countdown principal */}
        <div className="card" style={{
          textAlign: 'center', padding: '40px 24px', marginBottom: 20,
          borderColor: isNear ? 'rgba(229,62,62,0.4)' : 'var(--border)',
          background: isNear ? 'rgba(229,62,62,0.04)' : 'var(--bg-800)',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase',
            letterSpacing: 2, marginBottom: 8 }}>
            Próximo World Boss
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 900,
            color: isNear ? 'var(--red)' : 'var(--accent)', letterSpacing: 4, lineHeight: 1,
          }}>
            {cd}
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
            Horário: {next.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            {isNear && (
              <span style={{ marginLeft: 8, color: 'var(--red)', fontWeight: 700 }}>
                ⚠️ QUASE NA HORA!
              </span>
            )}
          </div>
        </div>

        {/* Próximos horários */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Horários do World Boss (Brasília)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            {WORLD_BOSS_HOURS.map(([h, m]) => {
              const t = new Date(now)
              t.setHours(h, m, 0, 0)
              const past = t < now
              return (
                <div key={`${h}${m}`} style={{
                  textAlign: 'center', padding: '10px',
                  background: 'var(--bg-700)', borderRadius: 6,
                  border: `1px solid ${!past && nextTime(WORLD_BOSS_HOURS, now).getHours() === h ? 'var(--accent)' : 'var(--border)'}`,
                  opacity: past ? 0.4 : 1,
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
                    color: 'var(--text-primary)' }}>
                    {String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Brasília</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

export function Invasions() {
  const now = useNow()

  return (
    <>
      <div className="page-header">
        <h2>Invasões</h2>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {INVASIONS.map(inv => {
            const next = nextTime(inv.hours, now)
            const cd = countdown(next, now)
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
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700,
                    color: isNear ? 'var(--red)' : 'var(--accent)', letterSpacing: 2,
                  }}>
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
          ℹ️ Os horários de invasão são aproximados e baseados no calendário padrão do servidor.
          Confirme sempre no canal de avisos do Discord.
        </p>
      </div>
    </>
  )
}
