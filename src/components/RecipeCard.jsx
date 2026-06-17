import styles from './RecipeCard.module.css'
import { splitIngredients } from '../utils/recipe'

export default function RecipeCard({ recipe, onOpen, onDelete, onToggleFavorite }) {
  const { main: mainIngredients } = splitIngredients(recipe.ingredients)

  return (
    <div className={styles.card}>
      <div className={styles.header} onClick={() => onOpen(recipe.id)}>
        <div className={styles.thumbnailWrap}>
          <img className={styles.thumbnail} src={recipe.thumbnail} alt={recipe.title} />
          <a
            className={styles.playBtn}
            href={recipe.videoUrl}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
          >▶</a>
        </div>

        <div className={styles.info}>
          <div className={styles.topRow}>
            <span className={styles.author}>{recipe.author}</span>
            <div className={styles.actions} onClick={e => e.stopPropagation()}>
              <button
                className={`${styles.favBtn} ${recipe.favorite ? styles.favorited : ''}`}
                onClick={() => onToggleFavorite(recipe.id)}
              >{recipe.favorite ? '★' : '☆'}</button>
              <button className={styles.deleteBtn} onClick={() => onDelete(recipe.id)}>✕</button>
            </div>
          </div>

          <h3 className={styles.title}>{recipe.title}</h3>

          <div className={styles.metaRow}>
            {recipe.servings && <span className={styles.metaChip}>🍽 {recipe.servings}</span>}
            {recipe.time && <span className={styles.metaChip}>⏱ {recipe.time}</span>}
            {mainIngredients.length > 0 && (
              <span className={styles.metaChip}>🥕 재료 {mainIngredients.length}가지</span>
            )}
            {recipe.sourceType && (
              <span className={`${styles.metaChip} ${styles.aiChip}`}>✦ AI 분석</span>
            )}
          </div>

          {recipe.tags?.length > 0 && (
            <div className={styles.tagRow}>
              {recipe.tags.map(t => <span key={t} className={styles.tag}>#{t}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
