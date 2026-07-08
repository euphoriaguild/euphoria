/**
 * AuthContext — usa Clerk para sessão e Supabase apenas como banco de dados.
 * O profile (nick, guilda, role) fica na tabela `profiles` do Supabase,
 * identificado pelo clerk_id (ex: "user_2abc...").
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useUser, useAuth as useClerkAuth } from '@clerk/clerk-react'
import { supabase } from '../supabase'
import { setClerkTokenGetter } from '../lib/api'

export type UserRole = 'pending' | 'member' | 'staff' | 'admin' | 'rejected'

export interface Profile {
  clerk_id: string
  discord_username: string | null   // username do Discord via Clerk
  discord_id: string | null         // ID do Discord via Clerk
  avatar_url: string | null
  nick_mudomix: string | null
  guild: string | null
  role: UserRole
  approved_at: string | null
}

interface AuthContextValue {
  profile: Profile | null
  loadingProfile: boolean
  isApproved: boolean
  isStaff: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser()
  const { getToken } = useClerkAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Injeta o getter de token do Clerk no módulo de API
  useEffect(() => {
    setClerkTokenGetter(() => getToken())
  }, [getToken])

  async function fetchProfile() {
    if (!user) { setProfile(null); setLoadingProfile(false); return }
    setLoadingProfile(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('clerk_id', user.id)
      .single()
    setProfile(data as Profile | null)
    setLoadingProfile(false)
  }

  async function refreshProfile() { await fetchProfile() }

  useEffect(() => {
    if (isLoaded) fetchProfile()
  }, [user?.id, isLoaded])

  const isApproved = ['member', 'staff', 'admin'].includes(profile?.role ?? '')
  const isStaff = ['staff', 'admin'].includes(profile?.role ?? '')

  return (
    <AuthContext.Provider value={{ profile, loadingProfile, isApproved, isStaff, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
