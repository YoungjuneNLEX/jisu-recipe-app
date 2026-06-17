export const config = { runtime: 'edge' }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export default async function handler(req) {
  const url = new URL(req.url)
  // Strip /api/youtube prefix to get the real YouTube path
  const youtubePath = url.pathname.replace(/^\/api\/youtube/, '')
  const targetUrl = `https://www.youtube.com${youtubePath}${url.search}`

  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      // Skip YouTube's EU "Before you continue" consent interstitial, which it
      // otherwise serves to datacenter IPs and which breaks title/transcript parsing.
      'Cookie': 'CONSENT=YES+1; SOCS=CAI',
    },
  })

  const body = await res.arrayBuffer()
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const ct = res.headers.get('content-type')
  if (ct) headers.set('content-type', ct)

  return new Response(body, { status: res.status, headers })
}
