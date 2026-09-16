import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { CanalKey } from '../config'

export type Checkin = {
  id: number
  player: string
  canal: CanalKey
  created_at: string
  evento?: string
}

export function useCheckins() {
  const [checkins, setCheckins] = useState<Checkin[]>([])

  const carregar = useCallback(async () => {
    try {
      const data = await api.getCheckins()
      setCheckins(data as Checkin[])
    } catch (err) {
      console.error('Erro ao carregar checkins:', err)
    }
  }, [])

  useEffect(() => {
    carregar()
    // Polling (substitui Realtime do Supabase)
    const tickId = setInterval(carregar, 60_000)
    return () => clearInterval(tickId)
  }, [carregar])

  return { checkins, recarregar: carregar }
}
