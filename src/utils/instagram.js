export function isInstagramUrl(url) {
  return /instagram\.com\/(p|reel|reels)\//.test(url)
}

export function extractInstagramId(url) {
  const match = url.match(/instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/)
  return match ? match[1] : null
}

export async function fetchInstagramPostInfo(postId) {
  try {
    const res = await fetch(
      `https://api.instagram.com/oembed/?url=https://www.instagram.com/p/${postId}/&format=json`
    )
    if (res.ok) {
      const data = await res.json()
      return {
        title: data.title || '인스타그램 레시피',
        author: data.author_name || '',
        thumbnail: data.thumbnail_url || null,
      }
    }
  } catch { /* fall through */ }

  return { title: '인스타그램 레시피', author: '', thumbnail: null }
}

export async function extractInstagramRecipeWithClaude(url, apiKey, setMessage) {
  setMessage('Claude가 인스타그램 레시피를 분석하는 중...')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `인스타그램 게시물(${url})을 저장합니다. 직접 입력할 수 있는 빈 레시피 템플릿을 아래 JSON으로만 반환하세요.

{"ingredients":[],"sauce":[],"steps":[],"servings":null,"time":null,"note":"재료와 조리 순서를 직접 입력해 주세요 ✏️"}`,
      }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API 오류 ${response.status}`)
  }

  const data = await response.json()
  const text = data.content[0].text.trim()
  const jsonMatch = text.match(/\{[\s\S]+\}/)
  if (!jsonMatch) return null
  return JSON.parse(jsonMatch[0])
}
