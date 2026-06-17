export const config = { runtime: 'edge' }

export default async function handler(req) {
  const url = new URL(req.url)
  const imgPath = url.pathname.replace(/^\/api\/ytimg/, '')
  const targetUrl = `https://i.ytimg.com${imgPath}${url.search}`

  const res = await fetch(targetUrl)
  const body = await res.arrayBuffer()

  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, max-age=3600')
  const ct = res.headers.get('content-type')
  if (ct) headers.set('content-type', ct)

  return new Response(body, { status: res.status, headers })
}
