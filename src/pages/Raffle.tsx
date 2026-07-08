import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { X, Plus } from 'lucide-react'

interface HistoryEntry {
  id: number
  item: string
  winner: string
  participants: string[]
  drawn_at: string
}

const COLORS = [
  '#e53e3e', '#dd6b20', '#d69e2e', '#38a169', '#2b6cb0',
  '#6b46c1', '#b83280', '#2c7a7b', '#744210', '#2d3748',
]

export function Raffle() {
  const [item, setItem] = useState('')
  const [inputName, setInputName] = useState('')
  const [participants, setParticipants] = useState<string[]>([])
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [rotation, setRotation] = useState(0)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [removeWinner, setRemoveWinner] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Carrega histórico do Supabase
  useEffect(() => {
    supabase
      .from('raffle_history')
      .select('*')
      .order('drawn_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setHistory(data as HistoryEntry[]) }, () => {}) // ignora se tabela não existe ainda
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
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Texto
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(startAngle + slice / 2)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.max(10, Math.min(14, 200 / participants.length))}px Inter`
      ctx.shadowColor = '#000'
      ctx.shadowBlur = 3
      ctx.fillText(p.length > 12 ? p.slice(0, 11) + '…' : p, r - 8, 4)
      ctx.restore()
    })

    // Centro
    ctx.beginPath()
    ctx.arc(cx, cy, 18, 0, Math.PI * 2)
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

        if (removeWinner) {
          setParticipants(prev => prev.filter(p => p !== w))
        }

        // Salva no histórico
        if (item.trim()) {
          supabase.from('raffle_history').insert({
            item: item.trim(),
            winner: w,
            participants: [...participants],
          }).then(({ data }) => {
            if (data) setHistory(prev => [data[0] as HistoryEntry, ...prev].slice(0, 20))
          }, () => {})
        }
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'start' }}>

          {/* Painel esquerdo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Item sorteado */}
            <div className="card">
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
                Item sorteado
              </label>
              <input
                value={item}
                onChange={e => setItem(e.target.value)}
                placeholder="Ex: Jewel of Chaos +15"
                style={{
                  width: '100%', padding: '9px 12px', background: 'var(--bg-700)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                }}
              />
            </div>

            {/* Participantes */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: 1 }}>
                  Participantes ({participants.length})
                </span>
                {participants.length > 0 && (
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }}
                    onClick={() => { setParticipants([]); setWinner(null) }}>
                    Limpar
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
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
                <button className="btn btn-primary" onClick={addParticipant} style={{ padding: '8px 12px' }}>
                  <Plus size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {participants.map((p, i) => (
                  <span key={p} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    background: COLORS[i % COLORS.length] + '25',
                    border: `1px solid ${COLORS[i % COLORS.length]}55`,
                    color: 'var(--text-primary)',
                  }}>
                    {p}
                    <button onClick={() => removeParticipant(p)}
                      style={{ background: 'none', border: 'none', color: 'inherit',
                        cursor: 'pointer', display: 'flex', padding: 0, opacity: 0.7 }}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
                fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={removeWinner}
                  onChange={e => setRemoveWinner(e.target.checked)} />
                Remover vencedor da roleta após sorteio
              </label>
            </div>

            {/* Resultado */}
            {winner && (
              <div className="card" style={{
                textAlign: 'center', borderColor: 'var(--border-accent)',
                background: 'rgba(201,168,76,0.06)',
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
                  color: 'var(--accent)' }}>
                  {winner}
                </div>
                {item && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  ganhou {item}
                </div>}
              </div>
            )}
          </div>

          {/* Roleta + botão */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative' }}>
              {/* Seta */}
              <div style={{
                position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                width: 0, height: 0, zIndex: 10,
                borderLeft: '10px solid transparent',
                borderRight: '10px solid transparent',
                borderTop: '20px solid var(--accent)',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
              }} />
              <canvas
                ref={canvasRef}
                width={320}
                height={320}
                style={{ borderRadius: '50%', boxShadow: '0 0 30px rgba(201,168,76,0.2)' }}
              />
              {participants.length === 0 && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-700)', borderRadius: '50%',
                  fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20,
                }}>
                  Adicione<br />participantes
                </div>
              )}
            </div>

            <button
              className="btn btn-primary"
              onClick={spin}
              disabled={spinning || participants.length < 2}
              style={{ padding: '12px 36px', fontSize: 15, width: '100%',
                justifyContent: 'center', opacity: participants.length < 2 ? 0.5 : 1 }}
            >
              {spinning ? (
                <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Sorteando...</>
              ) : 'Girar'}
            </button>
          </div>
        </div>

        {/* Histórico */}
        {history.length > 0 && (
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header">
              <span className="card-title">Histórico de sorteios</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Item</th>
                    <th>Vencedor</th>
                    <th>Participantes</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(h.drawn_at).toLocaleString('pt-BR')}
                      </td>
                      <td>{h.item}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{h.winner}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {h.participants.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
