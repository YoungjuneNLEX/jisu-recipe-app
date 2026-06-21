export function isInstagramUrl(url) {
  return /instagram\.com\/(p|reel|reels)\//.test(url)
}

export function extractInstagramId(url) {
  const match = url.match(/instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/)
  return match ? match[1] : null
}

// ── Page parsing ──────────────────────────────────────────────────────────────

async function fetchEmbedHtml(postId) {
  const res = await fetch(`/api/instagram/embed?id=${postId}`)
  if (!res.ok) throw new Error(`Instagram embed ${res.status}`)
  return res.text()
}

function parseEmbed(html) {
  const caption = extractCaption(html)
  const images  = extractImageUrls(html)
  const video   = extractVideoUrl(html)
  return { caption, images, video }
}

function extractCaption(html) {
  // Instagram embed puts the caption in a <div class="Caption"> or og:description
  const captionMatch = html.match(/class="[^"]*Caption[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  if (captionMatch) {
    return captionMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i)
    || html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:description"/i)
  if (ogDesc) return decodeHtmlEntities(ogDesc[1])
  return ''
}

function extractImageUrls(html) {
  const urls = new Set()
  // og:image
  const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i)
    || html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:image"/i)
  if (og) urls.add(og[1])
  // img tags with cdn urls
  const imgRe = /src="(https:\/\/[^"]*(?:instagram|cdninstagram|fbcdn)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/gi
  let m
  while ((m = imgRe.exec(html)) !== null) urls.add(m[1])
  return [...urls].filter(u => !u.includes('profile') && !u.includes('avatar')).slice(0, 10)
}

function extractVideoUrl(html) {
  // og:video
  const og = html.match(/<meta[^>]+property="og:video"[^>]+content="([^"]*)"/i)
    || html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:video"/i)
  if (og) return og[1]
  // src in video tags
  const vid = html.match(/<video[^>]+src="([^"]+)"/i)
  if (vid) return vid[1]
  // JSON blobs
  const jsonVid = html.match(/"video_url":"([^"]+)"/)
  if (jsonVid) return jsonVid[1].replace(/\\u0026/g, '&').replace(/\\/g, '')
  return null
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
}

// ── Media fetching ────────────────────────────────────────────────────────────

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

// Extract frames from a video URL via hidden <video> + canvas.
// Returns array of base64 strings (JPEG).
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

    const onError = () => resolve([])
    video.addEventListener('error', onError)

    video.addEventListener('loadedmetadata', async () => {
      canvas.width  = Math.min(video.videoWidth,  480)
      canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth)

      const duration = video.duration
      if (!duration || !isFinite(duration)) { resolve([]); return }

      // Sample times: every intervalSecs, capped at maxFrames
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
    setTimeout(() => resolve(frames), 30000) // 30s safety timeout
  })
}

// ── Main extraction pipeline ──────────────────────────────────────────────────

export async function extractInstagramRecipe(postUrl, apiKey, setMessage) {
  const postId = extractInstagramId(postUrl)
  if (!postId) throw new Error('올바른 인스타그램 링크를 입력해 주세요')

  // 1. Fetch embed page
  setMessage('인스타그램 게시물을 불러오는 중...')
  const html = await fetchEmbedHtml(postId)
  const { caption, images, video } = parseEmbed(html)

  const hasCaption = caption.length > 10
  const isVideo    = !!video

  // 2. Collect visual content
  let imageBlocks = []

  if (isVideo) {
    setMessage('영상 프레임을 추출하는 중... (0.5초 단위)')
    const frames = await extractVideoFrames(video)
    if (frames.length > 0) {
      console.log(`[Instagram] extracted ${frames.length} video frames`)
      imageBlocks = frames.map(b64 => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
      }))
    } else {
      // fallback: thumbnail
      setMessage('영상 프레임 추출 실패 → 썸네일로 대체 중...')
      for (const imgUrl of images.slice(0, 1)) {
        const img = await fetchImageBase64(imgUrl)
        if (img) imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.b64 } })
      }
    }
  } else {
    // Photo / carousel
    setMessage('이미지를 불러오는 중...')
    for (const imgUrl of images.slice(0, 6)) {
      const img = await fetchImageBase64(imgUrl)
      if (img) imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.b64 } })
    }
  }

  if (!hasCaption && imageBlocks.length === 0) {
    throw new Error('게시물 내용을 가져올 수 없어요. 비공개 계정이거나 로그인이 필요한 게시물일 수 있어요.')
  }

  const sources = [
    imageBlocks.length > 0 && (isVideo ? `영상프레임(${imageBlocks.length}장)` : `이미지(${imageBlocks.length}장)`),
    hasCaption && `설명글(${caption.length}자)`,
  ].filter(Boolean).join(' + ')

  // 3. Ask Claude
  setMessage(`Claude가 레시피를 추출하는 중... (${sources})`)

  const textBlock = {
    type: 'text',
    text: `인스타그램 요리 게시물의 레시피를 추출해주세요.
${hasCaption ? `\n[게시물 설명글]\n${caption}\n` : ''}
${imageBlocks.length > 0 ? (isVideo ? '위 이미지들은 영상에서 0.5초 단위로 추출한 프레임이에요.' : '위 이미지들은 게시물 사진이에요.') : ''}

아래 JSON 형식으로만 응답하세요:

{
  "title": "요리 이름",
  "ingredients": ["주재료1 (양)", "주재료2 (양)", ...],
  "sauce": ["양념1 (양)", "양념2 (양)", ...],
  "steps": ["1단계 설명", "2단계 설명", ...],
  "servings": "몇 인분 (없으면 null)",
  "time": "총 조리 시간 (없으면 null)",
  "note": "팁·주의사항 (없으면 null)"
}

규칙:
- ingredients: 주재료 전부, 용량 포함. 하나도 빠짐없이.
- sauce: 양념·소스 재료만 분리. 없으면 []
- steps: 조리 순서 구체적으로. 불 세기·시간 포함. 최소 3단계.
- note: 영상/사진에서 강조된 팁`,
  }

  const messageContent = imageBlocks.length > 0
    ? [...imageBlocks, textBlock]
    : [textBlock]

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
  parsed.sourceType = 'instagram'
  return parsed
}

// Post info (title + author) from embed page
export async function fetchInstagramPostInfo(postId) {
  try {
    const html = await fetchEmbedHtml(postId)
    const { caption, images } = parseEmbed(html)

    const titleMatch = caption.match(/^[^\n.!?]{4,60}/)
    const title = titleMatch ? titleMatch[0].trim() : '인스타그램 레시피'

    const ogAuthor = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i)
      || html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:title"/i)
    const author = ogAuthor ? decodeHtmlEntities(ogAuthor[1]).replace(/ on Instagram$/, '').trim() : ''

    return { title, author, thumbnail: images[0] || null }
  } catch {
    return { title: '인스타그램 레시피', author: '', thumbnail: null }
  }
}
