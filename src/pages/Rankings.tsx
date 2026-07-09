import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type RankingEntry } from '../lib/api'

const CLASS_COLORS: Record<string, string> = {
  'Blade Knight': 'class-bk',
  'Soul Master': 'class-sm',
  'Muse Elf': 'class-me',
  'Dark Lord': 'class-dl',
  'Magic Gladiator': 'class-mg',
  'Dark Wizard': 'class-dw',
}

const GUILD_COLORS: Record<string, string> = {
  Euphoria: 'guild-euphoria',
  Euphor1a: 'guild-euphor1a',
  Jackson5: 'guild-jackson5',
  HellBoyz: 'guild-hellboyz',
}

const ALLIANCE_GUILDS = new Set(['Euphoria', 'Euphor1a', 'Jackson5', 'HellBoyz'])

export function Rankings() {
  const [rankings, setRankings] = useState<RankingEntry[]>([])
  const [allianceOnly, setAllianceOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    api.getRankings().then(data => {
      setRankings(data)
      setLoading(false)
    }).catch(e => { console.error(e); setLoading(false) })
  }, [])

  const filtered = rankings.filter(r => {
    const matchSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.guild ?? '').toLowerCase().includes(search.toLowerCase())
    const matchAlliance = !allianceOnly || ALLIANCE_GUILDS.has(r.guild ?? '')
    return matchSearch && matchAlliance
  })

  return (
    <>
      <div className="page-header">
        <h2>Rankings</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} personagens
        </span>
      </div>

      <div className="page-body">
        {/* Controles */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="tabs">
            <button className={`tab ${!allianceOnly ? 'active' : ''}`} onClick={() => setAllianceOnly(false)}>
              Global (Top 100)
            </button>
            <button className={`tab ${allianceOnly ? 'active' : ''}`} onClick={() => setAllianceOnly(true)}>
              Apenas Aliança
            </button>
          </div>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar por nome ou guilda..."
            style={{
              padding: '7px 12px', background: 'var(--bg-700)',
              border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text-primary)', fontSize: 13, outline: 'none',
              minWidth: 220,
            }}
          />
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Personagem</th>
                  <th>Classe</th>
                  <th>Guilda</th>
                  <th>Resets</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const inAlliance = ALLIANCE_GUILDS.has(r.guild ?? '')
                  return (
                    <tr key={r.name} style={inAlliance ? { background: 'rgba(201,168,76,0.04)' } : {}}>
                      <td>
                        <span className={`rank-pos ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>
                          {r.position}
                        </span>
                      </td>
                      <td>
                        <Link to={`/perfil/${r.name}`} style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          {r.name}
                        </Link>
                        {r.vip && <span className="badge badge-vip" style={{ marginLeft: 6 }}>VIP</span>}
                      </td>
                      <td className={CLASS_COLORS[r.char_class] ?? ''}>{r.char_class}</td>
                      <td>
                        {r.guild ? (
                          <span className={GUILD_COLORS[r.guild] ?? ''} style={{ fontWeight: inAlliance ? 600 : 400 }}>
                            {r.guild}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{r.resets}</td>
                      <td>
                        <span className={`badge ${r.online ? 'badge-online' : 'badge-offline'}`}>
                          {r.online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
