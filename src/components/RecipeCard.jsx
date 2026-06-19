import styles from './RecipeCard.module.css'

export default function RecipeCard({ recipe, onOpen, onDelete, onToggleFavorite }) {
  return (
    <div className={styles.card}>
      <div className={styles.header} onClick={() => onOpen(recipe.id)}>
        <div className={styles.thumbnailWrap}>
          {recipe.thumbnail ? (
            <img className={styles.thumbnail} src={recipe.thumbnail} alt={recipe.title} />
          ) : (
            <div className={styles.thumbPlaceholder}>🍳</div>
          )}
        </div>

        <div className={styles.info}>
          <div className={styles.topRow}>
            <h3 className={styles.title}>{recipe.title}</h3>
            <div className={styles.actions} onClick={e => e.stopPropagation()}>
              <button
                className={`${styles.favBtn} ${recipe.favorite ? styles.favorited : ''}`}
                onClick={() => onToggleFavorite(recipe.id)}
              >{recipe.favorite ? '★' : '☆'}</button>
              <button className={styles.deleteBtn} onClick={() => onDelete(recipe.id)}>✕</button>
            </div>
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
