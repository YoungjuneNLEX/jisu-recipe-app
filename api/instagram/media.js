// Proxy for Instagram media (images & videos) — adds CORS headers so browser canvas can read pixels
export const config = { runtime: 'edge' }

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

export default async function handler(req) {
  const url = new URL(req.url)
  const target = url.searchParams.get('url')
  if (!target) return new Response('missing url', { status: 400 })

  const fetchHeaders = {
    'User-Agent': UA,
    'Referer': 'https://www.instagram.com/',
  }
  // Pass through Range header so video seeking works
  const range = req.headers.get('range')
  if (range) fetchHeaders['Range'] = range

  const res = await fetch(decodeURIComponent(target), { headers: fetchHeaders })

  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Headers', 'Range')
  headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')

  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = res.headers.get(h)
    if (v) headers.set(h, v)
  }

  return new Response(res.body, { status: res.status, headers })
}
