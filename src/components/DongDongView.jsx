import { useState, useRef, useEffect } from 'react'
import styles from './DongDongView.module.css'

const QUICK_ACTIONS = [
  { label: '🌅 아침 뭐먹지?', message: '오늘 아침에 뭐 먹을까?' },
  { label: '☀️ 점심 뭐먹지?', message: '오늘 점심에 뭐 먹을까?' },
  { label: '🌙 저녁 뭐먹지?', message: '오늘 저녁에 뭐 먹을까?' },
  { label: '🌃 야식 뭐먹지?', message: '야식으로 뭐 먹을까?' },
  { label: '🍪 간식 뭐먹지?', message: '간식으로 뭐가 좋을까?' },
  { label: '🍽️ 외식 어디서?', message: '오늘 외식하려고 하는데 어디서 먹을까?' },
]

function getTimeLabel() {
  const h = new Date().getHours()
  if (h < 6) return '새벽'
  if (h < 10) return '아침'
  if (h < 12) return '오전'
  if (h < 14) return '점심'
  if (h < 18) return '오후'
  if (h < 21) return '저녁'
  return '밤'
}

function formatTime() {
  const now = new Date()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]}) ${getTimeLabel()} ${now.getHours()}시`
}

async function getWeather(lat, lon) {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=Asia%2FSeoul`
    )
    const data = await res.json()
    const code = data.current_weather?.weathercode
    const temp = data.current_weather?.temperature
    const weatherDesc = weatherCodeToKo(code)
    return `${weatherDesc}, 기온 ${temp}°C`
  } catch {
    return null
  }
}

function weatherCodeToKo(code) {
  if (code === 0) return '맑음'
  if (code <= 3) return '구름 조금'
  if (code <= 48) return '안개'
  if (code <= 57) return '이슬비'
  if (code <= 67) return '비'
  if (code <= 77) return '눈'
  if (code <= 82) return '소나기'
  if (code <= 99) return '뇌우'
  return '흐림'
}

async function getLocationName(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`
    )
    const data = await res.json()
    const addr = data.address
    return addr.city || addr.town || addr.county || addr.state || '알 수 없는 위치'
  } catch {
    return null
  }
}

export default function DongDongView({ recipes = [], apiKey = '' }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: '안녕! 나는 **동동이**야 🐾\n\n오늘 뭐 먹을지 고민이야? 아래 버튼을 눌러봐!\n냉장고에 있는 재료를 알려줘도 맛있는 메뉴를 추천해줄게 😋',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [ctx, setCtx] = useState({ time: formatTime(), weather: null, location: null })
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        const [weather, location] = await Promise.all([
          getWeather(lat, lon),
          getLocationName(lat, lon),
        ])
        setCtx(c => ({ ...c, weather, location }))
      })
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setInput('')
    setLoading(true)

    const userMsg = { role: 'user', text: trimmed }
    setMessages(prev => [...prev, userMsg])

    const assistantMsg = { role: 'assistant', text: '' }
    setMessages(prev => [...prev, assistantMsg])

    try {
      if (!apiKey) throw new Error('API 키가 없어요')

      const { time, weather, location } = { ...ctx, time: formatTime() }

      const systemPrompt = `너는 "동동이"야. 귀엽고 친근한 음식 추천 도우미야. 한국어로 대화하고, 따뜻하고 친근한 말투를 써. 이모지를 적절히 사용해.

현재 상황 정보:
- 시간: ${time}
- 날씨: ${weather || '알 수 없음'}
- 위치: ${location || '알 수 없음'}

사용자가 저장한 레시피 목록: ${recipes?.length ? recipes.map(r => r.title).join(', ') : '없음'}

역할:
1. 아침/점심/저녁/야식/간식/외식 메뉴 추천 시 → 현재 시간, 날씨, 계절을 고려해서 2~3가지 구체적인 메뉴를 추천해줘. 추천 이유도 간단히 설명해.
2. 냉장고 재료를 알려주면 → 그 재료로 만들 수 있는 메뉴와 간단한 조리법을 알려줘.
3. 외식 장소 추천 시 → 현재 날씨와 분위기에 맞는 음식 종류를 추천해줘.
4. 사용자 레시피 중 관련된 것이 있으면 언급해줘.

답변은 짧고 친근하게, 너무 길지 않게 해줘. 마크다운 헤더(#, ##)는 쓰지 말고, 볼드(**텍스트**)는 사용해도 돼.`

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
          max_tokens: 600,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: trimmed }],
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || `오류 (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              accumulated += parsed.delta.text
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', text: accumulated }
                return next
              })
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', text: '앗, 오류가 났어 😢 잠깐 후에 다시 시도해줘!' }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    send(input)
  }

  function renderText(text) {
    // Bold **text** → <strong>
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      return part.split('\n').map((line, j, arr) => (
        <span key={`${i}-${j}`}>
          {line}
          {j < arr.length - 1 && <br />}
        </span>
      ))
    })
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.avatar}>🐾</div>
        <div className={styles.headerInfo}>
          <h2 className={styles.name}>동동이</h2>
          <p className={styles.status}>
            {ctx.location && ctx.weather
              ? `📍 ${ctx.location} · ${ctx.weather}`
              : ctx.location
              ? `📍 ${ctx.location}`
              : ctx.weather
              ? ctx.weather
              : '위치 파악 중...'}
          </p>
        </div>
      </div>

      <div className={styles.messages}>
        {messages.map((msg, i) => (
          <div key={i} className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.aiBubble}`}>
            {msg.role === 'assistant' && <span className={styles.bubbleAvatar}>🐾</span>}
            <div className={styles.bubbleText}>{renderText(msg.text)}</div>
          </div>
        ))}
        {loading && messages[messages.length - 1]?.text === '' && (
          <div className={`${styles.bubble} ${styles.aiBubble}`}>
            <span className={styles.bubbleAvatar}>🐾</span>
            <div className={styles.typing}>
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className={styles.quickActions}>
        {QUICK_ACTIONS.map(({ label, message }) => (
          <button
            key={label}
            className={styles.quickBtn}
            onClick={() => send(message)}
            disabled={loading}
          >
            {label}
          </button>
        ))}
      </div>

      <form className={styles.inputArea} onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="냉장고 재료나 원하는 메뉴를 물어봐!"
          disabled={loading}
        />
        <button
          type="submit"
          className={styles.sendBtn}
          disabled={!input.trim() || loading}
          aria-label="전송"
        >
          ↑
        </button>
      </form>
    </div>
  )
}
