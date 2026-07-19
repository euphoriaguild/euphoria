import { useEffect, useState } from 'react'

/**
 * Retorna o horário atual de Brasília usando Intl (sem API externa).
 * Atualiza a cada segundo.
 */
export function useHorarioBrasilia() {
  const [agora, setAgora] = useState<Date | null>(null)

  useEffect(() => {
    function tick() {
      const now = new Date()
      const brasiliaStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
      setAgora(new Date(brasiliaStr))
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return agora
}
