import { useMemo, useState } from 'react'
import { useHorarioBrasilia } from '../hooks/useHorarioBrasilia'
import { useCheckins } from '../hooks/useCheckins'
import { useAuth } from '../contexts/AuthContext'
import { StatusBar } from '../components/StatusBar'
import { CheckinForm } from '../components/CheckinForm'
import { Ranking } from '../components/Ranking'
import { ModoTabs } from '../components/ModoTabs'
import { MINUTOS_ANTES, MODOS, type CanalKey, type ModoKey } from '../config'
import { eventoAtual, proximoEvento } from '../lib/eventos'
import { api } from '../lib/api'

function brtWallKeyFromDate(d: Date): string {
  // `d` já carrega o relógio de parede BRT (via useHorarioBrasilia)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

function brtWallKeyFromIso(iso: string): string | null {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(d).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function sameEventSlot(iso: string | undefined, slot: Date): boolean {
  if (!iso) return false
  const a = brtWallKeyFromIso(iso)
  const b = brtWallKeyFromDate(slot)
  if (a && a === b) return true
  // Legado: evento gravado como 02:10+00:00 quando era 02:10 BRT (offset errado)
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/)
  if (!m) return false
  const literal = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`
  return literal === b
}

export function Events() {
  const agora = useHorarioBrasilia()
  const { checkins, recarregar } = useCheckins()
  const { profile, isStaff } = useAuth()
  const [modo, setModo] = useState<ModoKey>('bc')

  const myNick = (profile?.nick_mudomix || '').trim().toLowerCase()

  const horarios = MODOS[modo].horarios
  const eventoAberto = agora ? eventoAtual(agora, horarios) : null
  const slotAlvo = agora ? (eventoAberto ?? proximoEvento(agora, horarios)) : null
  const janelaAberta = !!eventoAberto

  const checkinsModo = useMemo(() => {
    const canais = new Set<string>(MODOS[modo].canais)
    return checkins.filter((c) => {
      if (!canais.has(c.canal)) return false
      if (!slotAlvo) return false
      return sameEventSlot(c.evento, slotAlvo)
    })
  }, [checkins, modo, slotAlvo])

  function canCancelPlayer(player: string): boolean {
    if (isStaff) return true
    if (!myNick) return false
    return player.trim().toLowerCase() === myNick
  }

  async function handleCancel(player: string, canal: CanalKey) {
    if (!canCancelPlayer(player)) {
      alert('Você só pode cancelar o check-in do seu próprio personagem.')
      return
    }
    if (!confirm(`Cancelar check-in de ${player}?`)) return
    try {
      await api.cancelCheckin({ player, canal })
      await recarregar()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao cancelar'
      alert(msg.replace(/^API error \d+: \/api\/checkins — /, '') || 'Erro ao cancelar')
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>{modo === 'ilusion' ? 'Ilusion Temple' : 'Blood Castle'} — Check-in</h2>
      </div>

      <div className="page-body">
        <div className="card" style={{ marginBottom: 16 }}>
          <StatusBar agora={agora} modo={modo} />
        </div>

        <ModoTabs modo={modo} onChange={setModo} />

        <div className="card" style={{ marginTop: 12 }}>
          <CheckinForm agora={agora} modo={modo} onSuccess={recarregar} />
        </div>

        <h2 style={{ margin: '24px 0 12px', fontSize: 14, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-secondary)' }}>
          Grupos
        </h2>
        <Ranking
          checkins={checkinsModo}
          modo={modo}
          canCancel={janelaAberta}
          canCancelPlayer={canCancelPlayer}
          onCancel={handleCancel}
        />

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Instruções</div>
          <ul style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 2,
            paddingLeft: 20 }}>
            <li>Digite o nome do personagem exatamente como no jogo;</li>
            {modo === 'ilusion' ? (
              <li>Selecione o servidor <strong>VIP</strong> ou <strong>GERAL</strong>;</li>
            ) : (
              <li>Selecione a sala (BC1–BC7);</li>
            )}
            <li>
              O check-in abre <strong style={{ color: 'var(--accent)' }}>{MINUTOS_ANTES} minutos</strong> antes
              do evento (horário de Brasília)
              {modo === 'ilusion' ? ' — ex.: 09:30 → abre 09:05' : ''};
            </li>
            {modo === 'ilusion' ? (
              <li>Limite: <strong>5 jogadores</strong> por servidor (VIP e GERAL separados);</li>
            ) : (
              <li>Limite: <strong>5 VIP</strong> + <strong>5 Principal</strong> por sala;</li>
            )}
            <li>
              Enquanto o check-in estiver aberto, use o <strong>×</strong> ao lado do seu nick para liberar a vaga
              (staff/admin podem remover qualquer um);
            </li>
            <li>Só se inscreva se tiver nível necessário e convite.</li>
          </ul>
        </div>
      </div>
    </>
  )
}
