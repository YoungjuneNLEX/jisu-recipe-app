import { cleanSteps } from './parseRecipe'

export function isInstagramUrl(url) {
  return /instagram\.com\/(p|reel|reels)\//.test(url)
}

export function extractInstagramId(url) {
  const match = url.match(/instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/)
  return match ? match[1] : null
}

// ── oEmbed (가장 신뢰할 수 있는 공개 API) ────────────────────────────────────

async function fetchOEmbed(postUrl) {
  const endpoint = `https://api.instagram.com/oembed/?url=${encodeURIComponent(postUrl)}&format=json&omitscript=true`
  const res = await fetch(`/api/instagram/media?url=${encodeURIComponent(endpoint)}`)
  if (!res.ok) throw new Error(`oEmbed ${res.status}`)
  return res.json()
}

// oEmbed의 html 필드 안에 있는 <p> 태그에서 캡션 추출
function parseCaptionFromOEmbedHtml(html) {
  if (!html) return ''
  // blockquote 안 <p> 태그들
  const pMatches = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
  const texts = pMatches
    .map(m => m[1].replace(/<[^>]+>/g, '').trim())
    .filter(t => t.length > 5 && !t.startsWith('A post shared'))
  return decodeHtmlEntities(texts.join('\n'))
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

function decodeHtmlEntities(s) {
  if (!s) return ''
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
}

// ── 공개 게시물 정보 (oEmbed 기반) ───────────────────────────────────────────

export async function fetchInstagramPostInfo(postId) {
  try {
    const postUrl = `https://www.instagram.com/p/${postId}/`
    const oembed = await fetchOEmbed(postUrl)

    const caption = parseCaptionFromOEmbedHtml(oembed.html)
    const titleMatch = (caption || oembed.title || '').match(/^[^\n]{4,60}/)
    const title = titleMatch ? titleMatch[0].trim() : '인스타그램 레시피'
    const author = oembed.author_name || ''
    const thumbnail = oembed.thumbnail_url || null

    return { title, author, thumbnail, caption }
  } catch {
    return { title: '인스타그램 레시피', author: '', thumbnail: null, caption: '' }
  }
}

// ── 메인 레시피 추출 파이프라인 ───────────────────────────────────────────────

export async function extractInstagramRecipe(postUrl, apiKey, setMessage) {
  const postId = extractInstagramId(postUrl)
  if (!postId) throw new Error('올바른 인스타그램 링크를 입력해 주세요')

  // 1. oEmbed로 캡션 + 썸네일 가져오기
  setMessage('인스타그램 게시물 정보를 가져오는 중...')
  let oembed = null
  try {
    oembed = await fetchOEmbed(postUrl)
  } catch (e) {
    console.warn('[Instagram] oEmbed 실패:', e.message)
  }

  const caption = oembed ? parseCaptionFromOEmbedHtml(oembed.html) : ''
  const thumbnailUrl = oembed?.thumbnail_url || null

  // 2. 미디어 수집
  let imageBlocks = []

  // 썸네일 이미지 fetch (사진이든 영상이든 항상 시도)
  if (thumbnailUrl) {
    setMessage('이미지를 불러오는 중...')
    const img = await fetchImageBase64(thumbnailUrl)
    if (img) {
      imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.b64 } })
    }
  }

  // 영상인 경우 video_url 추출해서 0.5초 단위 프레임 추가
  const videoUrl = oembed?.html ? extractVideoUrlFromOEmbedHtml(oembed.html) : null
  if (videoUrl) {
    setMessage('영상 프레임을 추출하는 중... (0.5초 단위)')
    const frames = await extractVideoFrames(videoUrl)
    if (frames.length > 0) {
      console.log(`[Instagram] 영상 프레임 ${frames.length}장 추출 완료`)
      // 썸네일 앞에 프레임들 추가 (최대 30장)
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

function extractVideoUrlFromOEmbedHtml(html) {
  // oEmbed html 안 video src 또는 data-video-url 속성
  const m = html.match(/(?:src|data-video-url)="(https:\/\/[^"]*\.mp4[^"]*)"/i)
  return m ? decodeHtmlEntities(m[1]) : null
}
