/**
 * AuthContext — sessão via Auth própria (Discord OAuth + JWT FastAPI).
 * Sem Supabase.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setAuthTokenGetter, type ProfileData } from '../lib/api'
import {
  clearSelfSession,
  loadSelfSession,
  saveSelfSession,
} from '../lib/authStorage'

export type UserRole = 'pending' | 'member' | 'staff' | 'admin' | 'rejected'
export type Profile = ProfileData

export type AuthUser = {
  id: string
  discordId: string | null
  discordUsername: string | null
  avatarUrl: string | null
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

interface AuthContextValue {
  user: AuthUser | null
  isLoaded: boolean
  isSignedIn: boolean
  profile: Profile | null
  loadingProfile: boolean
  isApproved: boolean
  isStaff: boolean
  needsOnboarding: boolean
  refreshProfile: () => Promise<void>
  signInWithDiscord: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

function userFromAccess(access: string): AuthUser {
  const payload = decodeJwtPayload(access) || {}
  return {
    id: String(payload.sub || ''),
    discordId: payload.discord_id ? String(payload.discord_id) : null,
    discordUsername: null,
    avatarUrl: null,
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  const cur = loadSelfSession()
  if (!cur?.refreshToken) return null
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: cur.refreshToken }),
    })
    if (!res.ok) {
      clearSelfSession()
      return null
    }
    const data = await res.json()
    saveSelfSession(data.access_token, data.refresh_token, data.expires_in ?? 3600)
    return data.access_token as string
  } catch {
    clearSelfSession()
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [accessTick, setAccessTick] = useState(0)

  useEffect(() => {
    setAuthTokenGetter(async () => {
      const cur = loadSelfSession()
      if (!cur) return null
      if (cur.expiresAt && Date.now() > cur.expiresAt - 60_000) {
        const next = await refreshAccessToken()
        if (next) setAccessTick((t) => t + 1)
        return next
      }
      return cur.accessToken
    })
  }, [])

  useEffect(() => {
    const cur = loadSelfSession()
    if (cur?.accessToken) {
      setUser(userFromAccess(cur.accessToken))
    } else {
      setUser(null)
    }
    setIsLoaded(true)
  }, [accessTick])

  async function fetchProfile() {
    if (!loadSelfSession()?.accessToken) {
      setProfile(null)
      setLoadingProfile(false)
      return
    }
    setLoadingProfile(true)
    try {
      const data = await api.getMyProfile()
      setProfile(data as Profile | null)
      // Enriquece identidade Discord a partir do profile
      setUser((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          discordId: data.discord_id || prev.discordId,
          discordUsername: data.discord_username || prev.discordUsername,
          avatarUrl: data.avatar_url || prev.avatarUrl,
        }
      })
    } catch {
      setProfile(null)
    }
    setLoadingProfile(false)
  }

  async function refreshProfile() {
    await fetchProfile()
  }

  useEffect(() => {
    if (!isLoaded) return
    fetchProfile()
  }, [isLoaded, user?.id, accessTick])

  async function signInWithDiscord() {
    window.location.href = `${API_BASE}/api/auth/discord/start`
  }

  async function signOut() {
    const cur = loadSelfSession()
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (cur?.accessToken) headers.Authorization = `Bearer ${cur.accessToken}`
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ refresh_token: cur?.refreshToken ?? null }),
      })
    } catch { /* ignore */ }
    clearSelfSession()
    setUser(null)
    setProfile(null)
  }

  const isSignedIn = !!user?.id && !!loadSelfSession()?.accessToken
  const isApproved = ['member', 'staff', 'admin'].includes(profile?.role ?? '')
  const isStaff = ['staff', 'admin'].includes(profile?.role ?? '')
  const needsOnboarding = isApproved && !profile?.onboarding_completed_at

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoaded,
        isSignedIn,
        profile,
        loadingProfile,
        isApproved,
        isStaff,
        needsOnboarding,
        refreshProfile,
        signInWithDiscord,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}

export function getDiscordIdentity(user: AuthUser | null, profile?: Profile | null) {
  return {
    discordUsername: user?.discordUsername || profile?.discord_username || null,
    discordId: user?.discordId || profile?.discord_id || null,
    avatarUrl: user?.avatarUrl || profile?.avatar_url || null,
  }
}
