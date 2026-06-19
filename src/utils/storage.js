const KEY = 'jisu_recipes'
const CAT_KEY = 'jisu_categories'

// ── Local: recipes (instant, offline-capable cache) ──
function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

function saveLocal(list) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

// Visible recipes = everything except delete tombstones
export function getRecipes() {
  return loadLocal().filter(r => !r.deleted)
}

export function saveRecipe(recipe) {
  const list = loadLocal()
  const stamped = { ...recipe, updatedAt: Date.now() }
  const i = list.findIndex(r => r.id === recipe.id)
  if (i >= 0) list[i] = stamped
  else list.unshift(stamped)
  saveLocal(list)
  schedulePush()
  return getRecipes()
}

export function deleteRecipe(id) {
  const list = loadLocal()
  const i = list.findIndex(r => r.id === id)
  if (i >= 0) list[i] = { id, deleted: true, updatedAt: Date.now() }
  saveLocal(list)
  schedulePush()
  return getRecipes()
}

export function toggleFavorite(id) {
  const list = loadLocal()
  const recipe = list.find(r => r.id === id && !r.deleted)
  if (recipe) {
    recipe.favorite = !recipe.favorite
    recipe.updatedAt = Date.now()
  }
  saveLocal(list)
  schedulePush()
  return getRecipes()
}

// ── Local: categories (folders) ──
function loadCats() {
  try {
    const v = JSON.parse(localStorage.getItem(CAT_KEY) || 'null')
    return v && Array.isArray(v.list) ? v : { list: [], updatedAt: 0 }
  } catch {
    return { list: [], updatedAt: 0 }
  }
}

function saveCatsLocal(obj) {
  localStorage.setItem(CAT_KEY, JSON.stringify(obj))
}

export function getCategories() {
  return loadCats().list
}

export function addCategory(name) {
  const { list } = loadCats()
  if (!name || list.includes(name)) return list
  const next = [...list, name]
  saveCatsLocal({ list: next, updatedAt: Date.now() })
  schedulePush()
  return next
}

export function renameCategory(oldName, newName) {
  if (!newName || oldName === newName) return getCategories()
  const list = [...new Set(loadCats().list.map(c => (c === oldName ? newName : c)))]
  saveCatsLocal({ list, updatedAt: Date.now() })
  // Move recipes in the renamed folder
  const recipes = loadLocal().map(r =>
    r.category === oldName ? { ...r, category: newName, updatedAt: Date.now() } : r
  )
  saveLocal(recipes)
  schedulePush()
  return list
}

export function deleteCategory(name) {
  const list = loadCats().list.filter(c => c !== name)
  saveCatsLocal({ list, updatedAt: Date.now() })
  // Recipes in the deleted folder fall back to 미분류
  const recipes = loadLocal().map(r =>
    r.category === name ? { ...r, category: '', updatedAt: Date.now() } : r
  )
  saveLocal(recipes)
  schedulePush()
  return list
}

// ── Cloud sync ──
let listeners = []

// Subscribe to changes coming from cloud sync. Returns unsubscribe.
export function onRecipesChange(fn) {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

function emit() {
  listeners.forEach(l => l())
}

// Last-write-wins merge by id; keeps tombstones so deletes don't resurrect
function mergeLists(a, b) {
  const map = new Map()
  for (const r of [...a, ...b]) {
    if (!r || !r.id) continue
    const prev = map.get(r.id)
    if (!prev || (r.updatedAt || 0) >= (prev.updatedAt || 0)) map.set(r.id, r)
  }
  return [...map.values()].sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))
}

// Push local state to the cloud, merge the response back in, and notify the UI.
export async function syncCloud() {
  const localRecipes = loadLocal()
  const localCats = loadCats()
  try {
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recipes: localRecipes, categories: localCats }),
    })
    if (!res.ok) return
    const data = await res.json()
    let changed = false

    if (Array.isArray(data.recipes)) {
      const merged = mergeLists(localRecipes, data.recipes)
      if (JSON.stringify(merged) !== JSON.stringify(localRecipes)) {
        saveLocal(merged)
        changed = true
      }
    }

    const incomingCats = data.categories
    if (incomingCats && Array.isArray(incomingCats.list)) {
      if ((incomingCats.updatedAt || 0) > (localCats.updatedAt || 0) &&
          JSON.stringify(incomingCats.list) !== JSON.stringify(localCats.list)) {
        saveCatsLocal(incomingCats)
        changed = true
      }
    }

    if (changed) emit()
  } catch {
    /* offline or store not configured — stay local-only */
  }
}

let pushTimer = null
function schedulePush() {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(syncCloud, 500)
}
