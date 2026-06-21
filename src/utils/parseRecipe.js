// "1단계:", "2단계 -", "Step 1:" 같은 앞부분 제거
export function cleanSteps(steps = []) {
  return steps.map(s =>
    s.replace(/^\d+\s*단계\s*[:.\-–]?\s*/i, '')
     .replace(/^step\s*\d+\s*[:.\-–]?\s*/i, '')
     .replace(/^\d+\.\s*\d+\s*단계\s*[:.\-–]?\s*/i, '')
     .trim()
  ).filter(Boolean)
}

/**
 * Parse recipe from YouTube description text.
 * Returns { ingredients, steps, servings, time } or null if not enough data.
 */
export function parseFromDescription(description) {
  if (!description || description.length < 100) return null

  const lines = description.split('\n').map(l => l.trim()).filter(Boolean)

  const ingredientKeywords = /재료|ingredient|materials|준비물/i
  const stepKeywords = /만드는|조리|방법|순서|step|how to|directions|instructions/i
  const timeKeywords = /(\d+)\s*(분|시간|min|hour)/i
  const servingKeywords = /(\d+)\s*(인분|serving|portion)/i

  let ingredients = []
  let steps = []
  let inIngredients = false
  let inSteps = false
  let servings = null
  let time = null

  for (const line of lines) {
    if (servingKeywords.test(line)) {
      const m = line.match(servingKeywords)
      if (m) servings = m[0]
    }
    if (timeKeywords.test(line) && !time) {
      const m = line.match(timeKeywords)
      if (m) time = m[0]
    }

    if (ingredientKeywords.test(line)) { inIngredients = true; inSteps = false; continue }
    if (stepKeywords.test(line)) { inSteps = true; inIngredients = false; continue }

    if (inIngredients && line.length < 60) {
      ingredients.push(line)
    } else if (inSteps && line.length > 5) {
      steps.push(line)
    }
  }

  if (ingredients.length < 1 && steps.length < 1) return null

  return { ingredients, steps, servings, time }
}
