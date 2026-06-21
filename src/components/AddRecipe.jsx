import { useState } from 'react'
import { extractVideoId, fetchVideoInfo } from '../utils/youtube'
import { isInstagramUrl, extractInstagramId, fetchInstagramPostInfo, extractInstagramRecipe } from '../utils/instagram'
import { parseFromDescription } from '../utils/parseRecipe'
import { saveRecipe } from '../utils/storage'
import styles from './AddRecipe.module.css'

export default function AddRecipe({ onAdd, apiKey, onCreateManual, onDone }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    setStatus('loading')

    if (isInstagramUrl(trimmed)) {
      try {
        await handleInstagram(trimmed)
      } catch (err) {
        setStatus('error')
        setMessage(err.message || '오류가 발생했어요')
      }
      return
    }

    const videoId = extractVideoId(trimmed)
    if (!videoId) {
      setStatus('error')
      setMessage('올바른 유튜브 또는 인스타그램 링크를 입력해 주세요')
      return
    }

    setMessage('영상 정보를 가져오는 중...')

    try {
      setMessage('영상 정보 요청 중...')
      let info
      try {
        info = await fetchVideoInfo(videoId)
      } catch (err) {
        throw new Error(`fetchVideoInfo 실패: ${err.message} (videoId: ${videoId})`)
      }
      let recipe = null

      if (apiKey) {
        try {
          setMessage('자막을 불러오는 중...')
          recipe = await extractWithClaude(videoId, info.title, apiKey, setMessage)
        } catch (err) {
          console.warn('Claude 추출 실패:', err.message)
        }
      }

      if (!recipe) {
        setMessage('설명란에서 레시피를 파싱하는 중...')
        const { fetchDescription } = await import('../utils/youtube.js')
        const description = await fetchDescription(videoId)
        const parsed = parseFromDescription(description)
        recipe = parsed || { ingredients: [], sauce: [], steps: [], note: '레시피를 자동으로 찾지 못했어요. 직접 입력해 주세요 ✏️' }
      }

      const title = info.title || '제목 미확인 레시피'
      const newRecipe = {
        ...recipe,
        id: videoId,
        title,
        author: info.author_name,
        thumbnail: info.thumbnail_url,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        tags: [],
        favorite: false,
        createdAt: Date.now(),
      }

      const updated = saveRecipe(newRecipe)
      onAdd(updated)
      setUrl('')
      setStatus('success')
      // When the video info couldn't be fetched, the entry is saved but needs
      // a manual title/recipe — tell the user instead of failing outright.
      setMessage(info.incomplete
        ? '영상 정보를 가져오지 못해 기본값으로 저장했어요. 제목·내용을 직접 수정해 주세요 ✏️'
        : `"${title}" 저장됐어요!`)
      // Briefly show the message, then close the add modal (if any)
      setTimeout(() => { setStatus(null); onDone?.() }, info.incomplete ? 2600 : 1200)
    } catch (err) {
      setStatus('error')
      setMessage(err.message || '오류가 발생했어요')
    }
  }

  async function handleImageRecipe(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    if (!apiKey) {
      setStatus('error')
      setMessage('이미지 분석은 API 키가 설정되어 있어야 사용할 수 있어요')
      return
    }

    setStatus('loading')
    setMessage('이미지를 분석하는 중...')
    try {
      const { extractRecipeFromImage } = await import('../utils/imageRecipe.js')
      const { recipe, thumbnail } = await extractRecipeFromImage(file, apiKey, setMessage)

      const newRecipe = {
        ...recipe,
        id: `img-${Date.now()}`,
        author: '',
        thumbnail,
        videoUrl: '',
        tags: [],
        favorite: false,
        createdAt: Date.now(),
        sourceType: '이미지',
      }
      const updated = saveRecipe(newRecipe)
      onAdd(updated)
      setStatus('success')
      setMessage(`"${newRecipe.title}" 저장됐어요!`)
      setTimeout(() => { setStatus(null); onDone?.() }, 1200)
    } catch (err) {
      setStatus('error')
      setMessage(err.message || '이미지 분석에 실패했어요')
    }
  }

  async function handleInstagram(trimmed) {
    const postId = extractInstagramId(trimmed)
    if (!postId) {
      setStatus('error')
      setMessage('올바른 인스타그램 링크를 입력해 주세요')
      return
    }

    const infoPromise = fetchInstagramPostInfo(postId)

    let recipe = null
    if (apiKey) {
      try {
        recipe = await extractInstagramRecipe(trimmed, apiKey, setMessage)
      } catch (err) {
        console.warn('Instagram 추출 실패:', err.message)
        setMessage(err.message)
      }
    }

    const info = await infoPromise
    const title = recipe?.title || info.title || '인스타그램 레시피'
    if (recipe) delete recipe.title

    const newRecipe = {
      ingredients: [], sauce: [], steps: [],
      note: '재료와 조리 순서를 직접 입력해 주세요 ✏️',
      ...recipe,
      id: `ig_${postId}`,
      title,
      author: info.author,
      thumbnail: info.thumbnail,
      videoUrl: trimmed,
      sourceType: 'instagram',
      tags: [],
      favorite: false,
      createdAt: Date.now(),
    }

    const updated = saveRecipe(newRecipe)
    onAdd(updated)
    setUrl('')
    setStatus('success')
    setMessage(`"${title}" 저장됐어요!`)
    setTimeout(() => { setStatus(null); onDone?.() }, 1200)
  }

  return (
   <div className={styles.container}>
    <div className={styles.wrapper}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          className={styles.input}
          type="url"
          placeholder="유튜브 또는 인스타그램 링크 🔗"
          value={url}
          onChange={e => setUrl(e.target.value)}
          disabled={status === 'loading'}
        />
        <button
          className={styles.button}
          type="submit"
          disabled={status === 'loading' || !url.trim()}
        >
          {status === 'loading' ? '분석 중...' : '레시피 저장'}
        </button>
      </form>
      {status && (
        <p className={`${styles.message} ${styles[status]}`}>{message}</p>
      )}
    </div>

    <label className={`${styles.manualBtn} ${status === 'loading' ? styles.manualDisabled : ''}`}>
      🖼 이미지로 레시피 만들기
      <input
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={handleImageRecipe}
        disabled={status === 'loading'}
      />
    </label>

    <button type="button" className={styles.manualBtn} onClick={onCreateManual}>
      ✏️ 개인 레시피 추가하기
    </button>
   </div>
  )
}

