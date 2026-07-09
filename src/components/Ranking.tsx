import { MODOS, LABELS, type CanalKey, type ModoKey } from '../config'
import type { Checkin } from '../hooks/useCheckins'

type Props = { checkins: Checkin[]; modo: ModoKey }

export function Ranking({ checkins, modo }: Props) {
  const { canais, maxJogadores, maxTitulares } = MODOS[modo]
  const buckets = Object.fromEntries(canais.map((c) => [c, [] as string[]])) as Record<CanalKey, string[]>
  for (const c of checkins) {
    if (buckets[c.canal as CanalKey]) buckets[c.canal as CanalKey].push(c.player)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
      {canais.map((canal) => {
        const lista = buckets[canal]
        const titulares = lista.slice(0, maxTitulares)
        const reservas = lista.slice(maxTitulares)
        const full = lista.length >= maxJogadores

        return (
          <div key={canal} className="card" style={{
            borderColor: full ? 'rgba(245,101,101,0.4)' : 'var(--border)',
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                {LABELS[canal]}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                background: full ? 'rgba(245,101,101,0.15)' : 'rgba(201,168,76,0.1)',
                color: full ? 'var(--red)' : 'var(--accent)',
              }}>
                {full ? 'FULL' : `${lista.length}/${maxJogadores}`}
              </span>
            </div>

            {lista.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum jogador ainda</div>
            )}

            {titulares.length > 0 && (
              <div style={{ marginBottom: reservas.length > 0 ? 8 : 0 }}>
                {maxJogadores > maxTitulares && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1,
                    textTransform: 'uppercase', marginBottom: 4 }}>⚔️ VIP</div>
                )}
                {titulares.map((p, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0' }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{i + 1}.</span>{p}
                  </div>
                ))}
              </div>
            )}

            {reservas.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1,
                  textTransform: 'uppercase', marginBottom: 4 }}>🪑 PRINCIPAL</div>
                {reservas.map((p, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0' }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{i + maxTitulares + 1}.</span>{p}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
