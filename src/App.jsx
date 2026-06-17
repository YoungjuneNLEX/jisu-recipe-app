import { useState, useEffect } from 'react'
import AddRecipe from './components/AddRecipe'
import RecipeDetail from './components/RecipeDetail'
import RecipeForm from './components/RecipeForm'
import HomeView from './components/HomeView'
import CategoryView from './components/CategoryView'
import BottomNav from './components/BottomNav'
import { getRecipes, deleteRecipe, toggleFavorite, saveRecipe } from './utils/storage'
import styles from './App.module.css'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''

// Parse the current hash into a route: home / categories / new / detail / edit
function parseRoute(hash) {
  const h = hash || ''
  if (h === '#/new') return { view: 'new' }
  if (h === '#/categories') return { view: 'categories' }
  const edit = h.match(/^#\/recipe\/(.+)\/edit$/)
  if (edit) return { view: 'edit', id: decodeURIComponent(edit[1]) }
  const detail = h.match(/^#\/recipe\/(.+)$/)
  if (detail) return { view: 'detail', id: decodeURIComponent(detail[1]) }
  return { view: 'home' }
}

export default function App() {
  const [recipes, setRecipes] = useState([])
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    setRecipes(getRecipes())
  }, [])

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseRoute(window.location.hash))
      setShowAdd(false)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const goHome = () => { window.location.hash = '#/' }
  const goCategories = () => { window.location.hash = '#/categories' }
  const openRecipe = id => { window.location.hash = `#/recipe/${encodeURIComponent(id)}` }
  const openEditRecipe = id => { window.location.hash = `#/recipe/${encodeURIComponent(id)}/edit` }
  const openNewRecipe = () => { setShowAdd(false); window.location.hash = '#/new' }

  function closeOverlay() {
    if (window.history.length > 1) window.history.back()
    else window.location.hash = '#/'
  }

  function handleDelete(id) {
    if (!confirm('이 레시피를 삭제할까요?')) return
    setRecipes(deleteRecipe(id))
    if (route.id === id) window.location.hash = '#/'
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

  // ── Full-screen overlay views ──
  if (route.view === 'new') {
    return <RecipeForm onSave={handleSaveForm} onClose={closeOverlay} apiKey={API_KEY} />
  }

  if (route.view === 'edit') {
    const editing = recipes.find(r => r.id === route.id)
    if (editing) {
      return <RecipeForm recipe={editing} onSave={handleSaveForm} onClose={closeOverlay} apiKey={API_KEY} />
    }
  }

  if (route.view === 'detail') {
    const activeRecipe = recipes.find(r => r.id === route.id)
    if (activeRecipe) {
      return (
        <RecipeDetail
          recipe={activeRecipe}
          onClose={closeOverlay}
          onDelete={handleDelete}
          onEdit={openEditRecipe}
          onToggleFavorite={handleToggleFavorite}
          onTagAdd={handleTagAdd}
        />
      )
    }
  }

  // ── Tabbed main views (home / categories) with bottom nav ──
  const view = route.view === 'categories' ? 'categories' : 'home'
  const cardProps = {
    onOpen: openRecipe,
    onDelete: handleDelete,
    onToggleFavorite: handleToggleFavorite,
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logoArea}>
            <h1 className={styles.logo}>📖 레시피</h1>
            <p className={styles.subtitle}>
              {view === 'categories' ? '카테고리별로 모아보기' : '나만의 레시피 보관함'}
            </p>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {view === 'categories'
          ? <CategoryView recipes={recipes} {...cardProps} />
          : <HomeView recipes={recipes} {...cardProps} />}
      </main>

      <BottomNav
        active={view}
        onHome={goHome}
        onCategories={goCategories}
        onAdd={() => setShowAdd(true)}
      />

      {showAdd && (
        <div className={styles.modalOverlay} onClick={() => setShowAdd(false)}>
          <div className={styles.modalSheet} onClick={e => e.stopPropagation()}>
            <div className={styles.sheetHandle} />
            <h2 className={styles.sheetTitle}>레시피 추가</h2>
            <p className={styles.sheetDesc}>유튜브 링크를 붙여넣거나, 직접 작성할 수 있어요.</p>
            <AddRecipe
              onAdd={setRecipes}
              apiKey={API_KEY}
              onCreateManual={openNewRecipe}
              onDone={() => setShowAdd(false)}
            />
            <button className={styles.sheetClose} onClick={() => setShowAdd(false)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}
