/** Sessão local (AUTH_PROVIDER=self) — access + refresh em localStorage. */

const ACCESS_KEY = 'euphoria_access_token'
const REFRESH_KEY = 'euphoria_refresh_token'
const EXPIRES_KEY = 'euphoria_expires_at'

export type SelfSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export function loadSelfSession(): SelfSession | null {
  const accessToken = localStorage.getItem(ACCESS_KEY)
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  const expiresAt = Number(localStorage.getItem(EXPIRES_KEY) || 0)
  if (!accessToken || !refreshToken) return null
  return { accessToken, refreshToken, expiresAt }
}

export function saveSelfSession(access: string, refresh: string, expiresInSec: number) {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + expiresInSec * 1000))
}

export function clearSelfSession() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(EXPIRES_KEY)
}

export function parseHashTokens(hash: string): { access_token?: string; refresh_token?: string; expires_in?: number } {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(raw)
  const expires = params.get('expires_in')
  return {
    access_token: params.get('access_token') || undefined,
    refresh_token: params.get('refresh_token') || undefined,
    expires_in: expires ? Number(expires) : undefined,
  }
}
