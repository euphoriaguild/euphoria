import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, type GuildInfo } from '../lib/api'

const CLASS_COLORS: Record<string, string> = {
  'Blade Knight': 'class-bk', 'Soul Master': 'class-sm',
  'Muse Elf': 'class-me', 'Dark Lord': 'class-dl',
  'Magic Gladiator': 'class-mg', 'Dark Wizard': 'class-dw',
}

const GUILD_COLORS: Record<string, string> = {
  Euphoria: 'guild-euphoria', Euphor1a: 'guild-euphor1a',
  Jackson5: 'guild-jackson5', HellBoyz: 'guild-hellboyz',
}

export function GuildPage() {
  const { name = '' } = useParams<{ name: string }>()
  const [guild, setGuild] = useState<GuildInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    api.getGuild(name)
      .then(setGuild)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [name])

  const members = (guild?.members ?? []).filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => b.resets - a.resets)

  const avgResets = guild
    ? Math.round(members.reduce((s, m) => s + m.resets, 0) / Math.max(members.length, 1))
    : 0

  return (
    <>
      <div className="page-header">
        <h2 className={GUILD_COLORS[name] ?? ''}>{name}</h2>
        <Link to="/membros" style={{ fontSize: 12, color: 'var(--text-muted)' }}>← Todos os membros</Link>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : guild ? (
          <>
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              <div className="stat-card">
                <div className="stat-label">Mestre</div>
                <div className="stat-value" style={{ fontSize: 18 }}>
                  <Link to={`/perfil/${guild.master}`} style={{ color: 'var(--accent)' }}>{guild.master}</Link>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Membros</div>
                <div className="stat-value">{guild.member_count}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Média Resets</div>
                <div className="stat-value">{avgResets}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Pontuação</div>
                <div className="stat-value">{guild.points}</div>
              </div>
            </div>

            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar membro..."
              style={{
                width: '100%', marginBottom: 12, padding: '8px 12px',
                background: 'var(--bg-700)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none',
              }}
            />

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Personagem</th>
                    <th>Classe</th>
                    <th>Resets</th>
                    <th>Level</th>
                    <th>Cargo</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => (
                    <tr key={m.name}>
                      <td><span className="rank-pos">{i + 1}</span></td>
                      <td>
                        <Link to={`/perfil/${m.name}`} style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          {m.name}
                        </Link>
                      </td>
                      <td className={CLASS_COLORS[m.char_class] ?? ''}>{m.char_class}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{m.resets}</td>
                      <td>{m.level}</td>
                      <td>
                        <span className={`badge ${m.member_level === 'Master' ? 'badge-master' : 'badge-member'}`}>
                          {m.member_level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="loading">Guilda não encontrada ou backend offline.</div>
        )}
      </div>
    </>
  )
}
