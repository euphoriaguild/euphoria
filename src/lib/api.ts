// Centraliza as chamadas ao backend Python
// O token Clerk é injetado via setClerkTokenGetter() no AuthProvider
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Token getter injetado pelo AuthProvider ao inicializar
let _getClerkToken: (() => Promise<string | null>) | null = null

export function setClerkTokenGetter(fn: () => Promise<string | null>) {
  _getClerkToken = fn
}

export interface GuildMember {
  name: string
  char_class: string
  resets: number
  level: number
  member_level: 'Master' | 'Member'
  guild: string
}

export interface GuildInfo {
  name: string
  master: string
  points: number
  member_count: number
  members: GuildMember[]
}

export interface AllianceData {
  guilds: GuildInfo[]
  total_members: number
  total_resets: number
  top_reset: GuildMember | null
  online_count: number
  last_updated: string
}

export interface RankingEntry {
  position: number
  name: string
  char_class: string
  guild: string | null
  resets: number
  vip: boolean
  online: boolean
}

export interface AllianceStats {
  total_members: number
  total_resets: number
  avg_resets: number
  class_distribution: Record<string, number>
  guild_distribution: Record<string, number>
  top10_resets: GuildMember[]
  last_updated: string
}

export interface CharacterProfile {
  name: string
  char_class: string
  resets: number
  level: number
  map?: string
  status?: string
  guild?: string
  avatar_url?: string
  equipment: string[]
  profile_blocked: boolean
  blocked_until?: string
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = _getClerkToken ? await _getClerkToken() : null

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export const api = {
  getAlliance: () => apiFetch<AllianceData>('/api/alliance'),
  getGuilds: () => apiFetch<GuildInfo[]>('/api/guilds'),
  getGuild: (name: string) => apiFetch<GuildInfo>(`/api/guilds/${name}`),
  getAllMembers: (sort = 'resets', order = 'desc') =>
    apiFetch<GuildMember[]>(`/api/members/all?sort_by=${sort}&order=${order}`),
  getCharacter: (name: string) => apiFetch<CharacterProfile>(`/api/characters/${name}`),
  getRankings: (mode = 'resets', guild?: string) => {
    const params = new URLSearchParams({ mode })
    if (guild) params.set('guild_filter', guild)
    return apiFetch<RankingEntry[]>(`/api/rankings?${params}`)
  },
  getAllianceRankings: () => apiFetch<RankingEntry[]>('/api/rankings/alliance'),
  getStats: () => apiFetch<AllianceStats>('/api/stats/alliance'),
  refresh: () => apiFetch('/api/refresh', { method: 'POST' }),

  // Raffle
  getRaffleHistory: () => apiFetch<RaffleHistoryEntry[]>('/api/raffle/history'),
  saveRaffle: (item: string, winner: string, participants: string[]) =>
    apiFetch<RaffleHistoryEntry>('/api/raffle/save', { method: 'POST', body: JSON.stringify({ item, winner, participants }) }),

  // Perfil / aprovação — passam pelo backend com Clerk JWT
  getMyProfile: () => apiFetch<ProfileData>('/api/profile/me'),
  saveProfile: (data: { nick_mudomix: string; guild: string; discord_username?: string; discord_id?: string; avatar_url?: string }) =>
    apiFetch('/api/profile', { method: 'POST', body: JSON.stringify(data) }),
  getPendingMembers: () => apiFetch<PendingMember[]>('/api/profile/pending'),
  approveProfile: (clerk_id: string, role: string) =>
    apiFetch('/api/profile/approve', { method: 'POST', body: JSON.stringify({ clerk_id, role }) }),
}

export interface RaffleHistoryEntry {
  id: number
  item: string
  winner: string
  participants: string[]
  drawn_at: string
}

export interface ProfileData {
  clerk_id: string
  discord_username: string | null
  discord_id: string | null
  avatar_url: string | null
  nick_mudomix: string | null
  guild: string | null
  role: string
  approved_at: string | null
}

export interface PendingMember {
  clerk_id: string
  discord_username: string | null
  avatar_url: string | null
  nick_mudomix: string | null
  guild: string | null
  created_at: string
}
