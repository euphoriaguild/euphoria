import ReactMarkdown from 'react-markdown'

/** Renderiza o estatuto como Markdown (conteúdo ainda vem de guild_statute.content). */
export function StatuteMarkdown({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
        Nenhum estatuto cadastrado ainda.
      </p>
    )
  }

  return (
    <div className="statute-md" style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px' }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--accent)', margin: '20px 0 8px' }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '16px 0 6px' }}>{children}</h3>
          ),
          p: ({ children }) => <p style={{ margin: '0 0 10px' }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '0 0 12px', paddingLeft: 20 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
          strong: ({ children }) => <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{children}</strong>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{children}</a>
          ),
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />,
          blockquote: ({ children }) => (
            <blockquote style={{
              margin: '0 0 12px', padding: '8px 12px',
              borderLeft: '3px solid var(--accent)', background: 'var(--bg-700)',
              color: 'var(--text-muted)',
            }}>
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code style={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
              background: 'var(--bg-700)', padding: '1px 5px', borderRadius: 4,
            }}>
              {children}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