// Thumbnail fallback base64 helper
async function fetchThumbnailBase64(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
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

async function extractWithClaude(videoId, title, apiKey, setMessage) {
  const { fetchTranscript, fetchDescription, fetchStoryboardFrames, fetchVideoDuration } =
    await import('../utils/youtube.js')

  // Short-form videos (≤3분) are dense with quick cuts and rely on on-screen
  // text, so sample a frame every 1s (vs 30s) with bigger, more frames so the
  // captions/text in them stay readable.
  setMessage('영상 데이터를 수집하는 중...')
  const duration = await fetchVideoDuration(videoId)
  const isShort = duration > 0 && duration <= 180
  const interval = isShort ? 1 : 30
  const maxFrames = isShort ? 30 : 12
  const frameWidth = isShort ? 320 : 200

  // Gather all sources in parallel: ASR transcript + description + storyboard frames
  const [transcript, description, frames] = await Promise.all([
    fetchTranscript(videoId),
    fetchDescription(videoId),
    fetchStoryboardFrames(videoId, interval, maxFrames, frameWidth),
  ])

  // Short videos often lack storyboards entirely — fall back to the thumbnail
  // so Claude still has a visual reference instead of producing empty content.
  let frameImages = frames
  if (!frameImages.length) {
    const thumb = await fetchThumbnailBase64(`/api/ytimg/vi/${videoId}/hqdefault.jpg`)
    if (thumb) frameImages = [thumb]
  }

  // Shorts have terse transcripts/descriptions, so relax the minimum lengths.
  const hasTranscript = transcript && transcript.length > (isShort ? 50 : 200)
  const hasDescription = description && description.length > (isShort ? 20 : 50)
  const hasFrames = frameImages.length > 0

  console.log(`[Claude] duration:${duration}s short:${isShort} interval:${interval}s transcript:${transcript.length} description:${description.length} frames:${frameImages.length}`)

  if (!hasTranscript && !hasDescription && !hasFrames) {
    throw new Error('분석할 데이터를 찾을 수 없어요')
  }

  // Build source summary for logging
  const sources = [
    hasTranscript && `자막(${transcript.length}자)`,
    hasDescription && `설명란(${description.length}자)`,
    hasFrames && `영상프레임(${frameImages.length}장)`,
  ].filter(Boolean).join(' + ')

  setMessage(`Claude가 분석하는 중... (${sources})`)
  console.log(`[Claude] using: ${sources}`)

  // Build message content — text + images
  const textContent = [
    hasTranscript && `[자막 전체]\n${transcript.slice(0, 5000)}`,
    hasDescription && `[영상 설명란]\n${description.slice(0, 2000)}`,
  ].filter(Boolean).join('\n\n')

  const imageBlocks = frameImages.map(b64 => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
  }))

  const shortNote = isShort ? `

⚠️ 이 영상은 숏폼입니다. 프레임 이미지들은 1초 간격으로 잘라낸 화면이에요.
- 각 프레임에 **화면에 떠 있는 자막/텍스트(재료명, 분량, 조리법 안내)를 최대한 읽어서** 반영하세요.
- 자막 텍스트가 흐릿해도 보이는 글자를 추측해 활용하고, 화면 속 재료·조리 동작도 관찰하세요.
- 설명란(아래 텍스트)을 그대로 베끼지 말고, **영상 프레임에서 읽은 내용을 우선**으로 작성하세요.` : ''

  const textBlock = {
    type: 'text',
    text: `유튜브 요리 영상 "${title}"의 레시피를 추출해주세요.${shortNote}
${textContent ? `\n아래 텍스트 데이터도 참고하세요:\n${textContent}` : ''}

위 영상 프레임 이미지와 텍스트를 모두 종합해서 아래 JSON 형식으로만 응답하세요.

{
  "ingredients": ["주재료1 (양)", "주재료2 (양)", ...],
  "sauce": ["양념재료1 (양)", "양념재료2 (양)", ...],
  "steps": ["1단계 상세 설명", "2단계 상세 설명", ...],
  "servings": "몇 인분 (없으면 null)",
  "time": "총 조리 시간 (없으면 null)",
  "note": "영상에서 강조한 팁·주의사항 2-3문장 (없으면 null)"
}

규칙:
- ingredients: 이미지와 자막 모두에서 등장하는 주재료 전부 (고기, 채소, 김치류 등). 하나도 빠짐없이. 용량 포함.
- sauce: 양념/소스 재료만 분리 (간장, 고춧가루 등 + 용량). 없으면 []
- steps: 조리 순서를 구체적으로. 불 세기, 조리 시간(몇 분) 반드시 포함. 최소 5단계.
- note: 실패하지 않는 팁, 대체 재료, 주의사항`,
  }

  const messageContent = hasFrames
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
    const errData = await response.json().catch(() => ({}))
    throw new Error(errData?.error?.message || `API 오류 ${response.status}`)
  }

  const data = await response.json()
  const text = data.content[0].text.trim()

  const jsonMatch = text.match(/\{[\s\S]+\}/)
  if (!jsonMatch) return null
  const parsed = JSON.parse(jsonMatch[0])
  if (!parsed || (!parsed.ingredients?.length && !parsed.steps?.length)) return null

  parsed.sourceType = [
    hasFrames && '영상',
    hasTranscript && '자막',
    hasDescription && '설명란',
  ].filter(Boolean).join('+')
  return parsed
}
