import { useState, useEffect, useRef, useCallback } from 'react'
import { api, type RaffleHistoryEntry, type ActiveRaffle, type RaffleTier } from '../lib/api'
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

const TIERS: { value: RaffleTier; label: string; color: string }[] = [
  { value: 'T1', label: 'Tier 1', color: '#a0aec0' },
  { value: 'T2', label: 'Tier 2', color: '#48bb78' },
  { value: 'T3', label: 'Tier 3', color: '#4299e1' },
  { value: 'T4', label: 'Tier 4', color: '#9f7aea' },
  { value: 'T5', label: 'Tier 5', color: '#ed8936' },
  { value: 'NA', label: 'N/A',    color: '#718096' },
]

const TAU = Math.PI * 2
const POLL_ACTIVE_MS = 2000
const POLL_IDLE_MS = 8000

function TierBadge({ tier }: { tier: RaffleTier | null | undefined }) {
  const t = TIERS.find(x => x.value === tier)
  if (!t) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
      color: t.color, background: t.color + '22', border: `1px solid ${t.color}66`, whiteSpace: 'nowrap',
    }}>
      {t.label}
    </span>
  )
}

function Spinner() {
  return <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
}

interface SpinPlan {
  raffleId: number
  participants: string[]
  winner: string
  prize: string
  tier: RaffleTier | null
  targetRot: number
  startAt: number // Date.now() local em que o giro começa
  durationMs: number
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

export function Raffle() {
  const { profile } = useAuth()

  const [active, setActive] = useState<ActiveRaffle | null>(null)
  const [plan, setPlan] = useState<SpinPlan | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [animating, setAnimating] = useState(false)
  const [result, setResult] = useState<{ winner: string; prize: string; tier: RaffleTier | null } | null>(null)
  const [rotation, setRotation] = useState(0)
  const [history, setHistory] = useState<RaffleHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const HISTORY_PAGE = 20
  const [spinDuration, setSpinDuration] = useState(5)
  const [newPrize, setNewPrize] = useState('')
  const [newTier, setNewTier] = useState<RaffleTier | ''>('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<'join' | 'leave' | 'spin' | null>(null)
  const [editing, setEditing] = useState(false)
  const [editPrizeInput, setEditPrizeInput] = useState('')
  const [editTierInput, setEditTierInput] = useState<RaffleTier>('NA')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const plannedIdRef = useRef<number | null>(null)

  const raffle = active?.raffle ?? null
  const isOpen = raffle?.status === 'open'
  const joined = active?.joined ?? false
  const hasNick = !!profile?.nick_mudomix
  const wheelParticipants = isOpen ? (active?.participants ?? []) : (plan?.participants ?? active?.participants ?? [])
  const raffleBusy = isOpen || animating || countdown !== null

  const reloadHistory = useCallback(async () => {
    const data = await api.getRaffleHistory(HISTORY_PAGE, 0)
    setHistory(data)
    setHasMore(data.length === HISTORY_PAGE)
  }, [])

  const loadActive = useCallback(async () => {
    try {
      const data = await api.getActiveRaffle()
      const receivedAt = Date.now()
      setActive(data)

      if (data.raffle?.status === 'open' && plannedIdRef.current !== data.raffle.id) {
        // Novo sorteio aberto: limpa giro/resultado anteriores
        plannedIdRef.current = null
        setPlan(null)
        setResult(null)
        setRotation(0)
      }

      const spin = data.spin
      if (data.raffle && spin && plannedIdRef.current !== data.raffle.id) {
        plannedIdRef.current = data.raffle.id
        const slice = TAU / spin.participants.length
        const targetAngle = -Math.PI / 2 - (spin.winner_index * slice + spin.offset * slice)
        const targetNorm = ((targetAngle % TAU) + TAU) % TAU
        setResult(null)
        setPlan({
          raffleId: data.raffle.id,
          participants: spin.participants,
          winner: spin.winner_nick,
          prize: data.raffle.prize,
          tier: data.raffle.item_tier,
          targetRot: targetNorm + TAU * spin.turns,
          startAt: receivedAt + spin.starts_in_ms,
          durationMs: spin.duration_s * 1000,
        })
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadActive()
    reloadHistory()
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [loadActive, reloadHistory])

  // Polling adaptativo: mais rápido com sorteio ativo, pausado com a aba oculta
  useEffect(() => {
    const ms = raffle ? POLL_ACTIVE_MS : POLL_IDLE_MS
    const id = setInterval(() => {
      if (!document.hidden) loadActive()
    }, ms)
    return () => clearInterval(id)
  }, [loadActive, raffle])

  // Animação dirigida pelo plano vindo do servidor (idêntica para todos na rota)
  useEffect(() => {
    if (!plan) return
    let frame = 0
    let finished = false

    function tick() {
      if (!plan) return
      const now = Date.now()
      if (now < plan.startAt) {
        setCountdown(Math.ceil((plan.startAt - now) / 1000))
        setAnimating(false)
        setRotation(0)
        frame = requestAnimationFrame(tick)
        return
      }
      setCountdown(null)
      const progress = Math.min((now - plan.startAt) / plan.durationMs, 1)
      setRotation(plan.targetRot * easeOutQuart(progress))
      if (progress < 1) {
        setAnimating(true)
        frame = requestAnimationFrame(tick)
      } else if (!finished) {
        finished = true
        setAnimating(false)
        setResult({ winner: plan.winner, prize: plan.prize, tier: plan.tier })
        reloadHistory().catch(() => {})
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [plan, reloadHistory])

  // Desenha a roleta no canvas
  useEffect(() => {
    drawWheel(rotation)
  }, [wheelParticipants, rotation])

  async function loadMoreHistory() {
    setLoadingMore(true)
    try {
      const data = await api.getRaffleHistory(HISTORY_PAGE, history.length)
      setHistory(prev => [...prev, ...data])
      setHasMore(data.length === HISTORY_PAGE)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingMore(false)
    }
  }

  function drawWheel(rot: number) {
    const canvas = canvasRef.current
    const list = wheelParticipants
    if (!canvas || list.length === 0) return
    const ctx = canvas.getContext('2d')!
    const size = canvas.width
    const cx = size / 2, cy = size / 2, r = size / 2 - 6

    ctx.clearRect(0, 0, size, size)
    const slice = TAU / list.length

    list.forEach((p, i) => {
      const startAngle = rot + i * slice
      const color = list.length <= 16
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
      const fontSize = Math.max(9, Math.min(14, 160 / list.length))
      ctx.font = `bold ${fontSize}px Inter, sans-serif`
      ctx.shadowColor = 'rgba(0,0,0,0.7)'
      ctx.shadowBlur = 3
      ctx.fillText(p.length > 16 ? p.slice(0, 15) + '…' : p, r - 12, fontSize * 0.38)
      ctx.restore()
    })

    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, TAU)
    ctx.strokeStyle = 'rgba(201,168,76,0.6)'
    ctx.lineWidth = 4
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(cx, cy, 22, 0, TAU)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#c9a84c'
    ctx.lineWidth = 2.5
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(cx, cy, 7, 0, TAU)
    ctx.fillStyle = '#0d1117'
    ctx.fill()
  }

  async function run(action: () => Promise<unknown>, fallbackMsg: string, key: typeof pending = null) {
    setBusy(true)
    setPending(key)
    try {
      await action()
      await loadActive()
    } catch (e: any) {
      alert(e?.message || fallbackMsg)
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  async function handleCreate() {
    if (!newPrize.trim()) { alert('Informe o prêmio do sorteio.'); return }
    if (!newTier) { alert('Selecione o nível do item.'); return }
    await run(async () => {
      await api.createRaffle(newPrize.trim(), newTier)
      setNewPrize('')
      setNewTier('')
    }, 'Erro ao criar sorteio')
  }

  async function handleEdit() {
    if (!editPrizeInput.trim()) { alert('Informe o prêmio.'); return }
    await run(async () => {
      await api.editRaffle(editPrizeInput.trim(), editTierInput)
      setEditing(false)
    }, 'Erro ao editar sorteio')
  }

  async function handleClose() {
    if (!confirm('Cancelar o sorteio atual sem sortear vencedor?')) return
    await run(() => api.closeRaffle(), 'Erro ao cancelar sorteio')
  }

  async function handleSpin() {
    if (wheelParticipants.length < 2) return
    await run(() => api.spinRaffle(spinDuration), 'Erro ao girar a roleta', 'spin')
  }

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', background: 'var(--bg-700)',
    border: '1px solid var(--border)', borderRadius: 6,
    color: 'var(--text-primary)', fontSize: 13, outline: 'none',
    boxSizing: 'border-box', marginBottom: 10,
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

            {/* Criar sorteio (qualquer membro, um por vez) */}
            {hasNick && (
              <div className="card">
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  ⚙️ Novo sorteio
                </div>
                <input
                  value={newPrize}
                  onChange={e => setNewPrize(e.target.value)}
                  placeholder="Prêmio (ex: Dragon Gloves +13)"
                  disabled={raffleBusy}
                  style={selectStyle}
                />
                <select
                  value={newTier}
                  onChange={e => setNewTier(e.target.value as RaffleTier)}
                  disabled={raffleBusy}
                  style={selectStyle}
                >
                  <option value="" disabled>Nível do item</option>
                  {TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button className="btn btn-primary" onClick={handleCreate} disabled={busy || raffleBusy}
                  style={{ width: '100%', justifyContent: 'center' }}>
                  Abrir sorteio
                </button>
                {raffleBusy && raffle && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    Sorteio de {raffle.created_by_nick ?? 'outro membro'} em andamento.
                    Aguarde o giro ou o cancelamento para abrir outro.
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
              {raffle && (isOpen || !result) ? (
                <>
                  {editing ? (
                    <div style={{ marginBottom: 10 }}>
                      <input
                        value={editPrizeInput}
                        onChange={e => setEditPrizeInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleEdit()}
                        autoFocus
                        style={{ ...selectStyle, border: '1px solid var(--accent)' }}
                      />
                      <select
                        value={editTierInput}
                        onChange={e => setEditTierInput(e.target.value as RaffleTier)}
                        style={selectStyle}
                      >
                        {TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                          onClick={handleEdit} disabled={busy}>Salvar</button>
                        <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                          onClick={() => setEditing(false)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{raffle.prize}</span>
                      <TierBadge tier={raffle.item_tier} />
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Criado por <strong>{raffle.created_by_nick ?? '—'}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    {wheelParticipants.length} participante{wheelParticipants.length !== 1 ? 's' : ''}
                  </div>

                  {/* Editar / cancelar: criador ou staff/admin */}
                  {isOpen && active?.can_manage && !editing && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                      <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                        onClick={() => {
                          setEditPrizeInput(raffle.prize)
                          setEditTierInput(raffle.item_tier ?? 'NA')
                          setEditing(true)
                        }} disabled={busy}>
                        Editar
                      </button>
                      <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                        onClick={handleClose} disabled={busy}>
                        Cancelar sorteio
                      </button>
                    </div>
                  )}

                  {/* Participar / sair (somente com o sorteio aberto) */}
                  {isOpen && (hasNick ? (
                    joined ? (
                      <button className="btn btn-ghost" onClick={() => run(() => api.leaveRaffle(), 'Erro ao sair', 'leave')}
                        disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
                        {pending === 'leave' ? <><Spinner /> Carregando...</> : '✓ Você está participando — Sair'}
                      </button>
                    ) : (
                      <button className="btn btn-primary" onClick={() => run(() => api.joinRaffle(), 'Erro ao participar', 'join')}
                        disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
                        {pending === 'join' ? <><Spinner /> Carregando...</> : 'Participar do sorteio'}
                      </button>
                    )
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Configure seu nick no perfil para participar.
                    </div>
                  ))}
                  {!isOpen && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Roleta girando… participação encerrada.</div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Nenhum sorteio aberto no momento.
                  {hasNick && ' Crie um acima.'}
                </div>
              )}
            </div>

            {/* Lista de participantes */}
            {wheelParticipants.length > 0 && (
              <div className="card">
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  Participantes ({wheelParticipants.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {wheelParticipants.map((p, i) => {
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

            {/* Resultado (visível a todos ao fim da animação) */}
            {result && (
              <div className="card" style={{
                textAlign: 'center',
                borderColor: 'var(--border-accent)', background: 'rgba(201,168,76,0.06)',
              }}>
                <div style={{ fontSize: 30, marginBottom: 4 }}>🎉</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700,
                  color: 'var(--accent)', marginBottom: 3 }}>{result.winner}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  ganhou {result.prize || 'o sorteio'}!
                </div>
                <TierBadge tier={result.tier} />
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

              {wheelParticipants.length === 0 && (
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

              {countdown !== null && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.55)', borderRadius: '50%',
                  fontFamily: 'var(--font-display)', fontSize: 96, fontWeight: 900,
                  color: 'var(--accent)', pointerEvents: 'none',
                }}>
                  {countdown}
                </div>
              )}
            </div>

            {/* Girar Roleta — somente o criador */}
            {isOpen && active?.is_creator ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  Duração do giro:
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
                <button
                  className="btn btn-primary"
                  onClick={handleSpin}
                  disabled={busy || wheelParticipants.length < 2}
                  style={{
                    padding: '14px 0', fontSize: 16, width: '100%',
                    justifyContent: 'center', borderRadius: 8,
                    opacity: wheelParticipants.length < 2 ? 0.45 : 1,
                    letterSpacing: 0.5,
                  }}
                >
                  {pending === 'spin'
                    ? <><Spinner /> Carregando...</>
                    : wheelParticipants.length < 2 ? 'Mínimo de 2 participantes' : 'Girar Roleta ›'}
                </button>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', minHeight: 20 }}>
                {countdown !== null && 'Preparando o giro…'}
                {animating && <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} /> Sorteando…</>}
                {isOpen && `Aguardando ${raffle?.created_by_nick ?? 'o criador'} girar a roleta.`}
              </div>
            )}
          </div>
        </div>

        {/* ── Histórico ── */}
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header">
            <span className="card-title">Histórico de sorteios</span>
            {!historyLoading && history.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{history.length} registros</span>
            )}
          </div>
          {historyLoading ? (
            <div className="loading" style={{ padding: '16px 0' }}><div className="spinner" /> Carregando...</div>
          ) : history.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '10px 0' }}>Nenhum sorteio registrado ainda.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data/Hora</th><th>Item</th><th>Nível</th><th>Vencedor</th><th>Criado por</th><th>Participantes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id}>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}
                          title={h.raffle_created_at ? `Aberto em ${new Date(h.raffle_created_at).toLocaleString('pt-BR')}` : undefined}>
                          {new Date(h.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td style={{ fontWeight: 500 }}>
                          {h.prize === '—' ? <em style={{ color: 'var(--text-muted)' }}>sem item</em> : h.prize}
                        </td>
                        <td><TierBadge tier={h.item_tier} /></td>
                        <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{h.winner_nick}</td>
                        <td style={{ fontSize: 12 }}>{h.created_by_nick ?? h.conducted_by ?? '—'}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 280 }}>{h.participants.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: 14 }}>
                  <button className="btn btn-ghost" onClick={loadMoreHistory} disabled={loadingMore}>
                    {loadingMore ? 'Carregando...' : 'Carregar mais'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
