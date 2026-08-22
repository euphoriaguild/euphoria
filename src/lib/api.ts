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
  getRaffleHistory: (limit = 20, offset = 0) =>
    apiFetch<RaffleHistoryEntry[]>(`/api/raffle/history?limit=${limit}&offset=${offset}`),
  saveRaffle: (item: string, winner: string, participants: string[]) =>
    apiFetch<RaffleHistoryEntry>('/api/raffle/save', { method: 'POST', body: JSON.stringify({ item, winner, participants }) }),

  // World Boss
  getWorldBossToday: () => apiFetch<WorldBossToday>('/api/worldboss/today'),
  worldBossCheckin: () => apiFetch<{ ok: boolean; already_checked_in: boolean }>('/api/worldboss/checkin', { method: 'POST' }),
  worldBossCancelCheckin: () => apiFetch('/api/worldboss/checkin', { method: 'DELETE' }),
  getWorldBossCheckins: (date?: string) =>
    apiFetch<WorldBossCheckin[]>(`/api/worldboss/checkins${date ? `?date=${date}` : ''}`),
  getWorldBossParties: (date?: string) =>
    apiFetch<WorldBossPartiesData>(`/api/worldboss/parties${date ? `?date=${date}` : ''}`),
  saveWorldBossParties: (parties: WorldBossParty[]) =>
    apiFetch('/api/worldboss/parties', { method: 'PUT', body: JSON.stringify({ parties }) }),

  // Perfil / aprovação — passam pelo backend com Clerk JWT
  getMyProfile: () => apiFetch<ProfileData>('/api/profile/me'),
  saveProfile: (data: { nick_mudomix: string; guild: string; discord_username?: string; discord_id?: string; avatar_url?: string }) =>
    apiFetch('/api/profile', { method: 'POST', body: JSON.stringify(data) }),
  getPendingMembers: () => apiFetch<PendingMember[]>('/api/profile/pending'),
  approveProfile: (clerk_id: string, role: string) =>
    apiFetch('/api/profile/approve', { method: 'POST', body: JSON.stringify({ clerk_id, role }) }),

  // Admin — gerenciar membros
  getAllMembersAdmin: () => apiFetch<AdminMember[]>('/api/members/all/admin'),
  updateMember: (nick: string, data: { char_class?: string; resets?: number; level?: number }) =>
    apiFetch(`/api/members/${encodeURIComponent(nick)}`, { method: 'PATCH', body: JSON.stringify({ nick_mudomix: nick, ...data }) }),

  // Sorteio (self-service)
  getActiveRaffle: () => apiFetch<ActiveRaffle>('/api/raffle/active'),
  createRaffle: (prize: string) =>
    apiFetch<RaffleData>('/api/raffle/create', { method: 'POST', body: JSON.stringify({ prize }) }),
  editRaffle: (prize: string) =>
    apiFetch('/api/raffle/edit', { method: 'POST', body: JSON.stringify({ prize }) }),
  closeRaffle: () => apiFetch('/api/raffle/close', { method: 'POST' }),
  joinRaffle: () => apiFetch<{ ok: boolean; nick: string }>('/api/raffle/join', { method: 'POST' }),
  leaveRaffle: () => apiFetch('/api/raffle/leave', { method: 'POST' }),
  drawRaffle: (winner: string) =>
    apiFetch('/api/raffle/draw', { method: 'POST', body: JSON.stringify({ winner }) }),

  // Doações de Zen
  getDonations: () => apiFetch<DonationsData>('/api/donations'),
  setDonationConfig: (weekly_amount: string) =>
    apiFetch('/api/donations/config', { method: 'POST', body: JSON.stringify({ weekly_amount }) }),
  toggleDonation: (nick_mudomix: string, paid: boolean) =>
    apiFetch('/api/donations/toggle', { method: 'POST', body: JSON.stringify({ nick_mudomix, paid }) }),

  // Contas & Alts
  getAltsVisibility: () => apiFetch<AltsVisibility>('/api/alts/visibility'),
  setAltsVisibility: (visible_to_members: boolean) =>
    apiFetch('/api/alts/visibility', { method: 'POST', body: JSON.stringify({ visible_to_members }) }),
  getAlts: () => apiFetch<AltsData>('/api/alts'),
  createAlt: (data: { main_nick: string; alt_nick: string; side: 'euphoria' | 'enemy'; notes?: string }) =>
    apiFetch<AltEntry>('/api/alts', { method: 'POST', body: JSON.stringify(data) }),
  updateAlt: (id: number, data: Partial<{ main_nick: string; alt_nick: string; side: 'euphoria' | 'enemy'; notes: string }>) =>
    apiFetch(`/api/alts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAlt: (id: number) =>
    apiFetch(`/api/alts/${id}`, { method: 'DELETE' }),
}

export interface AltsVisibility {
  visible_to_members: boolean
  is_staff: boolean
}

export interface AltEntry {
  id: number
  main_nick: string
  alt_nick: string
  side: 'euphoria' | 'enemy'
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface AltsData {
  visible_to_members: boolean
  is_staff: boolean
  entries: AltEntry[]
}

export interface RaffleData {
  id: number
  prize: string
  status: string
  winner_nick: string | null
  created_at: string
}

export interface ActiveRaffle {
  raffle: RaffleData | null
  participants: string[]
  joined: boolean
  my_nick: string | null
}

export interface DonationMember {
  nick_mudomix: string
  char_class: string
  paid: boolean
}

export interface DonationsData {
  week_start: string
  weekly_amount: string
  members: DonationMember[]
}

export interface RaffleHistoryEntry {
  id: number
  prize: string
  winner_nick: string
  winner_guild?: string
  conducted_by?: string
  participants: string[]
  created_at: string
}

export interface WorldBossToday {
  boss_name: string | null
  boss_date: string
  emoji: string | null
  event_time: string
  checkin_open: boolean
  weekday: number
}

export interface WorldBossCheckin {
  id: number
  nick_mudomix: string
  guild: string | null
  char_class: string | null
  boss_name: string
  created_at: string
}

export interface WorldBossParty {
  name: string
  members: string[]
}

export interface WorldBossPartiesData {
  parties: WorldBossParty[]
  boss_name: string | null
  updated_at?: string
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

export interface AdminMember {
  name: string
  char_class: string
  resets: number
  level: number
  role: string
  discord: string
  approved: boolean
}
