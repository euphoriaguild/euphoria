import { useState, useEffect, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import { api, type RaffleHistoryEntry } from '../lib/api'

const COLORS = [
  '#e53e3e', '#ed8936', '#ecc94b', '#48bb78', '#38b2ac',
  '#4299e1', '#667eea', '#b794f4', '#ed64a6', '#fc8181',
  '#f6ad55', '#68d391', '#76e4f7', '#90cdf4', '#d6bcfa',
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
    const cx = size / 2, cy = size / 2, r = size / 2 - 4

    ctx.clearRect(0, 0, size, size)
    const slice = (Math.PI * 2) / participants.length

    participants.forEach((p, i) => {
      const startAngle = rot + i * slice
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, startAngle, startAngle + slice)
      ctx.closePath()
      ctx.fillStyle = COLORS[i % COLORS.length]
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(startAngle + slice / 2)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.max(9, Math.min(13, 180 / participants.length))}px Inter, sans-serif`
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 4
      ctx.fillText(p.length > 14 ? p.slice(0, 13) + '…' : p, r - 10, 4)
      ctx.restore()
    })

    // Anel externo
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(201,168,76,0.5)'
    ctx.lineWidth = 3
    ctx.stroke()

    // Centro
    ctx.beginPath()
    ctx.arc(cx, cy, 16, 0, Math.PI * 2)
    ctx.fillStyle = '#0d1117'
    ctx.fill()
    ctx.strokeStyle = '#c9a84c'
    ctx.lineWidth = 2
    ctx.stroke()
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

    const extraSpins = 5 + Math.floor(Math.random() * 5)
    const winnerIdx = Math.floor(Math.random() * participants.length)
    const slice = (Math.PI * 2) / participants.length
    // A "seta" aponta para cima (−π/2), então vencedor fica lá
    const targetRot = -Math.PI / 2 - (winnerIdx * slice + slice / 2) + Math.PI * 2 * extraSpins

    let start: number | null = null
    const duration = 4000 + Math.random() * 2000
    const startRot = rotation

    function animate(ts: number) {
      if (!start) start = ts
      const elapsed = ts - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
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
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Monte a roleta com nomes livres ou nicks dos membros, informe o item sorteado e gire para registrar o resultado no histórico.
        </p>

        {/* Grid: roleta (esquerda) | painel (direita) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'start' }}>

          {/* ── Coluna esquerda: item + roleta + botão ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ width: '100%' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
                Item sorteado
              </label>
              <input
                value={item}
                onChange={e => setItem(e.target.value)}
                placeholder="Ex: Great Dragon Gloves +13"
                style={{
                  width: '100%', padding: '9px 12px', background: 'var(--bg-700)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', top: -15, left: '50%', transform: 'translateX(-50%)',
                width: 0, height: 0, zIndex: 10,
                borderLeft: '12px solid transparent', borderRight: '12px solid transparent',
                borderTop: '22px solid var(--accent)',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
              }} />
              <canvas
                ref={canvasRef}
                width={360}
                height={360}
                style={{ borderRadius: '50%', boxShadow: '0 0 40px rgba(201,168,76,0.2)',
                  display: 'block', background: 'var(--bg-700)' }}
              />
              {participants.length === 0 && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-700)', borderRadius: '50%',
                  fontSize: 13, color: 'var(--text-muted)', textAlign: 'center',
                  padding: 24, pointerEvents: 'none',
                }}>
                  Adicione<br />participantes
                </div>
              )}
            </div>

            <button
              className="btn btn-primary"
              onClick={spin}
              disabled={spinning || participants.length < 2}
              style={{ padding: '12px 0', fontSize: 15, width: 360,
                justifyContent: 'center', opacity: participants.length < 2 ? 0.45 : 1 }}
            >
              {spinning
                ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Sorteando…</>
                : 'Girar'}
            </button>
          </div>

          {/* ── Coluna direita: participantes + resultado ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: 1 }}>
                  Participantes ({participants.length})
                </span>
                {participants.length > 0 && (
                  <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                    onClick={() => { setParticipants([]); setWinner(null) }}>
                    Limpar tudo
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input
                  value={inputName}
                  onChange={e => setInputName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addParticipant()}
                  placeholder="Adicionar nome..."
                  style={{
                    flex: 1, padding: '8px 12px', background: 'var(--bg-700)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  }}
                />
                <button className="btn btn-primary" onClick={addParticipant} style={{ padding: '8px 13px' }}>
                  <Plus size={15} />
                </button>
              </div>

              {participants.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {participants.map((p, i) => (
                    <span key={p} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                      background: COLORS[i % COLORS.length] + '28',
                      border: `1px solid ${COLORS[i % COLORS.length]}60`,
                      color: 'var(--text-primary)',
                    }}>
                      {p}
                      <button onClick={() => removeParticipant(p)} style={{
                        background: 'none', border: 'none', color: 'inherit',
                        cursor: 'pointer', display: 'flex', padding: 0, opacity: 0.6 }}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                  Nenhum participante adicionado.
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={removeWinner} style={{ marginTop: 2 }}
                  onChange={e => setRemoveWinner(e.target.checked)} />
                <span>
                  Remover ganhador da roleta após sorteio.
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                    Quando ativo, o ganhador sai da lista após o sorteio.
                  </span>
                </span>
              </label>
            </div>

            {winner && (
              <div className="card" style={{
                textAlign: 'center', borderColor: 'var(--border-accent)',
                background: 'rgba(201,168,76,0.06)',
              }}>
                <div style={{ fontSize: 36, marginBottom: 6 }}>🎉</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700,
                  color: 'var(--accent)', marginBottom: 4 }}>
                  {winner}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  ganhou {item.trim() || 'o sorteio'}!
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Histórico (sempre visível) ── */}
        <div className="card" style={{ marginTop: 28 }}>
          <div className="card-header">
            <span className="card-title">Histórico de sorteios</span>
          </div>
          {historyLoading ? (
            <div className="loading" style={{ padding: '20px 0' }}><div className="spinner" /> Carregando...</div>
          ) : history.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>Nenhum sorteio registrado ainda.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Item</th><th>Vencedor</th><th>Participantes</th></tr></thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {new Date(h.drawn_at).toLocaleString('pt-BR')}
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        {h.item === '—' ? <em style={{ color: 'var(--text-muted)' }}>sem item</em> : h.item}
                      </td>
                      <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{h.winner}</td>
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
