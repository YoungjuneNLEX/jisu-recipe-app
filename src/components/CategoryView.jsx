import { useState } from 'react'
import RecipeCard from './RecipeCard'
import { categoryColor, UNCATEGORIZED } from '../utils/category'
import styles from './CategoryView.module.css'

function FolderIcon({ open, color }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={styles.folderIcon} aria-hidden="true">
      {open ? (
        <path d="M3.8 7.5a1.8 1.8 0 0 1 1.8-1.8h2.8a1.8 1.8 0 0 1 1.3.5l1 1a1.8 1.8 0 0 0 1.3.5h6A1.8 1.8 0 0 1 20 9.5M3.8 7.5v9.2a1.8 1.8 0 0 0 1.8 1.8h11.5a1.5 1.5 0 0 0 1.45-1.1l1.4-5a1 1 0 0 0-.96-1.27H7a1.5 1.5 0 0 0-1.45 1.1L3.8 16.7" />
      ) : (
        <path d="M3.8 7.5a1.8 1.8 0 0 1 1.8-1.8h2.8a1.8 1.8 0 0 1 1.3.5l1 1a1.8 1.8 0 0 0 1.3.5h6A1.8 1.8 0 0 1 20 9.5v7.2a1.8 1.8 0 0 1-1.8 1.8H5.6a1.8 1.8 0 0 1-1.8-1.8V7.5Z" />
      )}
    </svg>
  )
}

function Folder({ name, items, cardProps, special, onRename, onDelete }) {
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const color = categoryColor(special ? UNCATEGORIZED : name)

  // Commit on Enter AND on blur (mobile keyboards blur before submit fires)
  function commitRename() {
    if (!editing) return
    const next = draft.trim()
    if (next && next !== name) onRename(name, next)
    setEditing(false)
  }

  return (
    <div className={styles.folder} style={{ borderColor: color.bg }}>
      <div className={styles.folderHead} style={{ background: color.bg }}>
        {editing ? (
          <form onSubmit={e => { e.preventDefault(); commitRename() }} className={styles.renameForm}>
            <input
              autoFocus
              className={styles.renameInput}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitRename}
            />
          </form>
        ) : (
          <button className={styles.folderToggle} onClick={() => setOpen(o => !o)}>
            <FolderIcon open={open} color={color.fg} />
            <span className={styles.folderName} style={{ color: color.fg }}>
              {special ? UNCATEGORIZED : name}
            </span>
            <span className={styles.count} style={{ color: color.fg }}>{items.length}</span>
            <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} style={{ color: color.fg }}>⌄</span>
          </button>
        )}
        {!special && !editing && (
          <div className={styles.folderActions}>
            <button className={styles.folderBtn} onClick={() => { setDraft(name); setEditing(true) }} aria-label="이름 변경">✎</button>
            <button className={styles.folderBtn} onClick={() => onDelete(name)} aria-label="삭제">🗑</button>
          </div>
        )}
      </div>

      {open && (
        items.length > 0 ? (
          <div className={styles.folderBody}>
            {items.map(r => <RecipeCard key={r.id} recipe={r} {...cardProps} />)}
          </div>
        ) : (
          <p className={styles.emptyFolder}>아직 이 카테고리에 담긴 레시피가 없어요</p>
        )
      )}
    </div>
  )
}

export default function CategoryView({ recipes, categories, onAddCategory, onRenameCategory, onDeleteCategory, ...cardProps }) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const known = new Set(categories)
  const uncategorized = recipes.filter(r => !r.category || !known.has(r.category))

  function submitAdd(e) {
    e.preventDefault()
    const name = newName.trim()
    if (name) onAddCategory(name)
    setNewName('')
    setAdding(false)
  }

  return (
    <div className={styles.categories}>
      <div className={styles.topBar}>
        <p className={styles.hint}>카테고리(폴더)로 레시피를 정리해요 📁</p>
        {adding ? (
          <form onSubmit={submitAdd} className={styles.addForm}>
            <input
              autoFocus
              className={styles.addInput}
              value={newName}
              placeholder="새 카테고리 이름"
              onChange={e => setNewName(e.target.value)}
              onBlur={() => { setNewName(''); setAdding(false) }}
            />
          </form>
        ) : (
          <button className={styles.addBtn} onClick={() => setAdding(true)}>+ 새 카테고리</button>
        )}
      </div>

      {categories.length === 0 && uncategorized.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🗂</span>
          아직 레시피가 없어요.
          <br />카테고리를 만들어 정리해 보세요.
        </div>
      ) : (
        <>
          {categories.map(name => (
            <Folder
              key={name}
              name={name}
              items={recipes.filter(r => r.category === name)}
              cardProps={cardProps}
              onRename={onRenameCategory}
              onDelete={onDeleteCategory}
            />
          ))}
          {uncategorized.length > 0 && (
            <Folder name={UNCATEGORIZED} items={uncategorized} cardProps={cardProps} special />
          )}
        </>
      )}
    </div>
  )
}
