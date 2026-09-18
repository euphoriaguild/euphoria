import { useEffect, useState } from 'react'
import { Pencil, Save, X, ScrollText } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { StatuteMarkdown } from '../components/StatuteMarkdown'

export function Statute() {
  const { isStaff } = useAuth()
  const [content, setContent] = useState('')
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await api.getStatute()
      setContent(data.content)
      setUpdatedBy(data.updated_by)
      setUpdatedAt(data.updated_at)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function startEdit() {
    setDraft(content)
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await api.updateStatute(draft)
      setEditing(false)
      await load()
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar estatuto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Estatuto Interno</h2>
        {isStaff && !editing && (
          <button className="btn btn-ghost" onClick={startEdit}>
            <Pencil size={14} /> Editar
          </button>
        )}
        {isStaff && editing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={14} /> Salvar
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={saving}>
              <X size={14} /> Cancelar
            </button>
          </div>
        )}
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : (
          <div className="card">
            {updatedAt && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
                paddingBottom: 12, borderBottom: '1px solid var(--border)',
                fontSize: 11, color: 'var(--text-muted)',
              }}>
                <ScrollText size={13} />
                Última atualização{updatedBy ? ` por ${updatedBy}` : ''} em {new Date(updatedAt).toLocaleDateString('pt-BR')}
                {!editing && (
                  <span style={{ marginLeft: 'auto' }}>Formato: Markdown</span>
                )}
              </div>
            )}

            {editing ? (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Edite em Markdown: use # título, ## seção, - listas, **negrito**, etc.
                </p>
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={28}
                  placeholder={'# Estatuto Interno\n\n## 1. Conduta\n\n- Regra um\n- Regra dois\n'}
                  style={{
                    width: '100%', padding: '12px 14px', background: 'var(--bg-700)',
                    border: '1px solid var(--accent)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                    fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.6,
                    resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </>
            ) : (
              <StatuteMarkdown content={content} />
            )}
          </div>
        )}
      </div>
    </>
  )
}
