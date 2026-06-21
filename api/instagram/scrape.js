export const config = { runtime: 'edge' }

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  if (!code) {
    return new Response(JSON.stringify({ error: 'code required' }), { status: 400 })
  }

  const apiKey = process.env.RAPIDAPI_INSTAGRAM_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 })
  }

  const res = await fetch(
    `https://instagram-scraper-stable-api.p.rapidapi.com/get_media_data_v2.php?media_code=${encodeURIComponent(code)}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': 'instagram-scraper-stable-api.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
      },
    }
  )

  const data = await res.json()
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
