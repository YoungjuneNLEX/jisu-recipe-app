export const config = { runtime: 'edge' }

// Shared cloud store for recipes so the same list shows on every device.
// Backed by a Vercel KV / Upstash Redis REST store. If the store isn't
// configured (env vars missing), the endpoints degrade to a no-op so the app
// keeps working in local-only mode.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'jisu:recipes'

const JSON_HEADERS = { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' }

export default async function handler(req) {
  if (req.method === 'GET') {
    const recipes = (await kvGet()) || []
    return json({ recipes, cloud: !!KV_URL })
  }

  if (req.method === 'POST') {
    let incoming = []
    try {
      const body = await req.json()
      if (Array.isArray(body?.recipes)) incoming = body.recipes
    } catch { /* empty/invalid body */ }

    if (!KV_URL || !KV_TOKEN) {
      return json({ recipes: incoming, cloud: false })
    }

    const current = (await kvGet()) || []
    const merged = mergeLists(current, incoming)
    await kvSet(merged)
    return json({ recipes: merged, cloud: true })
  }

  return new Response('Method not allowed', { status: 405, headers: JSON_HEADERS })
}

function json(obj) {
  return new Response(JSON.stringify(obj), { headers: JSON_HEADERS })
}

// Last-write-wins merge by id (tombstones included so deletes propagate)
function mergeLists(a, b) {
  const map = new Map()
  for (const r of [...(a || []), ...(b || [])]) {
    if (!r || !r.id) continue
    const prev = map.get(r.id)
    if (!prev || (r.updatedAt || 0) >= (prev.updatedAt || 0)) map.set(r.id, r)
  }
  return [...map.values()].sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))
}

async function kvGet() {
  if (!KV_URL || !KV_TOKEN) return null
  try {
    const res = await fetch(`${KV_URL}/get/${KEY}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    })
    if (!res.ok) return null
    const { result } = await res.json()
    if (!result) return []
    return JSON.parse(result)
  } catch {
    return null
  }
}

async function kvSet(list) {
  if (!KV_URL || !KV_TOKEN) return
  try {
    await fetch(`${KV_URL}/set/${KEY}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(list),
    })
  } catch { /* ignore — client keeps local copy */ }
}
