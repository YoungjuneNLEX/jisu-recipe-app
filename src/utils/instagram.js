import { cleanSteps } from './parseRecipe'

export function isInstagramUrl(url) {
  return /instagram\.com\/(p|reel|reels)\//.test(url)
}

export function extractInstagramId(url) {
  const match = url.match(/instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/)
  return match ? match[1] : null
}

// ── RapidAPI 스크래퍼 (서버사이드 프록시 경유) ──────────────────────────────

async function fetchMediaData(shortcode) {
  const res = await fetch(`/api/instagram/scrape?code=${encodeURIComponent(shortcode)}`)
  if (!res.ok) throw new Error(`scrape ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

function extractCaption(data) {
  const edges = data?.edge_media_to_caption?.edges
  if (edges?.length > 0) return edges[0].node.text || ''
  return ''
}

// ── 미디어 프록시 ────────────────────────────────────────────────────────────

async function fetchImageBase64(url) {
  try {
    const proxied = `/api/instagram/media?url=${encodeURIComponent(url)}`
    const res = await fetch(proxied)
    if (!res.ok) return null
    const blob = await res.blob()
    if (blob.size < 1000) return null
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve({ b64: reader.result.split(',')[1], mime: blob.type || 'image/jpeg' })
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

// 영상 URL에서 0.5초 단위 프레임 추출 (브라우저 canvas 이용)
async function extractVideoFrames(videoUrl, intervalSecs = 0.5, maxFrames = 40) {
  const proxied = `/api/instagram/media?url=${encodeURIComponent(videoUrl)}`
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.preload = 'auto'
    video.muted = true
    video.src = proxied

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const frames = []

    video.addEventListener('error', () => resolve([]))

    video.addEventListener('loadedmetadata', async () => {
      canvas.width  = Math.min(video.videoWidth, 480)
      canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth)

      const duration = video.duration
      if (!duration || !isFinite(duration)) { resolve([]); return }

      const times = []
      for (let t = 0; t < duration && times.length < maxFrames; t += intervalSecs) {
        times.push(parseFloat(t.toFixed(2)))
      }

      for (const t of times) {
        await new Promise(r => {
          video.addEventListener('seeked', r, { once: true })
          video.currentTime = t
        })
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push(canvas.toDataURL('image/jpeg', 0.6).split(',')[1])
      }

      video.src = ''
      resolve(frames)
    }, { once: true })

    video.load()
    setTimeout(() => resolve(frames), 30000)
  })
}

// ── 공개 게시물 기본 정보 ─────────────────────────────────────────────────────

export async function fetchInstagramPostInfo(postId) {
  try {
    const data = await fetchMediaData(postId)
    const caption = extractCaption(data)
    const titleMatch = (caption || '').match(/^[^\n]{4,60}/)
    const title = titleMatch ? titleMatch[0].trim() : '인스타그램 레시피'
    const author = data.owner?.username || data.owner?.full_name || ''
    const thumbnail = data.display_url || data.thumbnail_src || null
    return { title, author, thumbnail, caption }
  } catch {
    return { title: '인스타그램 레시피', author: '', thumbnail: null, caption: '' }
  }
}

// ── 메인 레시피 추출 파이프라인 ───────────────────────────────────────────────

export async function extractInstagramRecipe(postUrl, apiKey, setMessage) {
  const postId = extractInstagramId(postUrl)
  if (!postId) throw new Error('올바른 인스타그램 링크를 입력해 주세요')

  // 1. RapidAPI로 게시물 데이터 가져오기
  setMessage('인스타그램 게시물 정보를 가져오는 중...')
  let mediaData = null
  try {
    mediaData = await fetchMediaData(postId)
  } catch (e) {
    console.warn('[Instagram] scrape 실패:', e.message)
    throw new Error('인스타그램 게시물을 가져올 수 없어요. 잠시 후 다시 시도해 주세요.')
  }

  const caption = extractCaption(mediaData)
  const thumbnailUrl = mediaData.display_url || mediaData.thumbnail_src || null
  const videoUrl = mediaData.is_video ? mediaData.video_url : null

  // 2. 미디어 수집
  let imageBlocks = []

  if (thumbnailUrl) {
    setMessage('이미지를 불러오는 중...')
    const img = await fetchImageBase64(thumbnailUrl)
    if (img) {
      imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.b64 } })
    }
  }

  if (videoUrl) {
    setMessage('영상 프레임을 추출하는 중... (0.5초 단위)')
    const frames = await extractVideoFrames(videoUrl)
    if (frames.length > 0) {
      console.log(`[Instagram] 영상 프레임 ${frames.length}장 추출 완료`)
      imageBlocks = [
        ...frames.slice(0, 30).map(b64 => ({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
        })),
        ...imageBlocks,
      ]
    }
  }

  const hasCaption = caption.length > 10
  const hasImages  = imageBlocks.length > 0

  if (!hasCaption && !hasImages) {
    throw new Error('게시물 내용을 가져올 수 없어요. 비공개 계정이거나 지원하지 않는 형식일 수 있어요.')
  }

  const sources = [
    hasImages && `이미지/프레임 ${imageBlocks.length}장`,
    hasCaption && `설명글 ${caption.length}자`,
  ].filter(Boolean).join(' + ')

  // 3. Claude로 레시피 추출
  setMessage(`Claude가 레시피를 분석하는 중... (${sources})`)

  const textBlock = {
    type: 'text',
    text: `인스타그램 요리 게시물의 레시피를 추출해주세요.
${hasCaption ? `\n[게시물 설명글 / 캡션]\n${caption}\n` : ''}
${hasImages ? `위 이미지${videoUrl ? '들은 영상에서 0.5초 단위로 추출한 프레임' : '는 게시물 사진'}이에요.` : ''}

아래 JSON 형식으로만 응답하세요:

{
  "title": "요리 이름",
  "ingredients": ["주재료1 (양)", "주재료2 (양)"],
  "sauce": ["양념1 (양)", "양념2 (양)"],
  "steps": ["1단계 설명", "2단계 설명"],
  "servings": "몇 인분 또는 null",
  "time": "총 조리 시간 또는 null",
  "note": "팁·주의사항 또는 null"
}

규칙:
- ingredients: 주재료 전부, 용량 포함
- sauce: 양념·소스 재료만. 없으면 []
- steps: 조리 순서 구체적으로, 불 세기·시간 포함, 최소 3단계
- note: 강조된 팁이나 주의사항`,
  }

  const messageContent = hasImages ? [...imageBlocks, textBlock] : [textBlock]

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
      max_tokens: 2048,
      messages: [{ role: 'user', content: messageContent }],
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

  const parsed = JSON.parse(jsonMatch[0])
  if (parsed.steps) parsed.steps = cleanSteps(parsed.steps)
  parsed.sourceType = 'instagram'
  return parsed
}
