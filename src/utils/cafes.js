// Dessert/cafe recommendation helpers.
// - Resolve the user's current city ("시") via the browser geolocation API +
//   OpenStreetMap reverse geocoding (no API key required).
// - Ask Claude (with the web_search tool) for real-time, currently-operating
//   coffee/dessert cafe picks in that city.

// Resolve the current position to a Korean city name and coordinates.
export function getCityLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('이 기기에서는 위치를 사용할 수 없어요'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        let city = null
        let full = null
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`
          )
          const data = await res.json()
          const a = data.address || {}
          // Korean admin levels vary by region (특별자치시/시/군). Pick the most
          // specific "시"-level name available.
          city = a.city || a.county || a.town || a.province || a.state || null
          const province = a.province || a.state
          full = [province, a.city || a.county || a.town].filter(Boolean).join(' ') || city
        } catch {
          // Reverse geocoding failed — still return coords so the map can render.
        }
        resolve({ lat, lon, city, full })
      },
      () => reject(new Error('위치 권한이 필요해요. 브라우저에서 위치 접근을 허용해줘요')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  })
}

// OpenStreetMap embed centered on the given coordinates, with a marker.
export function osmEmbedUrl(lat, lon) {
  const d = 0.07
  const bbox = [lon - d, lat - d * 0.75, lon + d, lat + d * 0.75].join('%2C')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`
}

// Clean an address for display: drop parenthetical notes / disclaimers the
// model sometimes appends, collapse whitespace.
export function cleanAddress(address) {
  if (!address) return ''
  return address.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim()
}

// Naver Map search link — search by the business name only (no region appended).
export function naverMapUrl(name) {
  return `https://map.naver.com/v5/search/${encodeURIComponent((name || '').trim())}`
}

// Per-theme spec. Each theme is searched in its own (parallel) request so the
// two lists arrive independently and the wall-clock time is the slower of the
// two rather than the sum.
const THEME_SPEC = {
  coffee: {
    label: '커피 맛집(원두/에스프레소 퀄리티 위주)',
    desc: '에스프레소/원두(빈) 퀄리티가 특히 뛰어난 곳. 스페셜티 커피, 로스터리, 싱글오리진 등 커피 자체의 맛으로 유명한 곳 위주.',
    extraField: '   - beans: 원두/로스팅 특징 (예: "싱글오리진 핸드드립", "직접 로스팅한 다크로스트")',
    schema: '{ "name": "", "address": "", "reason": "", "review": "", "signature": "", "beans": "" }',
  },
  dessert: {
    label: '디저트 카페',
    desc: '디저트(케이크, 베이커리, 구움과자 등)가 맛있는 디저트 카페.',
    extraField: '',
    schema: '{ "name": "", "address": "", "reason": "", "review": "", "signature": "" }',
  },
}

function buildSystemPrompt(spec) {
  return `너는 한국의 카페·디저트 큐레이터야. 반드시 web_search 도구로 최신 정보를 직접 검색해서 답해.

규칙:
1. 사용자가 알려준 '시' 전역을 기준으로 "${spec.label}" 테마로 정확히 5곳(TOP 5)을 추천해.
   - 대상: ${spec.desc}
2. 매우 중요: web_search로 각 가게가 "현재 영업 중"인지 확인해. 폐업/폐점/영구 휴업한 곳은 평판이 아무리 좋아도 절대 추천하지 마. 영업 여부가 불확실하면 빼고 다른 영업 중인 곳을 넣어.
3. 각 항목 필드:
   - name: 정확한 상호명 (네이버 지도에 등록된 이름 그대로, 지점명 포함)
   - address: 도로명 주소만. 괄호 설명이나 "확인 권장" 같은 안내 문구 금지. 번지를 모르면 시/구/동까지만.
   - reason: 추천 이유 (1~2문장)
   - review: 실제 방문자 리뷰/평가 요약 한 문장
   - signature: 대표 메뉴 1~2개
${spec.extraField}
4. 실제 존재가 확인된 곳만. 지어내지 마. 5곳을 못 채우면 채운 만큼만. 네이버 지도/카카오맵에 실제 등록되어 상호명으로 검색되는 곳이어야 해.
5. 출력은 설명 없이 아래 형식의 \`\`\`json 코드블록 하나로만. 모든 텍스트는 한국어.

형식:
\`\`\`json
{ "items": [ ${spec.schema} ] }
\`\`\``
}

// Extract the items array from a model response (handles ```json fences).
function parseItems(text) {
  let jsonStr = null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    jsonStr = fence[1]
  } else {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) jsonStr = text.slice(start, end + 1)
  }
  if (!jsonStr) throw new Error('추천 결과를 해석하지 못했어요')
  const obj = JSON.parse(jsonStr)
  return Array.isArray(obj.items) ? obj.items : []
}

// In-memory cache so re-entering the tab (or switching themes) doesn't trigger
// a fresh search. Keyed by city + theme; survives component remounts within the
// session. Pass force=true to bypass.
const cache = new Map()
const cacheKey = (city, theme) => `${city || '?'}|${theme}`

export function getCachedCafes(city, theme) {
  return cache.get(cacheKey(city, theme)) || null
}

// Ask Claude (with web search) for currently-operating picks for ONE theme.
export async function recommendCafesByTheme({ apiKey, city, theme, signal, force = false }) {
  if (!apiKey) throw new Error('API 키가 없어요')
  const spec = THEME_SPEC[theme]
  if (!spec) throw new Error('알 수 없는 테마예요')

  if (!force) {
    const cached = cache.get(cacheKey(city, theme))
    if (cached) return cached
  }

  const cityName = city || '현재 위치'
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: buildSystemPrompt(spec),
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [
        {
          role: 'user',
          content: `${cityName} 전역에서 지금 영업 중인 ${spec.label} TOP 5를 추천해줘.`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `오류 (${res.status})`)
  }

  const data = await res.json()
  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
  const items = parseItems(text)
  cache.set(cacheKey(city, theme), items)
  return items
}
