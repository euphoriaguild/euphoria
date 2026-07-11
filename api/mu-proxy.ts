import type { VercelRequest, VercelResponse } from '@vercel/node'
import https from 'https'

// Proxy seguro: só permite URLs do mudomix.com
const ALLOWED_HOST = 'mudomix.com'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { path } = req.query
  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'path obrigatório' })
  }

  // Segurança: valida que o path é do mudomix.com
  const url = `https://${ALLOWED_HOST}${path.startsWith('/') ? path : '/' + path}`
  try {
    const new URL(url)
  } catch {
    return res.status(400).json({ error: 'path inválido' })
  }
  if (!new URL(url).hostname.endsWith(ALLOWED_HOST)) {
    return res.status(403).json({ error: 'host não permitido' })
  }

  try {
    const html = await fetchUrl(url)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    return res.status(200).send(html)
  } catch (err: any) {
    return res.status(502).json({ error: `Proxy error: ${err.message}` })
  }
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      },
    }
    https.get(url, options, (resp) => {
      // Seguir redirect
      if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        return fetchUrl(resp.headers.location).then(resolve).catch(reject)
      }
      if (resp.statusCode !== 200) {
        return reject(new Error(`HTTP ${resp.statusCode}`))
      }
      const chunks: Buffer[] = []
      resp.on('data', (c) => chunks.push(c))
      resp.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      resp.on('error', reject)
    }).on('error', reject)
  })
}
