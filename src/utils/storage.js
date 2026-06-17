const KEY = 'jisu_recipes'

export function getRecipes() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

export function saveRecipe(recipe) {
  const recipes = getRecipes()
  const existing = recipes.findIndex(r => r.id === recipe.id)
  if (existing >= 0) {
    recipes[existing] = recipe
  } else {
    recipes.unshift(recipe)
  }
  localStorage.setItem(KEY, JSON.stringify(recipes))
  return recipes
}

export function deleteRecipe(id) {
  const recipes = getRecipes().filter(r => r.id !== id)
  localStorage.setItem(KEY, JSON.stringify(recipes))
  return recipes
}

export function toggleFavorite(id) {
  const recipes = getRecipes()
  const recipe = recipes.find(r => r.id === id)
  if (recipe) {
    recipe.favorite = !recipe.favorite
    localStorage.setItem(KEY, JSON.stringify(recipes))
  }
  return recipes
}
