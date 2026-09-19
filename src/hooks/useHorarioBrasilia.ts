import { useEffect, useState } from 'react'
import { api } from '../lib/api'

/**
 * Horário de Brasília sincronizado com o servidor (não dá para burlar só mudando o relógio local).
 * offsetMs = unix_servidor - Date.now() → agora_efetivo = Date.now() + offsetMs
 */
export function useHorarioBrasilia() {
  const [agora, setAgora] = useState<Date | null>(null)
  const [offsetMs, setOffsetMs] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function sync() {
      try {
        const t = await api.getServerTime()
        if (cancelled) return
        setOffsetMs(t.unix_ms - Date.now())
      } catch (err) {
        console.warn('Falha ao sincronizar horário do servidor; usando fallback BRT local', err)
      }
    }

    sync()
    const syncId = setInterval(sync, 60_000)
    return () => {
      cancelled = true
      clearInterval(syncId)
    }
  }, [])

  useEffect(() => {
    function tick() {
      const corrected = new Date(Date.now() + offsetMs)
      const brasiliaStr = corrected.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
      setAgora(new Date(brasiliaStr))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [offsetMs])

  return agora
}
