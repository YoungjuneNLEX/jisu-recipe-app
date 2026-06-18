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
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`

  // 1) YouTube oEmbed via our proxy (fast, returns clean JSON)
  try {
    const res = await fetch(`/api/youtube/oembed?url=${encodeURIComponent(watchUrl)}&format=json`)
    if (res.ok) {
      const data = await res.json()
      if (data && data.title) return data
    }
  } catch { /* fall through */ }

  // 2) noembed.com — fetches YouTube from its own infra, so it still works when
  //    YouTube blocks our server IP (the usual cause of failures on Vercel).
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`)
    if (res.ok) {
      const data = await res.json()
      if (data && data.title && !data.error) {
        return {
          title: data.title,
          author_name: data.author_name || '',
          thumbnail_url: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        }
      }
    }
  } catch { /* fall through */ }

  // 3) Scrape title/author from the watch page HTML
  try {
    const html = await fetchYouTubePage(videoId)
    const title = extractTitle(html)
    if (title) {
      const authorMatch = html.match(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/) ||
        html.match(/"author":"((?:[^"\\]|\\.)*)"/)
      return {
        title,
        author_name: authorMatch ? unescapeJson(authorMatch[1]) : '',
        thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      }
    }
  } catch { /* fall through */ }

  // 4) Everything failed (video restricted/blocked, or all sources unreachable
  //    from this network). Don't hard-fail — return a minimal entry so the user
  //    can still save the video, watch it, and fill in the recipe by hand.
  //    The thumbnail loads straight from the public image CDN in the browser.
  return {
    title: '',
    author_name: '',
    thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    incomplete: true,
  }
}

// Decode JSON/HTML-escaped sequences from scraped strings
function unescapeJson(s) {
  return s
    .replace(/\\u0026/g, '&')
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\n/g, ' ')
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
}

// Extract the real video title from page HTML, trying reliable sources first.
// The old approach grabbed the first `"title":"..."` in the page, which often
// matched unrelated metadata (menus, tracking data) and produced garbage.
function extractTitle(html) {
  // 1) videoDetails.title — the canonical title inside ytInitialPlayerResponse
  const vd = html.match(/"videoDetails":\{(?:[^{}]|\{[^{}]*\})*?"title":"((?:[^"\\]|\\.)*)"/)
  if (vd) return unescapeJson(vd[1])

  // 2) og:title meta tag (handles either attribute order)
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i) ||
    html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:title"/i)
  if (og && og[1].trim()) return decodeHtmlEntities(og[1])

  // 3) <title> tag, stripping the trailing " - YouTube"
  const t = html.match(/<title>([^<]*)<\/title>/i)
  if (t) {
    const cleaned = decodeHtmlEntities(t[1]).replace(/\s*-\s*YouTube\s*$/, '').trim()
    if (cleaned) return cleaned
  }

  return null
}

// Cache the watch-page HTML per video. A single "save" pulls the page for
// info, transcript, description, duration and storyboard — without this we'd
// fire 4-5 identical requests at YouTube, which gets rate-limited and surfaces
// to the user as "영상을 불러올 수 없어요".
let _pageCache = { id: null, html: null }

// Fetch YouTube page HTML via proxy (avoids CORS), with caching + one retry
async function fetchYouTubePage(videoId) {
  if (_pageCache.id === videoId && _pageCache.html) return _pageCache.html

  let lastErr
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`/api/youtube/watch?v=${videoId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      _pageCache = { id: videoId, html }
      return html
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('페이지를 불러올 수 없어요')
}

// Extract and parse the ytInitialPlayerResponse JSON blob from page HTML.
// YouTube inlines it on one long line; we balance braces from the opening {.
function extractPlayerResponse(html) {
  const idx = html.indexOf('ytInitialPlayerResponse')
  if (idx === -1) return null
  const start = html.indexOf('{', idx)
  let depth = 0, end = start
  for (; end < html.length; end++) {
    if (html[end] === '{') depth++
    else if (html[end] === '}') { depth--; if (depth === 0) break }
  }
  try {
    return JSON.parse(html.slice(start, end + 1))
  } catch {
    return null
  }
}

// Video length in seconds (0 if unknown). Used to pick frame sampling density.
export async function fetchVideoDuration(videoId) {
  try {
    const player = extractPlayerResponse(await fetchYouTubePage(videoId))
    const secs = Number(player?.videoDetails?.lengthSeconds)
    return Number.isFinite(secs) ? secs : 0
  } catch {
    return 0
  }
}

// Parse storyboard spec and return evenly-spaced frame images every ~intervalSeconds.
// maxFrames caps how many storyboard images we send (short-form videos sample
// more densely, so they need a higher cap to cover the whole clip).
export async function fetchStoryboardFrames(videoId, intervalSeconds = 30, maxFrames = 12) {
  try {
    const html = await fetchYouTubePage(videoId)

    const playerData = extractPlayerResponse(html)
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

    // Pick a level no wider than 200px (keeps payload small enough for Claude).
    // Coarse sampling → highest-quality such level. Fine sampling (short-form)
    // → the level packing the most frames so we can honor the small interval.
    const pool = levels.filter(l => l.w <= 200)
    const usable = pool.length ? pool : levels
    const level = intervalSeconds <= 10
      ? usable.reduce((a, b) => (b.frameCount > a.frameCount ? b : a))
      : [...usable].reverse()[0]
    const totalImages = Math.ceil(level.frameCount / level.framesPerImg)
    const secondsPerImg = (level.framesPerImg * level.intervalMs) / 1000
    const step = Math.max(1, Math.round(intervalSeconds / secondsPerImg))

    const urlTemplate = rawBase.replace(/\$L/g, level.level).replace('https://i.ytimg.com', '/api/ytimg')
    console.log(`[storyboard] L${level.level} totalImgs=${totalImages} secsPerImg=${secondsPerImg.toFixed(1)}s step=${step} cap=${maxFrames}`)

    const indices = []
    for (let i = 0; i < totalImages; i += step) indices.push(i)
    if (indices[indices.length - 1] !== totalImages - 1) indices.push(totalImages - 1)
    const capped = indices.slice(0, maxFrames)

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
    const playerData = extractPlayerResponse(await fetchYouTubePage(videoId))
    if (!playerData) { console.warn('[fetchTranscript] no playerResponse in page'); return '' }

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
