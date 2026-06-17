export function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export async function fetchVideoInfo(videoId) {
  const res = await fetch(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
  )
  if (!res.ok) throw new Error('영상을 불러올 수 없어요')
  return res.json()
}

// Fetch YouTube page HTML via Vite proxy (avoids CORS)
async function fetchYouTubePage(videoId) {
  const res = await fetch(`/api/youtube/watch?v=${videoId}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// Parse storyboard spec and return evenly-spaced frame images every ~intervalSeconds
export async function fetchStoryboardFrames(videoId, intervalSeconds = 30) {
  try {
    const html = await fetchYouTubePage(videoId)

    const idx = html.indexOf('ytInitialPlayerResponse')
    if (idx === -1) return []
    const start = html.indexOf('{', idx)
    let depth = 0, end = start
    for (; end < html.length; end++) {
      if (html[end] === '{') depth++
      else if (html[end] === '}') { depth--; if (depth === 0) break }
    }
    const playerData = JSON.parse(html.slice(start, end + 1))
    const spec = playerData?.storyboards?.playerStoryboardSpecRenderer?.spec
    if (!spec) { console.warn('[storyboard] no spec'); return [] }

    // spec: "baseUrl|W#H#C#I#Ns#...|W#H#C#I#Ns#..."
    // W=frameWidth H=frameHeight C=totalFrames I=intervalMs Ns=framesPerImage
    const segments = spec.split('|')
    const rawBase = segments[0]

    const levels = segments.slice(1).map((seg, i) => {
      const p = seg.split('#')
      return { level: i, w: +p[0], h: +p[1], frameCount: +p[2], intervalMs: +p[3] || 2000, framesPerImg: +p[4] || 25 }
    }).filter(l => l.frameCount > 0 && l.w > 0)

    if (!levels.length) return []

    // Highest quality level with frame width ≤ 200px
    const level = [...levels].reverse().find(l => l.w <= 200) || levels[levels.length - 1]
    const totalImages = Math.ceil(level.frameCount / level.framesPerImg)
    const secondsPerImg = (level.framesPerImg * level.intervalMs) / 1000
    const step = Math.max(1, Math.round(intervalSeconds / secondsPerImg))

    const urlTemplate = rawBase.replace(/\$L/g, level.level).replace('https://i.ytimg.com', '/api/ytimg')
    console.log(`[storyboard] L${level.level} totalImgs=${totalImages} secsPerImg=${secondsPerImg.toFixed(1)}s step=${step}`)

    const indices = []
    for (let i = 0; i < totalImages; i += step) indices.push(i)
    if (indices[indices.length - 1] !== totalImages - 1) indices.push(totalImages - 1)
    const capped = indices.slice(0, 12)

    const frames = await Promise.all(capped.map(async n => {
      // Try spec URL first, then simple fallback URL
      const specUrl = urlTemplate.replace(/\$N/g, n)
      const simpleUrl = `/api/ytimg/vi/${videoId}/storyboard3_L${level.level}/${n}.jpg`
      return (await fetchBase64(specUrl)) || (await fetchBase64(simpleUrl))
    }))

    const valid = frames.filter(Boolean)
    console.log(`[storyboard] got ${valid.length}/${capped.length} frames`)
    return valid
  } catch (e) {
    console.warn('[storyboard] failed:', e.message)
    return []
  }
}

async function fetchBase64(url) {
  try {
    const res = await fetch(url)
    if (!res.ok || res.headers.get('content-length') === '0') return null
    const blob = await res.blob()
    if (blob.size < 500) return null
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

// Extract description from YouTube page HTML
export async function fetchDescription(videoId) {
  try {
    const html = await fetchYouTubePage(videoId)

    const match = html.match(/"description":\{"simpleText":"((?:[^"\\]|\\.)*)"\}/)
    if (match) {
      return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
    const match2 = html.match(/"attributedDescription":\{"content":"((?:[^"\\]|\\.)*)"/)
    if (match2) {
      return match2[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
    return ''
  } catch (e) {
    console.warn('[fetchDescription] failed:', e.message)
    return ''
  }
}

// Fetch transcript (자막) from YouTube video via Vite proxy
export async function fetchTranscript(videoId) {
  // ASR(자동 음성인식) 우선 → 제작자 자막 → 영어 순
  const candidates = [
    `/api/youtube/api/timedtext?v=${videoId}&lang=ko&kind=asr&fmt=json3`,
    `/api/youtube/api/timedtext?v=${videoId}&lang=ko&fmt=json3`,
    `/api/youtube/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=json3`,
    `/api/youtube/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
  ]

  for (const url of candidates) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const text = await res.text()
      if (!text || text.length < 50) continue

      const transcript = parseTranscriptText(text)
      if (transcript.length > 100) {
        console.log('[fetchTranscript] success via timedtext, length:', transcript.length, url)
        return transcript
      }
    } catch { /* try next */ }
  }

  // Fallback: parse ytInitialPlayerResponse from page to get baseUrl
  try {
    const html = await fetchYouTubePage(videoId)

    // YouTube puts ytInitialPlayerResponse on one long line
    const idx = html.indexOf('ytInitialPlayerResponse')
    if (idx === -1) { console.warn('[fetchTranscript] no playerResponse in page'); return '' }

    // Extract the JSON by counting braces from the opening {
    const start = html.indexOf('{', idx)
    let depth = 0, end = start
    for (; end < html.length; end++) {
      if (html[end] === '{') depth++
      else if (html[end] === '}') { depth--; if (depth === 0) break }
    }

    const playerData = JSON.parse(html.slice(start, end + 1))
    const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
    if (!captionTracks.length) { console.warn('[fetchTranscript] no caption tracks'); return '' }

    // ASR(kind=asr) 한국어 우선, 그 다음 제작자 한국어, 그 다음 첫 번째
    const preferred =
      captionTracks.find(t => t.vssId === 'a.ko') ||
      captionTracks.find(t => t.kind === 'asr' && t.languageCode === 'ko') ||
      captionTracks.find(t => t.vssId === 'ko') ||
      captionTracks.find(t => t.languageCode === 'ko') ||
      captionTracks.find(t => t.kind === 'asr') ||
      captionTracks[0]

    const proxyUrl = preferred.baseUrl
      .replace('https://www.youtube.com', '/api/youtube')
      .replace(/[&?]fmt=[^&]*/g, '') + '&fmt=json3'

    const res = await fetch(proxyUrl)
    if (!res.ok) throw new Error(`${res.status}`)
    const transcript = parseTranscriptText(await res.text())
    console.log('[fetchTranscript] success via page parse, length:', transcript.length)
    return transcript
  } catch (e) {
    console.warn('[fetchTranscript] all methods failed:', e.message)
    return ''
  }
}

function parseTranscriptText(raw) {
  // JSON3 format
  try {
    const json = JSON.parse(raw)
    if (json.events) {
      return json.events
        .filter(e => e.segs)
        .map(e => e.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim())
        .filter(Boolean)
        .join(' ')
    }
  } catch { /* not JSON */ }

  // XML format <text ...>content</text>
  const texts = []
  const tagRe = /<text[^>]*>([\s\S]*?)<\/text>/g
  let m
  while ((m = tagRe.exec(raw)) !== null) {
    const t = m[1]
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim()
    if (t) texts.push(t)
  }
  return texts.join(' ')
}
