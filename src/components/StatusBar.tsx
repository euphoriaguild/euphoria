import { MODOS, type ModoKey } from '../config'
import { eventoAtual, proximoEvento, formatarHora } from '../lib/eventos'

type Props = {
  agora: Date | null
  modo: ModoKey
}

export function StatusBar({ agora, modo }: Props) {
  const horarios = MODOS[modo].horarios
  const sigla = MODOS[modo].siglaProximo

  if (!agora) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sincronizando horário...</div>

  const evento = eventoAtual(agora, horarios)
  const proximo = proximoEvento(agora, horarios)
  const aberto = !!evento

  let contadorTxt: string
  if (evento) {
    const diff = evento.getTime() - agora.getTime()
    contadorTxt = `Evento começa em: ${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`
  } else {
    const diff = proximo.getTime() - agora.getTime()
    contadorTxt = `Próximo ${sigla}: ${formatarHora(proximo)} (abre em ${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m)`
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Horário de Brasília:
        <strong style={{ color: 'var(--text-primary)', marginLeft: 6 }}>{agora.toLocaleTimeString('pt-BR')}</strong>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px', borderRadius: 20,
        fontSize: 12, fontWeight: 700,
        background: aberto ? 'rgba(72,187,120,0.12)' : 'rgba(245,101,101,0.12)',
        color: aberto ? 'var(--green)' : 'var(--red)',
        border: `1px solid ${aberto ? 'rgba(72,187,120,0.3)' : 'rgba(245,101,101,0.3)'}`,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
          background: aberto ? 'var(--green)' : 'var(--red)' }} />
        {aberto ? 'CHECK-IN ABERTO' : 'CHECK-IN FECHADO'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{contadorTxt}</div>
    </div>
  )
}
