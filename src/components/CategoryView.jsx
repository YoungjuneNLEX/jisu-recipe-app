import { useState } from 'react'
import RecipeCard from './RecipeCard'
import styles from './CategoryView.module.css'

const UNTAGGED = '미분류'

// Group recipes into folders by tag. A recipe with multiple tags shows up in
// each matching folder; recipes with no tags fall into "미분류".
function groupByTag(recipes) {
  const groups = {}
  for (const r of recipes) {
    const tags = r.tags?.length ? r.tags : [UNTAGGED]
    for (const tag of tags) (groups[tag] ||= []).push(r)
  }
  return Object.entries(groups).sort((a, b) => {
    if (a[0] === UNTAGGED) return 1
    if (b[0] === UNTAGGED) return -1
    return b[1].length - a[1].length
  })
}

function FolderIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={styles.folderIcon} aria-hidden="true">
      {open ? (
        <path d="M3.5 8a1.8 1.8 0 0 1 1.8-1.8h2.7a1.8 1.8 0 0 1 1.3.5l.9 1a1.8 1.8 0 0 0 1.3.5h6.2A1.8 1.8 0 0 1 21.5 10l-.3.3M3.5 8v9.3a1.2 1.2 0 0 0 1.2 1.2h12.6a1.5 1.5 0 0 0 1.4-1l2-6a1 1 0 0 0-1-1.3H6.8a1.5 1.5 0 0 0-1.4 1L3.5 17" />
      ) : (
        <path d="M3.8 7.5a1.8 1.8 0 0 1 1.8-1.8h2.8a1.8 1.8 0 0 1 1.3.5l1 1a1.8 1.8 0 0 0 1.3.5h6A1.8 1.8 0 0 1 20 9.5v7.2a1.8 1.8 0 0 1-1.8 1.8H5.6a1.8 1.8 0 0 1-1.8-1.8V7.5Z" />
      )}
    </svg>
  )
}

function Folder({ tag, items, cardProps }) {
  const [open, setOpen] = useState(true)
  return (
    <div className={styles.folder}>
      <button className={styles.folderHead} onClick={() => setOpen(o => !o)}>
        <FolderIcon open={open} />
        <span className={styles.folderName}>{tag === UNTAGGED ? tag : `#${tag}`}</span>
        <span className={styles.count}>{items.length}</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}>⌄</span>
      </button>
      {open && (
        <div className={styles.folderBody}>
          {items.map(r => <RecipeCard key={r.id} recipe={r} {...cardProps} />)}
        </div>
      )}
    </div>
  )
}

export default function CategoryView({ recipes, onOpen, onDelete, onToggleFavorite }) {
  const groups = groupByTag(recipes)
  const cardProps = { onOpen, onDelete, onToggleFavorite }

  if (recipes.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>🗂</span>
        분류할 레시피가 아직 없어요.
        <br />레시피에 태그를 달면 폴더로 정리돼요.
      </div>
    )
  }

  return (
    <div className={styles.categories}>
      <p className={styles.hint}>태그별로 정리된 폴더예요. 눌러서 펼치거나 접을 수 있어요 📁</p>
      {groups.map(([tag, items]) => (
        <Folder key={tag} tag={tag} items={items} cardProps={cardProps} />
      ))}
    </div>
  )
}
