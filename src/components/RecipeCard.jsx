import { useState } from 'react'
import styles from './RecipeCard.module.css'

const SAUCE_KEYWORDS = /양념|소스|마리네이드|드레싱|marinade|sauce|seasoning/i

function splitIngredients(ingredients = []) {
  const main = []
  const sauce = []
  let inSauce = false

  for (const item of ingredients) {
    if (SAUCE_KEYWORDS.test(item) && item.includes(':')) {
      inSauce = true
      const parts = item.split(':')[1]?.split(/,|·/) ?? []
      sauce.push(...parts.map(p => p.trim()).filter(Boolean))
    } else if (inSauce && item.length < 40) {
      sauce.push(item)
    } else {
      inSauce = false
      if (SAUCE_KEYWORDS.test(item) && !item.includes(':')) {
        sauce.push(item)
      } else {
        main.push(item)
      }
    }
  }
  return { main, sauce }
}

function CheckList({ items, prefix }) {
  const [checked, setChecked] = useState({})
  const toggle = i => setChecked(p => ({ ...p, [i]: !p[i] }))

  return (
    <ul className={styles.checkList}>
      {items.map((item, i) => (
        <li
          key={i}
          className={`${styles.checkItem} ${checked[i] ? styles.checked : ''}`}
          onClick={() => toggle(i)}
        >
          <span className={styles.checkbox}>
            {checked[i] ? '✓' : ''}
          </span>
          <span className={styles.checkLabel}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function RecipeCard({ recipe, onDelete, onToggleFavorite, onTagAdd }) {
  const [expanded, setExpanded] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [editingTag, setEditingTag] = useState(false)
  const [activeTab, setActiveTab] = useState('ingredients')

  const hasSauceField = recipe.sauce?.length > 0
  const { main: mainIngredients, sauce: parsedSauce } = splitIngredients(recipe.ingredients)
  const sauceIngredients = hasSauceField ? recipe.sauce : parsedSauce

  const hasContent = mainIngredients.length > 0 || sauceIngredients.length > 0 || recipe.steps?.length > 0 || recipe.note

  const tabs = [
    { key: 'ingredients', label: '재료', show: mainIngredients.length > 0 || sauceIngredients.length > 0 },
    { key: 'steps', label: '조리법', show: recipe.steps?.length > 0 },
    { key: 'note', label: '메모', show: !!recipe.note },
  ].filter(t => t.show)

  function handleTagSubmit(e) {
    e.preventDefault()
    const tag = tagInput.trim()
    if (!tag) return
    onTagAdd(recipe.id, tag)
    setTagInput('')
    setEditingTag(false)
  }

  return (
    <div className={`${styles.card} ${expanded ? styles.expanded : ''}`}>
      {/* Header */}
      <div className={styles.header} onClick={() => setExpanded(v => !v)}>
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

      {hasContent && (
        <button className={styles.expandBtn} onClick={() => setExpanded(v => !v)}>
          <span className={`${styles.chevron} ${expanded ? styles.up : ''}`}>›</span>
        </button>
      )}

      {expanded && hasContent && (
        <div className={styles.detail}>
          {tabs.length > 1 && (
            <div className={styles.tabs}>
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  className={`${styles.tab} ${activeTab === tab.key ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >{tab.label}</button>
              ))}
            </div>
          )}

          {/* Ingredients */}
          {activeTab === 'ingredients' && (
            <div className={styles.tabContent}>
              {mainIngredients.length > 0 && (
                <div className={styles.ingredientGroup}>
                  <p className={styles.groupLabel}>주재료</p>
                  <CheckList items={mainIngredients} prefix="main" />
                </div>
              )}
              {sauceIngredients.length > 0 && (
                <div className={styles.sauceGroup}>
                  <p className={styles.groupLabel}>양념장</p>
                  <CheckList items={sauceIngredients} prefix="sauce" />
                </div>
              )}
              {mainIngredients.length > 0 && (
                <p className={styles.checkHint}>탭하면 체크할 수 있어요</p>
              )}
            </div>
          )}

          {/* Steps */}
          {activeTab === 'steps' && recipe.steps?.length > 0 && (
            <div className={styles.tabContent}>
              <ol className={styles.stepList}>
                {recipe.steps.map((step, i) => (
                  <li key={i} className={styles.step}>
                    <span className={styles.stepNum}>{i + 1}</span>
                    <p className={styles.stepText}>{step}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Note */}
          {activeTab === 'note' && recipe.note && (
            <div className={styles.tabContent}>
              <div className={styles.noteBox}>
                <span className={styles.noteIcon}>💬</span>
                <p className={styles.noteText}>{recipe.note}</p>
              </div>
            </div>
          )}

          {/* Tag editor */}
          <div className={styles.tagEditor}>
            {recipe.tags?.map(t => <span key={t} className={styles.tag}>#{t}</span>)}
            {editingTag ? (
              <form onSubmit={handleTagSubmit} style={{ display: 'inline' }}>
                <input
                  autoFocus
                  className={styles.tagInput}
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  placeholder="태그"
                  onBlur={() => setEditingTag(false)}
                />
              </form>
            ) : (
              <button className={styles.addTagBtn} onClick={() => setEditingTag(true)}>+ 태그</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
