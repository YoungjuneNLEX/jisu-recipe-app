import { useState, useEffect, useRef } from 'react'
import styles from './RecipeDetail.module.css'
import { splitIngredients } from '../utils/recipe'
import { extractVideoId } from '../utils/youtube'

function CheckList({ items }) {
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
          <span className={styles.checkbox}>{checked[i] ? '✓' : ''}</span>
          <span className={styles.checkLabel}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function RecipeDetail({ recipe, onClose, onDelete, onEdit, onToggleFavorite, onTagAdd }) {
  const [tagInput, setTagInput] = useState('')
  const [editingTag, setEditingTag] = useState(false)
  const [active, setActive] = useState('ingredients')
  const sectionRefs = useRef({})

  const { main: mainIngredients, sauce: parsedSauce } = splitIngredients(recipe.ingredients)
  const sauceIngredients = recipe.sauce?.length > 0 ? recipe.sauce : parsedSauce
  const videoId = recipe.videoUrl ? extractVideoId(recipe.videoUrl) : null

  const sections = [
    {
      key: 'ingredients',
      label: '재료',
      icon: '🥕',
      show: mainIngredients.length > 0 || sauceIngredients.length > 0,
    },
    { key: 'steps', label: '조리법', icon: '👩‍🍳', show: recipe.steps?.length > 0 },
    { key: 'note', label: '메모', icon: '💬', show: !!recipe.note },
  ].filter(s => s.show)

  // Highlight the section currently in view for the side nav
  useEffect(() => {
    if (sections.length < 2) return
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]) setActive(visible[0].target.dataset.section)
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    )
    Object.values(sectionRefs.current).forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [recipe.id, sections.length])

  function scrollTo(key) {
    sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleTagSubmit(e) {
    e.preventDefault()
    const tag = tagInput.trim()
    if (!tag) return
    onTagAdd(recipe.id, tag)
    setTagInput('')
    setEditingTag(false)
  }

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <header className={styles.topbar}>
        <button className={styles.backBtn} onClick={onClose} aria-label="뒤로">←</button>
        <span className={styles.topAuthor}>{recipe.author}</span>
        <div className={styles.topActions}>
          <button
            className={`${styles.favBtn} ${recipe.favorite ? styles.favorited : ''}`}
            onClick={() => onToggleFavorite(recipe.id)}
            aria-label="즐겨찾기"
          >{recipe.favorite ? '★' : '☆'}</button>
          <button
            className={styles.deleteBtn}
            onClick={() => onDelete(recipe.id)}
            aria-label="삭제"
          >✕</button>
        </div>
      </header>

      <div className={styles.scroll}>
        {/* Hero */}
        <div className={styles.hero}>
          <div className={styles.thumbWrap}>
            {videoId ? (
              <iframe
                className={styles.embed}
                src={`https://www.youtube.com/embed/${videoId}`}
                title={recipe.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : recipe.thumbnail ? (
              <img className={styles.thumb} src={recipe.thumbnail} alt={recipe.title} />
            ) : (
              <div className={styles.thumbPlaceholder}>🍳</div>
            )}
          </div>
          <h1 className={styles.title}>{recipe.title}</h1>
          <div className={styles.metaRow}>
            {recipe.servings && <span className={styles.metaChip}>🍽 {recipe.servings}</span>}
            {recipe.time && <span className={styles.metaChip}>⏱ {recipe.time}</span>}
            {recipe.sourceType && (
              <span className={`${styles.metaChip} ${styles.aiChip}`}>✦ AI 분석</span>
            )}
          </div>

          {/* Tags */}
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

        {/* Sections */}
        {sections.length === 0 && (
          <p className={styles.emptyNote}>
            아직 정리된 레시피 내용이 없어요.<br />영상을 직접 확인해 주세요 🎬
          </p>
        )}

        {sections.some(s => s.key === 'ingredients') && (
          <section
            className={styles.section}
            data-section="ingredients"
            ref={el => (sectionRefs.current.ingredients = el)}
          >
            <h2 className={styles.sectionTitle}>🥕 재료</h2>
            {mainIngredients.length > 0 && (
              <div className={styles.ingredientGroup}>
                <p className={styles.groupLabel}>주재료</p>
                <CheckList items={mainIngredients} />
              </div>
            )}
            {sauceIngredients.length > 0 && (
              <div className={styles.sauceGroup}>
                <p className={styles.groupLabel}>양념장</p>
                <CheckList items={sauceIngredients} />
              </div>
            )}
            {mainIngredients.length > 0 && (
              <p className={styles.checkHint}>탭하면 체크할 수 있어요</p>
            )}
          </section>
        )}

        {sections.some(s => s.key === 'steps') && (
          <section
            className={styles.section}
            data-section="steps"
            ref={el => (sectionRefs.current.steps = el)}
          >
            <h2 className={styles.sectionTitle}>👩‍🍳 조리법</h2>
            <ol className={styles.stepList}>
              {recipe.steps.map((step, i) => (
                <li key={i} className={styles.step}>
                  <span className={styles.stepNum}>{i + 1}</span>
                  <p className={styles.stepText}>{step}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {sections.some(s => s.key === 'note') && (
          <section
            className={styles.section}
            data-section="note"
            ref={el => (sectionRefs.current.note = el)}
          >
            <h2 className={styles.sectionTitle}>💬 메모</h2>
            <div className={styles.noteBox}>
              <p className={styles.noteText}>{recipe.note}</p>
            </div>
          </section>
        )}

        {/* Bottom actions */}
        <div className={styles.bottomActions}>
          {recipe.videoUrl && (
            <a
              className={styles.youtubeBtn}
              href={recipe.videoUrl}
              target="_blank"
              rel="noreferrer"
            >▶ 유튜브로 이동</a>
          )}
          <div className={styles.actionRow}>
            <button className={styles.editBtn} onClick={() => onEdit(recipe.id)}>✏️ 수정하기</button>
            <button className={styles.removeBtn} onClick={() => onDelete(recipe.id)}>🗑 삭제하기</button>
          </div>
        </div>

        <div className={styles.bottomSpace} />
      </div>

      {/* Floating side navigation */}
      {sections.length > 1 && (
        <nav className={styles.sideNav}>
          {sections.map(s => (
            <button
              key={s.key}
              className={`${styles.navItem} ${active === s.key ? styles.navActive : ''}`}
              onClick={() => scrollTo(s.key)}
            >
              <span className={styles.navIcon}>{s.icon}</span>
              <span className={styles.navLabel}>{s.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
