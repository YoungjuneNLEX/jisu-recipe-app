import { useState, useEffect, useMemo } from 'react'
import AddRecipe from './components/AddRecipe'
import RecipeCard from './components/RecipeCard'
import { getRecipes, deleteRecipe, toggleFavorite, saveRecipe } from './utils/storage'
import styles from './App.module.css'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''

export default function App() {
  const [recipes, setRecipes] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    setRecipes(getRecipes())
  }, [])

  const filtered = useMemo(() => {
    let list = recipes
    if (filter === 'favorite') list = list.filter(r => r.favorite)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.title?.toLowerCase().includes(q) ||
        r.author?.toLowerCase().includes(q) ||
        r.tags?.some(t => t.toLowerCase().includes(q)) ||
        r.ingredients?.some(i => i.toLowerCase().includes(q))
      )
    }
    return list
  }, [recipes, search, filter])

  function handleDelete(id) {
    if (!confirm('이 레시피를 삭제할까요?')) return
    setRecipes(deleteRecipe(id))
  }

  function handleToggleFavorite(id) {
    setRecipes(toggleFavorite(id))
  }

  function handleTagAdd(id, tag) {
    const recipe = recipes.find(r => r.id === id)
    if (!recipe || recipe.tags?.includes(tag)) return
    setRecipes(saveRecipe({ ...recipe, tags: [...(recipe.tags || []), tag] }))
  }

  const favoriteCount = recipes.filter(r => r.favorite).length

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logoArea}>
            <h1 className={styles.logo}>📖 레시피</h1>
            <p className={styles.subtitle}>유튜브 링크로 레시피 저장</p>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <AddRecipe onAdd={setRecipes} apiKey={API_KEY} />

        <div className={styles.toolbar}>
          <input
            className={styles.search}
            type="search"
            placeholder="레시피, 재료, 태그 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className={styles.filters}>
            <button
              className={`${styles.filterBtn} ${filter === 'all' ? styles.active : ''}`}
              onClick={() => setFilter('all')}
            >
              전체 {recipes.length}
            </button>
            <button
              className={`${styles.filterBtn} ${filter === 'favorite' ? styles.active : ''}`}
              onClick={() => setFilter('favorite')}
            >
              ★ {favoriteCount}
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🍳</span>
            {recipes.length === 0
              ? '아직 저장된 레시피가 없어요.\n유튜브 링크를 붙여넣어 보세요!'
              : '검색 결과가 없어요'}
          </div>
        ) : (
          <div className={styles.list}>
            {filtered.map(recipe => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onDelete={handleDelete}
                onToggleFavorite={handleToggleFavorite}
                onTagAdd={handleTagAdd}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
