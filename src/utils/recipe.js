const SAUCE_KEYWORDS = /양념|소스|마리네이드|드레싱|marinade|sauce|seasoning/i

// Split a flat ingredient list into main ingredients and sauce/seasoning items.
export function splitIngredients(ingredients = []) {
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
