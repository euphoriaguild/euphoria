import { MODOS, type ModoKey } from '../config'

type Props = {
  modo: ModoKey
  onChange: (m: ModoKey) => void
}

export function ModoTabs({ modo, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      {(Object.keys(MODOS) as ModoKey[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: m === modo ? '1px solid var(--border-accent)' : '1px solid var(--border)',
            background: m === modo ? 'rgba(201,168,76,0.12)' : 'var(--bg-700)',
            color: m === modo ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: m === modo ? 700 : 400,
            fontSize: 13,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {MODOS[m].label}
        </button>
      ))}
    </div>
  )
}
