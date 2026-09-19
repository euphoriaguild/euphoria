import { useEffect, useState } from 'react'
import { MODOS, LABELS, MINUTOS_ANTES, type CanalKey, type ModoKey } from '../config'
import { eventoAtual } from '../lib/eventos'
import { api } from '../lib/api'

type Props = {
  agora: Date | null
  modo: ModoKey
  onSuccess?: () => void
}

export function CheckinForm({ agora, modo, onSuccess }: Props) {
  const canais = MODOS[modo].canais
  const [nome, setNome] = useState('')
  const [canal, setCanal] = useState<CanalKey>(canais[0])
  const [enviando, setEnviando] = useState(false)

  useEffect(() => { setCanal(canais[0]) }, [modo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { alert('Digite o nome do personagem'); return }
    if (!agora) { alert('Aguarde a sincronização do horário'); return }
    const evento = eventoAtual(agora, MODOS[modo].horarios)
    if (!evento) {
      alert(`Check-in disponível apenas ${MINUTOS_ANTES} minutos antes do evento (horário de Brasília).`)
      return
    }
    setEnviando(true)
    try {
      const data = await api.createCheckin({
        player: nome.trim(),
        canal,
      })
      alert(data?.message ?? 'Check-in realizado!')
      setNome('')
      onSuccess?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao registrar'
      alert(msg.replace(/^API error \d+: \/api\/checkins — /, '') || 'Erro ao registrar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome do personagem"
        style={{
          flex: 1, minWidth: 180, padding: '8px 14px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg-600)',
          color: 'var(--text-primary)', fontSize: 14, outline: 'none',
        }}
      />
      {canais.length > 1 && (
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value as CanalKey)}
          style={{
            padding: '8px 14px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg-600)',
            color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer',
          }}
        >
          {canais.map((c) => <option key={c} value={c}>{LABELS[c]}</option>)}
        </select>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="btn btn-primary"
        style={{ padding: '8px 20px', fontSize: 14 }}
      >
        {enviando ? 'Enviando...' : 'Fazer Check-in'}
      </button>
    </form>
  )
}
