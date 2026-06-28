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

// Trim admin suffixes to a short, searchable region core.
// "세종특별자치시" → "세종", "서울특별시" → "서울", "성남시" → "성남".
function shortRegion(city) {
  if (!city) return ''
  const core = city.replace(/(특별자치시|특별자치도|특별시|광역시|시|군|도)$/, '').trim()
  return core || city
}

// Pull the most specific locality token (동/읍/면/구) from an address string,
// ignoring any parenthetical notes the model may have added.
function localityFrom(address) {
  if (!address) return null
  const cleaned = address.replace(/\(.*?\)/g, ' ')
  const tokens = cleaned.match(/[가-힣A-Za-z0-9]+(?:특별자치시|특별시|광역시|시|군|구|동|읍|면)/g)
  if (!tokens) return null
  const specific = tokens.filter(t => /(동|읍|면|구)$/.test(t))
  return specific.length ? specific[specific.length - 1] : tokens[tokens.length - 1]
}

// Clean an address for display: drop parenthetical notes / disclaimers the
// model sometimes appends, collapse whitespace.
export function cleanAddress(address) {
  if (!address) return ''
  return address.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim()
}

// Naver Map search link. Korean place search works best with
// "상호명 + 동/구(또는 시)" rather than a full road address — keep it short.
export function naverMapUrl(name, address, fallbackCity) {
  const region = localityFrom(address) || shortRegion(fallbackCity) || ''
  const query = [name, region].filter(Boolean).join(' ').trim()
  return `https://map.naver.com/v5/search/${encodeURIComponent(query)}`
}

const SYSTEM_PROMPT = `너는 한국의 카페·디저트 큐레이터야. 반드시 web_search 도구로 최신 정보를 직접 검색해서 답해.

규칙:
1. 사용자가 알려준 '시' 전역을 기준으로 추천해.
2. 두 가지 테마로 나눠서 각각 정확히 5곳(TOP 5)을 추천해:
   - coffee: 에스프레소/원두(빈) 퀄리티가 특히 뛰어난 곳. 스페셜티 커피, 로스터리, 싱글오리진 등 커피 자체의 맛으로 유명한 곳 위주.
   - dessert: 디저트(케이크, 베이커리, 구움과자 등)가 맛있는 디저트 카페.
3. 매우 중요: web_search로 각 가게가 "현재 영업 중"인지 반드시 확인해. 폐업/폐점/영구 휴업한 곳은 검색 평판이 아무리 좋아도 절대 추천하지 마. 영업 여부가 확실하지 않으면 그 곳은 빼고 다른 영업 중인 곳을 넣어.
4. 각 항목에 들어갈 필드:
   - name: 정확한 상호명 (네이버 지도에 등록된 이름 그대로. 지점명이 있으면 포함)
   - address: 도로명 주소만 적어. 괄호 안 설명이나 "확인 권장" 같은 안내 문구는 절대 넣지 마. 정확한 번지를 모르면 시/구/동까지만 적어.
   - reason: 추천 이유 (1~2문장)
   - review: 실제 방문자 리뷰/평가를 요약한 한 문장
   - signature: 대표 메뉴 1~2개
   - coffee 항목은 추가로 beans: 원두/로스팅 특징(예: "싱글오리진 핸드드립", "직접 로스팅한 다크로스트")
5. 검색으로 실제 존재가 확인된 곳만 넣어. 지어내지 마. 5곳을 못 채우면 채운 만큼만. 네이버 지도/카카오맵 같은 한국 지도 서비스에 실제로 등록되어 있고 상호명으로 검색되는 곳이어야 해.
6. 출력은 다른 설명 없이 아래 형식의 \`\`\`json 코드블록 하나로만 해. 모든 텍스트는 한국어.

형식:
\`\`\`json
{
  "city": "도시명",
  "coffee": [
    { "name": "", "address": "", "reason": "", "review": "", "signature": "", "beans": "" }
  ],
  "dessert": [
    { "name": "", "address": "", "reason": "", "review": "", "signature": "" }
  ]
}
\`\`\``

// Extract the first JSON object from a model response (handles ```json fences).
function parseCafeJson(text) {
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
  return {
    city: obj.city || null,
    coffee: Array.isArray(obj.coffee) ? obj.coffee : [],
    dessert: Array.isArray(obj.dessert) ? obj.dessert : [],
  }
}

// Ask Claude (with web search) for currently-operating cafe picks in `city`.
export async function recommendCafes({ apiKey, city, signal }) {
  if (!apiKey) throw new Error('API 키가 없어요')
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
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
      messages: [
        {
          role: 'user',
          content: `${cityName} 전역에서 지금 영업 중인 커피 맛집(원두 퀄리티 위주)과 디저트 카페를 각각 TOP 5로 추천해줘.`,
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
  return parseCafeJson(text)
}
