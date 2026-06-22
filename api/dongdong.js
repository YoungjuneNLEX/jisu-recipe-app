import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const { message, context } = body
  if (!message) return new Response('message required', { status: 400 })

  const { time, weather, location, recipes } = context || {}

  const systemPrompt = `너는 "동동이"야. 귀엽고 친근한 음식 추천 도우미야. 한국어로 대화하고, 따뜻하고 친근한 말투를 써. 이모지를 적절히 사용해.

현재 상황 정보:
- 시간: ${time || '알 수 없음'}
- 날씨: ${weather || '알 수 없음'}
- 위치: ${location || '알 수 없음'}

사용자가 저장한 레시피 목록: ${recipes?.length ? recipes.map(r => r.title).join(', ') : '없음'}

역할:
1. 아침/점심/저녁/야식/간식/외식 메뉴 추천 시 → 현재 시간, 날씨, 계절을 고려해서 2~3가지 구체적인 메뉴를 추천해줘. 추천 이유도 간단히 설명해.
2. 냉장고 재료를 알려주면 → 그 재료로 만들 수 있는 메뉴와 간단한 조리법을 알려줘.
3. 외식 장소 추천 시 → 현재 날씨와 분위기에 맞는 음식 종류를 추천해줘.
4. 사용자 레시피 중 관련된 것이 있으면 언급해줘.

답변은 짧고 친근하게, 너무 길지 않게 해줘. 마크다운 헤더(#, ##)는 쓰지 말고, 볼드(**텍스트**)는 사용해도 돼.`

  try {
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    console.error('dongdong error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
