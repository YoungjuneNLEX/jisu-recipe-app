import RecipeCard from './RecipeCard'
import styles from './HomeView.module.css'

const byNewest = (a, b) => (b.createdAt || 0) - (a.createdAt || 0)

function Section({ title, subtitle, items, empty, cardProps }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle && <span className={styles.sectionSub}>{subtitle}</span>}
      </div>
      {items.length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <div className={styles.list}>
          {items.map(r => <RecipeCard key={r.id} recipe={r} {...cardProps} />)}
        </div>
      )}
    </section>
  )
}

export default function HomeView({ recipes, onOpen, onDelete, onToggleFavorite }) {
  const latest = [...recipes].sort(byNewest).slice(0, 5)
  const favorites = recipes.filter(r => r.favorite).sort(byNewest).slice(0, 5)
  const cardProps = { onOpen, onDelete, onToggleFavorite }

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
      />
      <Section
        title="⭐ 즐겨찾는 레시피"
        items={favorites}
        empty="별(☆)을 눌러 즐겨찾기에 추가해 보세요"
        cardProps={cardProps}
      />
    </div>
  )
}
