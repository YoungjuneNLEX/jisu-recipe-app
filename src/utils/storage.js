const KEY = 'jisu_recipes'

// ── Local storage (instant, offline-capable cache) ──
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
  // Keep a tombstone so the deletion syncs to other devices
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

// ── Cloud sync ──
let listeners = []

// Subscribe to recipe-list changes coming from cloud sync. Returns unsubscribe.
export function onRecipesChange(fn) {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

function emit() {
  const visible = getRecipes()
  listeners.forEach(l => l(visible))
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

// Push local list to the cloud, merge the response back in, and notify the UI.
export async function syncCloud() {
  const local = loadLocal()
  try {
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recipes: local }),
    })
    if (!res.ok) return
    const data = await res.json()
    if (!Array.isArray(data.recipes)) return
    const merged = mergeLists(local, data.recipes)
    // Only rewrite + notify when the cloud actually changed something
    if (JSON.stringify(merged) !== JSON.stringify(local)) {
      saveLocal(merged)
      emit()
    }
  } catch {
    /* offline or store not configured — stay local-only */
  }
}

let pushTimer = null
function schedulePush() {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(syncCloud, 500)
}
