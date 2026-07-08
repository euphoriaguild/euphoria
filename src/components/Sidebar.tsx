import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Trophy, Swords,
  Dice5, Globe, Zap, User, Shield, ClipboardList, LogOut,
} from 'lucide-react'
import { useClerk, useUser } from '@clerk/clerk-react'
import { useAuth } from '../contexts/AuthContext'

const GUILDS = ['Euphoria', 'Euphor1a', 'Jackson5', 'HellBoyz']

function guildClass(name: string) {
  const map: Record<string, string> = {
    Euphoria: 'guild-euphoria', Euphor1a: 'guild-euphor1a',
    Jackson5: 'guild-jackson5', HellBoyz: 'guild-hellboyz',
  }
  return map[name] ?? ''
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  staff: 'Staff',
  member: 'Membro',
  pending: 'Pendente',
}

export function Sidebar() {
  const { profile, isStaff } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()

  // Discord username via Clerk
  const discordAccount = user?.externalAccounts?.find(a => a.provider === 'discord')
  const displayName = profile?.nick_mudomix
    ?? discordAccount?.username
    ?? user?.username
    ?? user?.firstName
    ?? 'Usuário'
  const avatarUrl = profile?.avatar_url ?? user?.imageUrl

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>Euphoria</h1>
        <p>MU Domix · Season 2</p>
      </div>

      <nav className="sidebar-nav">
        <span className="nav-section-title">Principal</span>

        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <LayoutDashboard />
          Dashboard
        </NavLink>

        <NavLink to="/membros" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Users />
          Membros
        </NavLink>

        <NavLink to="/rankings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Trophy />
          Rankings
        </NavLink>

        <span className="nav-section-title">Guildas</span>
        {GUILDS.map(g => (
          <NavLink
            key={g}
            to={`/guilda/${g}`}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Shield />
            <span className={guildClass(g)}>{g}</span>
          </NavLink>
        ))}

        <span className="nav-section-title">Eventos</span>

        <NavLink to="/eventos" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Swords />
          Blood Castle / IT
        </NavLink>

        <NavLink to="/world-boss" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Globe />
          World Boss
        </NavLink>

        <NavLink to="/invasoes" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Zap />
          Invasões
        </NavLink>

        <span className="nav-section-title">Ferramentas</span>

        <NavLink to="/sorteio" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Dice5 />
          Sorteio
        </NavLink>

        <NavLink to="/perfil" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <User />
          Buscar Perfil
        </NavLink>

        {/* Staff only */}
        {isStaff && (
          <>
            <span className="nav-section-title">Staff</span>
            <NavLink to="/solicitacoes" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <ClipboardList />
              Solicitações
            </NavLink>
          </>
        )}
      </nav>

      {/* User info + logout */}
      {user && (
        <div style={{
          padding: '12px 14px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            }} />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--bg-600)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14,
            }}>👤</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.nick_mudomix ?? displayName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {ROLE_LABELS[profile?.role ?? ''] ?? profile?.role}
              {profile?.guild && ` · ${profile.guild}`}
            </div>
          </div>
          <button
            onClick={() => signOut()}
            title="Sair"
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              padding: 4, borderRadius: 4, display: 'flex', cursor: 'pointer',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <LogOut size={15} />
          </button>
        </div>
      )}
    </aside>
  )
}
