import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Users, Trophy, Swords,
  Dice5, Globe, Coins, ClipboardList, LogOut, UserSearch,
  ShieldAlert, ClipboardCheck, ScrollText,
} from 'lucide-react'
import { useAuth, getDiscordIdentity } from '../contexts/AuthContext'
import { api } from '../lib/api'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  staff: 'Staff',
  member: 'Membro',
  pending: 'Pendente',
}

export function Sidebar() {
  const { profile, isStaff, user, signOut } = useAuth()
  const [altsVisible, setAltsVisible] = useState(false)
  const { discordUsername, avatarUrl: discordAvatar } = getDiscordIdentity(user, profile)

  useEffect(() => {
    if (isStaff) return
    api.getAltsVisibility()
      .then(d => setAltsVisible(d.visible_to_members))
      .catch(() => {})
  }, [isStaff])

  const canSeeAlts = isStaff || altsVisible

  const displayName = profile?.nick_mudomix
    ?? discordUsername
    ?? 'Usuário'
  const avatarUrl = profile?.avatar_url ?? discordAvatar
  const showUser = !!user

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

        <span className="nav-section-title">Eventos</span>

        <NavLink to="/eventos" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Swords />
          Blood Castle / IT
        </NavLink>

        <NavLink to="/world-boss" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Globe />
          World Boss
        </NavLink>

        <NavLink to="/presenca" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <ClipboardCheck />
          Presença
        </NavLink>

        <span className="nav-section-title">Ferramentas</span>

        <NavLink to="/sorteio" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Dice5 />
          Sorteio
        </NavLink>

        <NavLink to="/doacoes" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Coins />
          Doações
        </NavLink>

        <NavLink to="/estatuto" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <ScrollText />
          Estatuto
        </NavLink>

        {canSeeAlts && (
          <NavLink to="/contas-alts" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <UserSearch />
            Contas &amp; Alts
          </NavLink>
        )}

        {canSeeAlts && (
          <NavLink to="/blacklist" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <ShieldAlert />
            Blacklist
          </NavLink>
        )}

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
      {showUser && (
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
