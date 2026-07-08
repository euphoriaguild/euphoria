// Reexporta o sistema de check-in existente com o novo layout
import { useState } from 'react'
import { useHorarioBrasilia } from '../hooks/useHorarioBrasilia'
import { useCheckins } from '../hooks/useCheckins'
import { StatusBar } from '../components/StatusBar'
import { CheckinForm } from '../components/CheckinForm'
import { Ranking } from '../components/Ranking'
import { ModoTabs } from '../components/ModoTabs'
import type { ModoKey } from '../config'

export function Events() {
  const agora = useHorarioBrasilia()
  const { checkins } = useCheckins()
  const [modo, setModo] = useState<ModoKey>('bc')

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
          <CheckinForm agora={agora} modo={modo} />
        </div>

        <h2 style={{ margin: '24px 0 12px', fontSize: 14, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-secondary)' }}>
          Grupos
        </h2>
        <Ranking checkins={checkins} modo={modo} />

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Instruções</div>
          <ul style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 2,
            paddingLeft: 20 }}>
            <li>Digite o nome do personagem exatamente como no jogo;</li>
            <li>Selecione a sala (BC1–BC7 ou Ilusion);</li>
            <li>O check-in abre <strong style={{ color: 'var(--accent)' }}>25 minutos</strong> antes do evento;</li>
            <li>Limite: <strong>5 VIP</strong> + <strong>5 Principal</strong> por sala;</li>
            <li>Só se inscreva se tiver nível necessário e convite.</li>
          </ul>
        </div>
      </div>
    </>
  )
}
