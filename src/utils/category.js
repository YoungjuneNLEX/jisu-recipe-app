export const UNCATEGORIZED = '미분류'

// Deterministic pastel colour per category name — the same name always maps to
// the same colour, so categories look "randomly" coloured but stay consistent.
export function categoryColor(name) {
  if (!name || name === UNCATEGORIZED) {
    return { bg: '#ededed', fg: '#8a8a8a' }
  }
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return { bg: `hsl(${hue} 68% 91%)`, fg: `hsl(${hue} 45% 34%)` }
}
