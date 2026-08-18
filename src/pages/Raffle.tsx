import { useState, useEffect, useRef, useCallback } from 'react'
import { api, type RaffleHistoryEntry, type ActiveRaffle } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// Duas cores alternadas = estilo sorteio.com
const WHEEL_COLOR_A = '#c9a84c' // ouro
const WHEEL_COLOR_B = '#1e3a60' // azul escuro
const EXTRA_COLORS = [
  '#c9a84c', '#1e3a60', '#b8932a', '#2a4f80',
  '#daa84c', '#163060', '#c99a2a', '#1e4a70',
  '#e0b84c', '#0e2a50', '#c98a1a', '#243a70',
  '#d4a03c', '#1a3458', '#b87a20', '#2e4a80',
]

export function Raffle() {
  const { isStaff, profile } = useAuth()

  const [active, setActive] = useState<ActiveRaffle | null>(null)
  const [participants, setParticipants] = useState<string[]>([])
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [rotation, setRotation] = useState(0)
  const [history, setHistory] = useState<RaffleHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [spinDuration, setSpinDuration] = useState(5)
  const [newPrize, setNewPrize] = useState('')
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const raffle = active?.raffle ?? null
  const joined = active?.joined ?? false
  const item = raffle?.prize ?? ''

  const loadActive = useCallback(async () => {
    try {
      const data = await api.getActiveRaffle()
      setActive(data)
      setParticipants(data.participants)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadActive()
    api.getRaffleHistory()
      .then(data => setHistory(data))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [loadActive])

  // Polling a cada 8s para ver novos participantes (só quando não está girando)
  useEffect(() => {
    if (spinning) return
    const id = setInterval(loadActive, 8000)
    return () => clearInterval(id)
  }, [loadActive, spinning])

  // Desenha a roleta no canvas
  useEffect(() => {
    drawWheel(rotation)
  }, [participants, rotation])

  function drawWheel(rot: number) {
    const canvas = canvasRef.current
    if (!canvas || participants.length === 0) return
    const ctx = canvas.getContext('2d')!
    const size = canvas.width
    const cx = size / 2, cy = size / 2, r = size / 2 - 6

    ctx.clearRect(0, 0, size, size)
    const slice = (Math.PI * 2) / participants.length

    participants.forEach((p, i) => {
      const startAngle = rot + i * slice
      const color = participants.length <= 16
        ? (i % 2 === 0 ? WHEEL_COLOR_A : WHEEL_COLOR_B)
        : EXTRA_COLORS[i % EXTRA_COLORS.length]

      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, startAngle, startAngle + slice)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(startAngle + slice / 2)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#fff'
      const fontSize = Math.max(9, Math.min(14, 160 / participants.length))
      ctx.font = `bold ${fontSize}px Inter, sans-serif`
      ctx.shadowColor = 'rgba(0,0,0,0.7)'
      ctx.shadowBlur = 3
      ctx.fillText(p.length > 16 ? p.slice(0, 15) + '…' : p, r - 12, fontSize * 0.38)
      ctx.restore()
    })

    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(201,168,76,0.6)'
    ctx.lineWidth = 4
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(cx, cy, 22, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#c9a84c'
    ctx.lineWidth = 2.5
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(cx, cy, 7, 0, Math.PI * 2)
    ctx.fillStyle = '#0d1117'
    ctx.fill()
  }

  async function handleCreate() {
    if (!newPrize.trim()) { alert('Informe o prêmio do sorteio.'); return }
    setBusy(true)
    try {
      await api.createRaffle(newPrize.trim())
      setNewPrize('')
      setWinner(null)
      await loadActive()
    } catch (e: any) {
      alert(e?.message || 'Erro ao criar sorteio')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin() {
    setBusy(true)
    try {
      await api.joinRaffle()
      await loadActive()
    } catch (e: any) {
      alert(e?.message || 'Erro ao participar')
    } finally {
      setBusy(false)
    }
  }

  async function handleLeave() {
    setBusy(true)
    try {
      await api.leaveRaffle()
      await loadActive()
    } catch (e: any) {
      alert(e?.message || 'Erro ao sair')
    } finally {
      setBusy(false)
    }
  }

  function spin() {
    if (participants.length < 2 || spinning) return
    setWinner(null)
    setSpinning(true)

    const extraSpins = 5 + Math.floor(Math.random() * 3)
    const winnerIdx = Math.floor(Math.random() * participants.length)
    const slice = (Math.PI * 2) / participants.length
    const randomOffset = slice * (0.15 + Math.random() * 0.70)
    const startRot = rotation
    const TAU = Math.PI * 2
    const targetAngle = -Math.PI / 2 - (winnerIdx * slice + randomOffset)
    const currentNorm = ((startRot % TAU) + TAU) % TAU
    const targetNorm = ((targetAngle % TAU) + TAU) % TAU
    let diff = targetNorm - currentNorm
    if (diff < 0) diff += TAU
    const targetRot = startRot + diff + TAU * extraSpins

    let start: number | null = null
    const duration = spinDuration * 1000

    function easeOutQuart(t: number): number {
      return 1 - Math.pow(1 - t, 4)
    }

    function animate(ts: number) {
      if (!start) start = ts
      const elapsed = ts - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutQuart(progress)
      const current = startRot + (targetRot - startRot) * eased
      setRotation(current)
      drawWheel(current)

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setSpinning(false)
        const w = participants[winnerIdx]
        setWinner(w)
        // Registra vencedor e fecha o sorteio no backend
        api.drawRaffle(w)
          .then(() => api.getRaffleHistory())
          .then(data => setHistory(data))
          .then(() => loadActive())
          .catch(() => {})
      }
    }
    requestAnimationFrame(animate)
  }

  return (
    <>
      <div className="page-header">
        <h2>Sorteio</h2>
      </div>

      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>

          {/* ── Painel esquerdo ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Staff: criar sorteio */}
            {isStaff && (
              <div className="card">
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  ⚙️ Staff — Novo sorteio
                </div>
                <input
                  value={newPrize}
                  onChange={e => setNewPrize(e.target.value)}
                  placeholder="Prêmio (ex: Dragon Gloves +13)"
                  style={{
                    width: '100%', padding: '8px 10px', background: 'var(--bg-700)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                    boxSizing: 'border-box', marginBottom: 10,
                  }}
                />
                <button className="btn btn-primary" onClick={handleCreate} disabled={busy}
                  style={{ width: '100%', justifyContent: 'center' }}>
                  {raffle ? 'Reabrir novo sorteio' : 'Abrir sorteio'}
                </button>
                {raffle && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                    Duração do giro:
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      {[5, 10, 15].map(s => (
                        <button key={s} onClick={() => setSpinDuration(s)}
                          style={{
                            padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                            border: `1px solid ${spinDuration === s ? 'var(--accent)' : 'var(--border)'}`,
                            background: spinDuration === s ? 'var(--accent)' : 'var(--bg-700)',
                            color: spinDuration === s ? '#000' : 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}>
                          {s}s
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Info do sorteio ativo */}
            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                🎁 Sorteio atual
              </div>
              {raffle ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>
                    {raffle.prize}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    {participants.length} participante{participants.length !== 1 ? 's' : ''}
                  </div>

                  {/* Botão participar / sair (todos) */}
                  {profile?.nick_mudomix ? (
                    joined ? (
                      <button className="btn btn-ghost" onClick={handleLeave} disabled={busy}
                        style={{ width: '100%', justifyContent: 'center' }}>
                        ✓ Você está participando — Sair
                      </button>
                    ) : (
                      <button className="btn btn-primary" onClick={handleJoin} disabled={busy}
                        style={{ width: '100%', justifyContent: 'center' }}>
                        Participar do sorteio
                      </button>
                    )
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Configure seu nick no perfil para participar.
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Nenhum sorteio aberto no momento.
                  {isStaff && ' Crie um acima.'}
                </div>
              )}
            </div>

            {/* Lista de participantes */}
            {participants.length > 0 && (
              <div className="card">
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  Participantes ({participants.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {participants.map((p, i) => {
                    const color = i % 2 === 0 ? WHEEL_COLOR_A : WHEEL_COLOR_B
                    const isMe = p === active?.my_nick
                    return (
                      <span key={p} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 6, fontSize: 12,
                        fontWeight: isMe ? 700 : 500,
                        background: color + '22', border: `1px solid ${color}55`,
                        color: isMe ? 'var(--accent)' : 'var(--text-primary)',
                      }}>
                        {p}{isMe && ' (você)'}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Resultado */}
            {winner && (
              <div className="card" style={{
                textAlign: 'center',
                borderColor: 'var(--border-accent)', background: 'rgba(201,168,76,0.06)',
              }}>
                <div style={{ fontSize: 30, marginBottom: 4 }}>🎉</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700,
                  color: 'var(--accent)', marginBottom: 3 }}>{winner}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  ganhou {item || 'o sorteio'}!
                </div>
              </div>
            )}
          </div>

          {/* ── Painel direito: roleta ── */}
          <div style={{
            background: 'var(--bg-800)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '32px 24px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
          }}>
            <div style={{ position: 'relative' }}>
              <svg
                width="36" height="50"
                viewBox="0 0 36 50"
                style={{
                  position: 'absolute', top: -46, left: '50%',
                  transform: 'translateX(-50%)', zIndex: 10,
                  filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))',
                }}
              >
                <circle cx="18" cy="16" r="15" fill="#c9631a" />
                <polygon points="5,24 31,24 18,50" fill="#c9631a" />
                <circle cx="18" cy="16" r="6" fill="rgba(255,255,255,0.25)" />
              </svg>

              <canvas
                ref={canvasRef}
                width={420}
                height={420}
                style={{
                  borderRadius: '50%',
                  boxShadow: '0 0 50px rgba(201,168,76,0.15), 0 4px 24px rgba(0,0,0,0.6)',
                  display: 'block',
                  background: 'var(--bg-700)',
                }}
              />

              {participants.length === 0 && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-700)', borderRadius: '50%',
                  fontSize: 13, color: 'var(--text-muted)',
                  textAlign: 'center', padding: 30, pointerEvents: 'none',
                }}>
                  Aguardando<br />participantes
                </div>
              )}
            </div>

            {/* Girar Roleta — apenas staff */}
            {isStaff ? (
              <button
                className="btn btn-primary"
                onClick={spin}
                disabled={spinning || participants.length < 2 || !raffle}
                style={{
                  padding: '14px 0', fontSize: 16, width: '100%',
                  justifyContent: 'center', borderRadius: 8,
                  opacity: (participants.length < 2 || !raffle) ? 0.45 : 1,
                  letterSpacing: 0.5,
                }}
              >
                {spinning
                  ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Sorteando…</>
                  : 'Girar Roleta ›'}
              </button>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                Apenas a staff pode girar a roleta.
              </div>
            )}
          </div>
        </div>

        {/* ── Histórico ── */}
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header">
            <span className="card-title">Histórico de sorteios</span>
          </div>
          {historyLoading ? (
            <div className="loading" style={{ padding: '16px 0' }}><div className="spinner" /> Carregando...</div>
          ) : history.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '10px 0' }}>Nenhum sorteio registrado ainda.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Item</th><th>Vencedor</th><th>Participantes</th></tr></thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {new Date(h.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        {h.prize === '—' ? <em style={{ color: 'var(--text-muted)' }}>sem item</em> : h.prize}
                      </td>
                      <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{h.winner_nick}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 280 }}>{h.participants.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
