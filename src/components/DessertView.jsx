import { useState, useEffect, useCallback } from 'react'
import styles from './DessertView.module.css'
import {
  getCityLocation,
  osmEmbedUrl,
  naverMapUrl,
  cleanAddress,
  recommendCafesByTheme,
  getCachedCafes,
} from '../utils/cafes'

const THEMES = [
  { key: 'coffee', label: '☕ 커피 맛집', hint: '원두·에스프레소 퀄리티' },
  { key: 'dessert', label: '🍰 디저트 카페', hint: '케이크·베이커리' },
]

const emptyState = () => ({
  coffee: { items: null, loading: false, error: null },
  dessert: { items: null, loading: false, error: null },
})

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
  const [res, setRes] = useState(emptyState)
  const [theme, setTheme] = useState('coffee')

  useEffect(() => {
    let alive = true
    getCityLocation()
      .then(l => { if (alive) setLoc(l) })
      .catch(e => { if (alive) setLocErr(e.message) })
    return () => { alive = false }
  }, [])

  // Load one theme. Uses the in-memory cache unless force=true.
  const loadTheme = useCallback(
    (city, t, force = false) => {
      const cached = !force && getCachedCafes(city, t)
      if (cached) {
        setRes(r => ({ ...r, [t]: { items: cached, loading: false, error: null } }))
        return
      }
      setRes(r => ({ ...r, [t]: { ...r[t], loading: true, error: null } }))
      recommendCafesByTheme({ apiKey, city, theme: t, force })
        .then(items => setRes(r => ({ ...r, [t]: { items, loading: false, error: null } })))
        .catch(e => setRes(r => ({ ...r, [t]: { items: null, loading: false, error: e.message } })))
    },
    [apiKey]
  )

  // Once we know the city, fire BOTH themes in parallel so each list arrives
  // independently (cached ones resolve instantly).
  useEffect(() => {
    if (!loc) return
    const city = loc.city || loc.full
    loadTheme(city, 'coffee')
    loadTheme(city, 'dessert')
  }, [loc, loadTheme])

  const cityLabel = loc?.full || loc?.city || null
  const cur = res[theme]
  const list = cur.items || []
  const city = loc?.city || loc?.full

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
            <span className={styles.toggleLabel}>
              {t.label}
              {res[t.key].loading && <span className={styles.dot} />}
            </span>
            <span className={styles.toggleHint}>{t.hint}</span>
          </button>
        ))}
      </div>

      {/* Body */}
      <div className={styles.body}>
        {locErr && !loc && (
          <div className={styles.notice}>📍 {locErr}</div>
        )}

        {cur.loading && (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>
              실시간으로 {cityLabel ? `${cityLabel} ` : ''}{theme === 'coffee' ? '커피 맛집' : '디저트 카페'}을 검색하고 있어요...
              <br />
              <span className={styles.loadingSub}>현재 영업 중인 곳만 골라낼게요</span>
            </p>
          </div>
        )}

        {cur.error && !cur.loading && (
          <div className={styles.error}>
            <p>😢 {cur.error}</p>
            {city && (
              <button className={styles.retryBtn} onClick={() => loadTheme(city, theme, true)}>
                다시 시도
              </button>
            )}
          </div>
        )}

        {!cur.loading && !cur.error && cur.items && (
          <>
            {list.length === 0 ? (
              <div className={styles.notice}>
                추천할 만한 곳을 찾지 못했어요. 새로고침을 해볼까요?
              </div>
            ) : (
              <div className={styles.list}>
                {list.map((cafe, i) => (
                  <CafeCard key={`${cafe.name}-${i}`} cafe={cafe} rank={i + 1} city={city} />
                ))}
              </div>
            )}

            <p className={styles.disclaimer}>
              실시간 웹 검색 기반 추천이에요. 영업 여부는 최선을 다해 확인하지만,
              방문 전 네이버 지도에서 영업시간을 한 번 더 확인해줘요 🙏
            </p>

            {city && (
              <button
                className={styles.refreshBtn}
                onClick={() => loadTheme(city, theme, true)}
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
