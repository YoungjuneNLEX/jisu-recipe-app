import { fileToScaledImage, fileToThumbnail } from './media'

// Analyze an uploaded image (a recipe screenshot, photo, or handwritten note)
// with Claude vision and return a recipe + a thumbnail data URL.
export async function extractRecipeFromImage(file, apiKey, onProgress) {
  if (!apiKey) throw new Error('AI 분석은 API 키가 설정되어 있어야 사용할 수 있어요')

  onProgress?.('이미지를 준비하는 중...')
  const [{ base64, mediaType }, thumbnail] = await Promise.all([
    fileToScaledImage(file, 1280),
    fileToThumbnail(file),
  ])

  onProgress?.('Claude가 이미지를 분석하는 중...')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `이미지 분석 실패 (API ${res.status})`)
  }

  const data = await res.json()
  const text = (data.content?.[0]?.text || '').trim()
  const jsonMatch = text.match(/\{[\s\S]+\}/)
  if (!jsonMatch) throw new Error('이미지에서 레시피를 읽지 못했어요')

  const parsed = JSON.parse(jsonMatch[0])
  if (!parsed || (!parsed.ingredients?.length && !parsed.steps?.length)) {
    throw new Error('이미지에서 레시피 내용을 찾지 못했어요. 다른 이미지를 시도해 주세요')
  }

  return {
    recipe: {
      title: parsed.title || '이미지 레시피',
      ingredients: parsed.ingredients || [],
      sauce: parsed.sauce || [],
      steps: parsed.steps || [],
      servings: parsed.servings || null,
      time: parsed.time || null,
      note: parsed.note || null,
    },
    thumbnail,
  }
}

const PROMPT = `이 이미지는 요리 레시피(스크린샷, 사진, 손글씨 메모 등)예요.
이미지에 보이는 글자와 음식/재료를 최대한 읽고 분석해서 아래 JSON 형식으로만 응답하세요.

{
  "title": "요리 이름",
  "ingredients": ["주재료1 (양)", "주재료2 (양)", ...],
  "sauce": ["양념재료1 (양)", ...],
  "steps": ["1단계 상세 설명", "2단계 상세 설명", ...],
  "servings": "몇 인분 (없으면 null)",
  "time": "총 조리 시간 (없으면 null)",
  "note": "팁·주의사항 (없으면 null)"
}

규칙:
- 이미지의 텍스트를 정확히 읽어 재료와 분량, 조리 순서를 빠짐없이 옮기세요.
- 글자가 흐릿하면 음식 사진과 맥락으로 추론하세요.
- sauce: 양념/소스 재료만 분리. 없으면 []
- steps: 조리 순서를 구체적으로. JSON 외 다른 말은 출력하지 마세요.`
