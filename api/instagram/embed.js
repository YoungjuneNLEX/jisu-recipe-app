// Proxy for Instagram embed pages — avoids CORS and login walls
export const config = { runtime: 'edge' }

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

export default async function handler(req) {
  const url = new URL(req.url)
  const postId = url.searchParams.get('id')
  if (!postId) return new Response('missing id', { status: 400 })

  const embedUrl = `https://www.instagram.com/p/${postId}/embed/`

  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Referer': 'https://www.instagram.com/',
    },
  })

  const body = await res.arrayBuffer()
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', res.headers.get('content-type') || 'text/html')
  return new Response(body, { status: res.status, headers })
}
