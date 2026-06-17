import { useState, useEffect, useMemo } from 'react'
import AddRecipe from './components/AddRecipe'
import RecipeCard from './components/RecipeCard'
import RecipeDetail from './components/RecipeDetail'
import RecipeForm from './components/RecipeForm'
import { getRecipes, deleteRecipe, toggleFavorite, saveRecipe } from './utils/storage'
import styles from './App.module.css'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''

// Parse the current hash into a route: list / new / detail / edit
function parseRoute(hash) {
  const h = hash || ''
  if (h === '#/new') return { view: 'new' }
  const edit = h.match(/^#\/recipe\/(.+)\/edit$/)
  if (edit) return { view: 'edit', id: decodeURIComponent(edit[1]) }
  const detail = h.match(/^#\/recipe\/(.+)$/)
  if (detail) return { view: 'detail', id: decodeURIComponent(detail[1]) }
  return { view: 'list' }
}

export default function App() {
  const [recipes, setRecipes] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))

  useEffect(() => {
    setRecipes(getRecipes())
  }, [])

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function openRecipe(id) {
    window.location.hash = `#/recipe/${encodeURIComponent(id)}`
  }

  function openNewRecipe() {
    window.location.hash = '#/new'
  }

  function openEditRecipe(id) {
    window.location.hash = `#/recipe/${encodeURIComponent(id)}/edit`
  }

  function closeRecipe() {
    if (window.history.length > 1) window.history.back()
    else window.location.hash = ''
  }

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
    if (route.id === id) window.location.hash = ''
  }

  function handleToggleFavorite(id) {
    setRecipes(toggleFavorite(id))
  }

  function handleTagAdd(id, tag) {
    const recipe = recipes.find(r => r.id === id)
    if (!recipe || recipe.tags?.includes(tag)) return
    setRecipes(saveRecipe({ ...recipe, tags: [...(recipe.tags || []), tag] }))
  }

  // Save a manually created/edited recipe, then jump to its detail page
  function handleSaveForm(recipe) {
    setRecipes(saveRecipe(recipe))
    window.location.hash = `#/recipe/${encodeURIComponent(recipe.id)}`
  }

  const favoriteCount = recipes.filter(r => r.favorite).length

  if (route.view === 'new') {
    return <RecipeForm onSave={handleSaveForm} onClose={closeRecipe} />
  }

  if (route.view === 'edit') {
    const editing = recipes.find(r => r.id === route.id)
    if (editing) {
      return <RecipeForm recipe={editing} onSave={handleSaveForm} onClose={closeRecipe} />
    }
  }

  const activeRecipe = route.view === 'detail' ? recipes.find(r => r.id === route.id) : null

  if (activeRecipe) {
    return (
      <RecipeDetail
        recipe={activeRecipe}
        onClose={closeRecipe}
        onDelete={handleDelete}
        onEdit={openEditRecipe}
        onToggleFavorite={handleToggleFavorite}
        onTagAdd={handleTagAdd}
      />
    )
  }

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
        <AddRecipe onAdd={setRecipes} apiKey={API_KEY} onCreateManual={openNewRecipe} />

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
                onOpen={openRecipe}
                onDelete={handleDelete}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
