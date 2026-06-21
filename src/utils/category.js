export const UNCATEGORIZED = '미분류'

// Neutral greyscale palette — no colour, no green
const NEUTRAL_SHADES = [
  { bg: '#f0f0f0', fg: '#5a5a5a' },
  { bg: '#ebebeb', fg: '#525252' },
  { bg: '#e6e6e6', fg: '#4a4a4a' },
  { bg: '#e2e2e2', fg: '#444444' },
  { bg: '#dedede', fg: '#3e3e3e' },
  { bg: '#d9d9d9', fg: '#383838' },
  { bg: '#d4d4d4', fg: '#323232' },
]

export function categoryColor(name) {
  if (!name || name === UNCATEGORIZED) {
    return { bg: '#ececec', fg: '#8a8a8a' }
  }
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return NEUTRAL_SHADES[h % NEUTRAL_SHADES.length]
}
