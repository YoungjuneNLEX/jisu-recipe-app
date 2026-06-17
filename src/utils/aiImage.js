// Ask Claude to "draw" a simple, cute pastel illustration of the recipe's main
// subject as an SVG (Anthropic has no photo generation, but Claude writes great
// vector art). Returns an <img>-ready data URL.
export async function generateRecipeImage({ title, ingredients = [], steps = [], apiKey }) {
  if (!apiKey) throw new Error('AI 이미지는 API 키가 설정되어 있어야 사용할 수 있어요')

  const summary = [
    title && `요리 이름: ${title}`,
    ingredients.length && `재료: ${ingredients.slice(0, 12).join(', ')}`,
    steps.length && `조리 요약: ${steps.slice(0, 3).join(' / ').slice(0, 300)}`,
  ].filter(Boolean).join('\n')

  const prompt = `아래 레시피를 보고, 이 요리를 대표하는 재료나 음식을 귀엽고 단순한 플랫 일러스트로 그려줘.

${summary}

요구사항:
- 부드러운 파스텔 톤 색상 사용
- 사진처럼 사실적으로 말고, 둥글둥글하고 미니멀한 벡터 아이콘 느낌
- 대표 재료 1~2개를 가운데에 크게 배치 (예: 오이무침이면 오이, 김치면 배추김치, 미역국이면 미역)
- 글자/텍스트는 절대 넣지 말 것
- 배경은 연한 파스텔 단색 또는 부드러운 그라데이션으로 꽉 채우기

반드시 viewBox="0 0 480 270" 인 완성된 SVG 하나만 출력해.
마크다운(\`\`\`)이나 설명 없이 <svg> 로 시작해서 </svg> 로 끝나는 코드만 출력해.`

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
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API 오류 ${res.status}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  const svg = extractSvg(text)
  if (!svg) throw new Error('AI 이미지를 만들지 못했어요. 다시 시도해 주세요')
  return svgToDataUrl(svg)
}

function extractSvg(text) {
  const m = text.match(/<svg[\s\S]*<\/svg>/i)
  return m ? m[0] : null
}

function svgToDataUrl(svg) {
  // Make sure the namespace is present so the SVG renders inside <img>
  if (!/xmlns=/.test(svg)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
