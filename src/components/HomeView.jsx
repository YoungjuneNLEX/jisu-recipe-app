import { useState } from 'react'
import RecipeCard from './RecipeCard'
import styles from './HomeView.module.css'

const byNewest = (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
const LIMIT = 5

// One home section. By default it shows the newest `LIMIT` items with a
// "더보기" toggle that reveals the rest; pass expandable={false} to cap it.
function Section({ title, items, empty, cardProps, expandable = true }) {
  const [expanded, setExpanded] = useState(false)
  const hasMore = expandable && items.length > LIMIT
  const visible = expanded ? items : items.slice(0, LIMIT)

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {items.length > 0 && <span className={styles.sectionSub}>{items.length}</span>}
      </div>

      {items.length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <>
          <div className={styles.list}>
            {visible.map(r => <RecipeCard key={r.id} recipe={r} {...cardProps} />)}
          </div>
          {hasMore && (
            <button className={styles.moreBtn} onClick={() => setExpanded(e => !e)}>
              {expanded ? '접기 ▲' : `더보기 (${items.length - LIMIT}개 더) ▼`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export default function HomeView({ recipes, onOpen, onDelete, onToggleFavorite }) {
  const cardProps = { onOpen, onDelete, onToggleFavorite }
  const latest = [...recipes].sort(byNewest).slice(0, LIMIT)
  const favorites = recipes.filter(r => r.favorite).sort(byNewest)
  // "개인 레시피" is driven purely by the 셀프 tag — remove the tag and it drops
  // out of this section and falls into 미분류 in the category view.
  const selfRecipes = recipes
    .filter(r => r.tags?.includes('셀프'))
    .sort(byNewest)

  if (recipes.length === 0) {
    return (
      <div className={styles.firstEmpty}>
        <span className={styles.firstEmptyIcon}>🍳</span>
        아직 저장된 레시피가 없어요.
        <br />아래 <strong>＋</strong> 버튼으로 레시피를 추가해 보세요!
      </div>
    )
  }

  return (
    <div className={styles.home}>
      <Section
        title="🆕 최근 추가한 레시피"
        items={latest}
        empty="아직 저장된 레시피가 없어요"
        cardProps={cardProps}
        expandable={false}
      />
      <Section
        title="⭐ 즐겨찾는 레시피"
        items={favorites}
        empty="별(☆)을 눌러 즐겨찾기에 추가해 보세요"
        cardProps={cardProps}
      />
      <Section
        title="✏️ 개인 레시피"
        items={selfRecipes}
        empty="직접 만든 레시피가 여기에 모여요"
        cardProps={cardProps}
      />
    </div>
  )
}
