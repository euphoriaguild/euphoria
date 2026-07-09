import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { MODOS, LABELS, type CanalKey, type ModoKey } from '../config'
import { eventoAtual } from '../lib/eventos'

type Props = {
  agora: Date | null
  modo: ModoKey
}

export function CheckinForm({ agora, modo }: Props) {
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
    if (!evento) { alert('Check-in disponível apenas 25 minutos antes do evento.'); return }
    setEnviando(true)
    const { data, error } = await supabase.rpc('fazer_checkin', {
      p_player: nome.trim(), p_canal: canal, p_evento: evento.toISOString(),
    })
    setEnviando(false)
    if (error) { alert('Erro ao registrar'); return }
    alert(data?.message ?? 'Check-in realizado!')
    setNome('')
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
