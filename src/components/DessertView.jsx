import { useState, useEffect, useCallback } from 'react'
import styles from './DessertView.module.css'
import { getCityLocation, osmEmbedUrl, naverMapUrl, cleanAddress, recommendCafes } from '../utils/cafes'

const THEMES = [
  { key: 'coffee', label: '☕ 커피 맛집', hint: '원두·에스프레소 퀄리티' },
  { key: 'dessert', label: '🍰 디저트 카페', hint: '케이크·베이커리' },
]

function CafeCard({ cafe, rank, city }) {
  const address = cleanAddress(cafe.address)
  return (
    <div className={styles.card}>
      <div className={styles.rank}>{rank}</div>
      <div className={styles.cardBody}>
        <div className={styles.cardHead}>
          <h3 className={styles.cafeName}>{cafe.name}</h3>
        </div>

        {(cafe.signature || cafe.beans) && (
          <div className={styles.chips}>
            {cafe.beans && <span className={styles.chip}>🫘 {cafe.beans}</span>}
            {cafe.signature && <span className={styles.chip}>⭐ {cafe.signature}</span>}
          </div>
        )}

        {cafe.reason && <p className={styles.reason}>{cafe.reason}</p>}
        {cafe.review && <p className={styles.review}>“{cafe.review}”</p>}

        {address && (
          <p className={styles.address}>📍 {address}</p>
        )}

        <a
          className={styles.mapLink}
          href={naverMapUrl(cafe.name, cafe.address, city)}
          target="_blank"
          rel="noopener noreferrer"
        >
          네이버 지도에서 보기 →
        </a>
      </div>
    </div>
  )
}

export default function DessertView({ apiKey = '' }) {
  const [loc, setLoc] = useState(null)
  const [locErr, setLocErr] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [theme, setTheme] = useState('coffee')

  useEffect(() => {
    let alive = true
    getCityLocation()
      .then(l => { if (alive) setLoc(l) })
      .catch(e => { if (alive) setLocErr(e.message) })
    return () => { alive = false }
  }, [])

  const fetchCafes = useCallback(
    city => {
      const controller = new AbortController()
      setLoading(true)
      setError(null)
      setData(null)
      recommendCafes({ apiKey, city, signal: controller.signal })
        .then(d => setData(d))
        .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
        .finally(() => setLoading(false))
      return controller
    },
    [apiKey]
  )

  useEffect(() => {
    if (!loc) return
    const controller = fetchCafes(loc.city || loc.full)
    return () => controller.abort()
  }, [loc, fetchCafes])

  const cityLabel = data?.city || loc?.full || loc?.city || null
  const list = data ? (theme === 'coffee' ? data.coffee : data.dessert) : []

  return (
    <div className={styles.container}>
      {/* Map */}
      <div className={styles.mapWrap}>
        {loc ? (
          <iframe
            className={styles.map}
            title="현재 위치 지도"
            src={osmEmbedUrl(loc.lat, loc.lon)}
            loading="lazy"
          />
        ) : (
          <div className={styles.mapPlaceholder}>
            {locErr ? `🗺️ ${locErr}` : '🗺️ 위치를 불러오는 중...'}
          </div>
        )}
        {cityLabel && (
          <div className={styles.cityBadge}>📍 {cityLabel} 전역 추천</div>
        )}
      </div>

      {/* Theme toggle */}
      <div className={styles.toggle}>
        {THEMES.map(t => (
          <button
            key={t.key}
            className={`${styles.toggleBtn} ${theme === t.key ? styles.toggleActive : ''}`}
            onClick={() => setTheme(t.key)}
          >
            <span className={styles.toggleLabel}>{t.label}</span>
            <span className={styles.toggleHint}>{t.hint}</span>
          </button>
        ))}
      </div>

      {/* Body */}
      <div className={styles.body}>
        {locErr && !loc && (
          <div className={styles.notice}>📍 {locErr}</div>
        )}

        {loading && (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>
              실시간으로 {cityLabel ? `${cityLabel} ` : ''}카페를 검색하고 있어요...
              <br />
              <span className={styles.loadingSub}>현재 영업 중인 곳만 골라낼게요 (조금 걸려요)</span>
            </p>
          </div>
        )}

        {error && !loading && (
          <div className={styles.error}>
            <p>😢 {error}</p>
            {loc && (
              <button className={styles.retryBtn} onClick={() => fetchCafes(loc.city || loc.full)}>
                다시 시도
              </button>
            )}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {list.length === 0 ? (
              <div className={styles.notice}>
                추천할 만한 곳을 찾지 못했어요. 다시 시도해볼까요?
              </div>
            ) : (
              <div className={styles.list}>
                {list.map((cafe, i) => (
                  <CafeCard
                    key={`${cafe.name}-${i}`}
                    cafe={cafe}
                    rank={i + 1}
                    city={loc?.city || data?.city}
                  />
                ))}
              </div>
            )}

            <p className={styles.disclaimer}>
              실시간 웹 검색 기반 추천이에요. 영업 여부는 최선을 다해 확인하지만,
              방문 전 네이버 지도에서 영업시간을 한 번 더 확인해줘요 🙏
            </p>

            {loc && (
              <button
                className={styles.refreshBtn}
                onClick={() => fetchCafes(loc.city || loc.full)}
              >
                🔄 새로고침
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
