import { X } from 'lucide-react'
import { MODOS, LABELS, type CanalKey, type ModoKey } from '../config'
import type { Checkin } from '../hooks/useCheckins'

type Props = {
  checkins: Checkin[]
  modo: ModoKey
  /** Janela aberta — sem isso ninguém cancela. */
  canCancel?: boolean
  /** true se este nick pode ser cancelado pelo usuário atual. */
  canCancelPlayer?: (player: string) => boolean
  onCancel?: (player: string, canal: CanalKey) => void
}

export function Ranking({ checkins, modo, canCancel, canCancelPlayer, onCancel }: Props) {
  const { canais, maxJogadores, maxTitulares } = MODOS[modo]
  const flatList = maxJogadores === maxTitulares
  const buckets = Object.fromEntries(canais.map((c) => [c, [] as string[]])) as Record<CanalKey, string[]>
  for (const c of checkins) {
    if (buckets[c.canal as CanalKey]) buckets[c.canal as CanalKey].push(c.player)
  }

  function renderRow(player: string, canal: CanalKey, index: number, key: string) {
    const showCancel = !!canCancel && !!onCancel && (!canCancelPlayer || canCancelPlayer(player))
    return (
      <div key={key} style={{
        fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <span>
          <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{index}.</span>{player}
        </span>
        {showCancel && (
          <button
            type="button"
            title="Cancelar check-in"
            aria-label={`Cancelar check-in de ${player}`}
            onClick={() => onCancel(player, canal)}
            style={{
              background: 'none', border: 'none', padding: 2, cursor: 'pointer',
              color: 'var(--red)', lineHeight: 0, flexShrink: 0, borderRadius: 4,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
      {canais.map((canal) => {
        const lista = buckets[canal]
        const titulares = flatList ? lista : lista.slice(0, maxTitulares)
        const reservas = flatList ? [] : lista.slice(maxTitulares)
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
                {!flatList && maxJogadores > maxTitulares && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1,
                    textTransform: 'uppercase', marginBottom: 4 }}>⚔️ VIP</div>
                )}
                {titulares.map((p, i) => renderRow(p, canal, i + 1, `${canal}-${p}-${i}`))}
              </div>
            )}

            {reservas.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1,
                  textTransform: 'uppercase', marginBottom: 4 }}>🪑 PRINCIPAL</div>
                {reservas.map((p, i) => renderRow(p, canal, i + maxTitulares + 1, `${canal}-r-${p}-${i}`))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
