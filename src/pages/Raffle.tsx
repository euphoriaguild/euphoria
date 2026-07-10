import { useState, useEffect, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import { api, type RaffleHistoryEntry } from '../lib/api'

// Duas cores alternadas = estilo sorteio.com
const WHEEL_COLOR_A = '#c9a84c' // ouro
const WHEEL_COLOR_B = '#1e3a60' // azul escuro
// Extra cores para quando tem muitos participantes
const EXTRA_COLORS = [
  '#c9a84c', '#1e3a60', '#b8932a', '#2a4f80',
  '#daa84c', '#163060', '#c99a2a', '#1e4a70',
  '#e0b84c', '#0e2a50', '#c98a1a', '#243a70',
  '#d4a03c', '#1a3458', '#b87a20', '#2e4a80',
]

export function Raffle() {
  const [item, setItem] = useState('')
  const [inputName, setInputName] = useState('')
  const [participants, setParticipants] = useState<string[]>([])
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [rotation, setRotation] = useState(0)
  const [history, setHistory] = useState<RaffleHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [removeWinner, setRemoveWinner] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    api.getRaffleHistory()
      .then(data => setHistory(data))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

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

    // Anel externo brilhante
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(201,168,76,0.6)'
    ctx.lineWidth = 4
    ctx.stroke()

    // Centro branco
    ctx.beginPath()
    ctx.arc(cx, cy, 22, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#c9a84c'
    ctx.lineWidth = 2.5
    ctx.stroke()

    // Ponto central
    ctx.beginPath()
    ctx.arc(cx, cy, 7, 0, Math.PI * 2)
    ctx.fillStyle = '#0d1117'
    ctx.fill()
  }

  function addParticipant() {
    const name = inputName.trim()
    if (!name || participants.includes(name)) return
    setParticipants(prev => [...prev, name])
    setInputName('')
    setWinner(null)
  }

  function removeParticipant(name: string) {
    setParticipants(prev => prev.filter(p => p !== name))
    setWinner(null)
  }

  function spin() {
    if (participants.length < 2 || spinning) return
    setWinner(null)
    setSpinning(true)

    const extraSpins = 8 + Math.floor(Math.random() * 4)
    const winnerIdx = Math.floor(Math.random() * participants.length)
    const slice = (Math.PI * 2) / participants.length
    // Posição aleatória dentro da fatia (entre 15% e 85% da fatia, evitando bordas)
    const randomOffset = slice * (0.15 + Math.random() * 0.70)
    const targetRot = -Math.PI / 2 - (winnerIdx * slice + randomOffset) + Math.PI * 2 * extraSpins

    let start: number | null = null
    const duration = 8000 + Math.random() * 2000
    const startRot = rotation

    // Easing customizado: velocidade constante nos primeiros 65% do tempo (mostra todos os participantes),
    // depois desacelera suavemente nos últimos 35%
    function customEase(t: number): number {
      const split = 0.65
      const rotAtSplit = 0.78
      if (t <= split) {
        return (t / split) * rotAtSplit
      } else {
        const t2 = (t - split) / (1 - split)
        return rotAtSplit + (1 - rotAtSplit) * (1 - Math.pow(1 - t2, 3))
      }
    }

    function animate(ts: number) {
      if (!start) start = ts
      const elapsed = ts - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = customEase(progress)
      const current = startRot + (targetRot - startRot) * eased
      setRotation(current)
      drawWheel(current)

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setSpinning(false)
        const w = participants[winnerIdx]
        setWinner(w)

        if (removeWinner) setParticipants(prev => prev.filter(p => p !== w))

        // Salva sempre (mesmo sem item) e recarrega histórico
        api.saveRaffle(item.trim() || '—', w, [...participants])
          .then(() => api.getRaffleHistory())
          .then(data => setHistory(data))
          .catch(() => {})
      }
    }
    requestAnimationFrame(animate)
  }

  return (
    <>
      <div className="page-header">
        <h2>Sorteio — Roleta</h2>
      </div>

      <div className="page-body">
        {/* Layout principal: painel esquerdo | roleta direita */}
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>

          {/* ── Painel esquerdo (como sorteio.com) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Opções */}
            <div className="card" style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, display: 'flex',
                alignItems: 'center', gap: 6 }}>
                ⚙️ Opções
              </div>

              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 10 }}>
                Remover ganhador
                <div
                  onClick={() => setRemoveWinner(v => !v)}
                  style={{
                    width: 38, height: 22, borderRadius: 11, cursor: 'pointer', transition: 'background 0.2s',
                    background: removeWinner ? 'var(--accent)' : 'var(--bg-600)',
                    border: '1px solid var(--border)', position: 'relative',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3, left: removeWinner ? 18 : 3,
                    width: 14, height: 14, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </div>
              </label>

              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Item sorteado</div>
              <input
                value={item}
                onChange={e => setItem(e.target.value)}
                placeholder="Ex: Great Dragon Gloves +13"
                style={{
                  width: '100%', padding: '8px 10px', background: 'var(--bg-700)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Entradas */}
            <div className="card" style={{ borderRadius: '0 0 8px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: 1 }}>
                  🎁 Entradas {participants.length > 0 && (
                    <span style={{ background: 'var(--accent)', color: '#000', borderRadius: 10,
                      padding: '1px 7px', fontSize: 11 }}>{participants.length}</span>
                  )}
                </span>
                {participants.length > 0 && (
                  <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11 }}
                    onClick={() => { setParticipants([]); setWinner(null) }}>
                    Limpar
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <input
                  value={inputName}
                  onChange={e => setInputName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addParticipant()}
                  placeholder="Insira os itens para a roleta..."
                  style={{
                    flex: 1, padding: '8px 10px', background: 'var(--bg-700)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                  }}
                />
                <button className="btn btn-primary" onClick={addParticipant}
                  style={{ padding: '8px 11px', flexShrink: 0 }}>
                  <Plus size={14} />
                </button>
              </div>

              {/* Lista de chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6,
                maxHeight: 220, overflowY: 'auto' }}>
                {participants.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum participante.</div>
                ) : participants.map((p, i) => {
                  const color = i % 2 === 0 ? WHEEL_COLOR_A : WHEEL_COLOR_B
                  return (
                    <span key={p} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                      background: color + '22', border: `1px solid ${color}55`,
                      color: 'var(--text-primary)',
                    }}>
                      {p}
                      <button onClick={() => removeParticipant(p)} style={{
                        background: 'none', border: 'none', color: 'inherit',
                        cursor: 'pointer', display: 'flex', padding: 0, opacity: 0.55 }}>
                        <X size={10} />
                      </button>
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Resultado */}
            {winner && (
              <div className="card" style={{
                marginTop: 12, textAlign: 'center',
                borderColor: 'var(--border-accent)', background: 'rgba(201,168,76,0.06)',
              }}>
                <div style={{ fontSize: 30, marginBottom: 4 }}>🎉</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700,
                  color: 'var(--accent)', marginBottom: 3 }}>{winner}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  ganhou {item.trim() || 'o sorteio'}!
                </div>
              </div>
            )}
          </div>

          {/* ── Painel direito: roleta grande (estilo sorteio.com) ── */}
          <div style={{
            background: 'var(--bg-800)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '32px 24px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
          }}>
            {/* Roleta */}
            <div style={{ position: 'relative' }}>
              {/* Ponteiro estilo sorteio.com (teardrop/pino) */}
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
                  Adicione<br />participantes
                </div>
              )}
            </div>

            {/* Botão Girar (largura total como no sorteio.com) */}
            <button
              className="btn btn-primary"
              onClick={spin}
              disabled={spinning || participants.length < 2}
              style={{
                padding: '14px 0', fontSize: 16, width: '100%',
                justifyContent: 'center', borderRadius: 8,
                opacity: participants.length < 2 ? 0.45 : 1,
                letterSpacing: 0.5,
              }}
            >
              {spinning
                ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Sorteando…</>
                : 'Girar Roleta ›'}
            </button>
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
