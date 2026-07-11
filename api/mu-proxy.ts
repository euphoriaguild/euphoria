import type { VercelRequest, VercelResponse } from '@vercel/node'

const ALLOWED_HOST = 'mudomix.com'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { path } = req.query
  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'path obrigatório' })
  }

  const safePath = path.startsWith('/') ? path : '/' + path
  const url = `https://${ALLOWED_HOST}${safePath}`

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
        'Cache-Control': 'no-cache',
      },
    })

    if (!response.ok) {
      return res.status(502).json({ error: `Upstream HTTP ${response.status}` })
    }

    const html = await response.text()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    return res.status(200).send(html)
  } catch (err: any) {
    return res.status(502).json({ error: String(err.message) })
  }
}

