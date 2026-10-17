/** Contrast helpers shared by mobile theme text and filled controls. */
export const parseThemeColor = (color) => {
  const value = String(color || '').trim()
  if (/^#[\da-f]{3}$/i.test(value)) return [...value.slice(1)].map((channel) => Number.parseInt(channel.repeat(2), 16))
  if (/^#[\da-f]{6}$/i.test(value)) return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16))
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i)
  return rgb ? rgb.slice(1).filter((channel) => channel !== undefined).map(Number) : null
}

const toHex = (channels) => `#${channels.slice(0, 3).map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`
const luminance = (channels) => channels.slice(0, 3).reduce((sum, channel, index) => {
  const value = channel / 255
  return sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]
}, 0)

export const contrastRatio = (first, second) => {
  const [light, dark] = [luminance(parseThemeColor(first)), luminance(parseThemeColor(second))].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}

export const compositeThemeColor = (foreground, background) => {
  const front = parseThemeColor(foreground)
  const back = parseThemeColor(background)
  if (!front || !back) return background
  const alpha = front[3] ?? 1
  return toHex(front.slice(0, 3).map((channel, index) => channel * alpha + back[index] * (1 - alpha)))
}

export const accessibleTextColor = (background) => contrastRatio(background, '#000000') >= contrastRatio(background, '#FFFFFF') ? '#000000' : '#FFFFFF'

export const getContrastSafeColor = (color, backgrounds, minimum = 4.5) => {
  const source = parseThemeColor(color)
  const surfaces = backgrounds.filter((background) => parseThemeColor(background))
  if (!source || !surfaces.length) return color
  const minimumRatio = (candidate) => Math.min(...surfaces.map((background) => contrastRatio(candidate, background)))
  if (minimumRatio(toHex(source)) >= minimum) return toHex(source)
  const target = minimumRatio('#000000') >= minimumRatio('#FFFFFF') ? 0 : 255
  for (let amount = 1; amount <= 100; amount++) {
    const candidate = toHex(source.map((channel) => channel + (target - channel) * amount / 100))
    if (minimumRatio(candidate) >= minimum) return candidate
  }
  return target === 0 ? '#000000' : '#FFFFFF'
}

export const applyAccessibleThemeColors = (root, primaryColor, fallbackBackground) => {
  const style = getComputedStyle(root)
  const read = (name) => style.getPropertyValue(name).trim()
  const page = read('--bg-primary') || fallbackBackground
  const surfaces = ['--bg-primary', '--bg-secondary', '--bg-tertiary'].map((name) => read(name) || page)
  const onPrimary = accessibleTextColor(primaryColor)
  root.style.setProperty('--color-on-primary', onPrimary)
  const active = toHex(parseThemeColor(primaryColor).map((channel) => channel * 0.82))
  root.style.setProperty('--color-primary-active', getContrastSafeColor(active, [onPrimary]))

  for (const name of ['primary', 'accent', 'success', 'warning', 'error', 'info']) {
    const color = name === 'primary' ? primaryColor : read(`--color-${name}`)
    if (!parseThemeColor(color)) continue
    const tint = read(`--color-${name}-bg`)
    const tinted = surfaces.map((background) => compositeThemeColor(tint, background))
    const channels = parseThemeColor(color)
    tinted.push(...surfaces.map((background) => compositeThemeColor(`rgba(${channels.slice(0, 3).join(',')},0.15)`, background)))
    // Accent text also appears on the shared selected-state primary tint.
    if (name === 'accent') tinted.push(...surfaces.map((background) => compositeThemeColor(read('--color-primary-bg'), background)))
    root.style.setProperty(`--color-${name}-text`, getContrastSafeColor(color, [...surfaces, ...tinted]))
    if (name !== 'primary') root.style.setProperty(`--color-on-${name}`, accessibleTextColor(color))
  }
  for (const name of ['--text-secondary', '--text-tertiary']) {
    // Remove the previous theme's correction before reading this theme's CSS value.
    root.style.removeProperty(name)
    root.style.setProperty(name, getContrastSafeColor(read(name), surfaces))
  }
  for (const family of ['module', 'ds']) {
    for (const name of ['blue', 'indigo', 'cyan', 'purple', 'green', 'red', 'yellow', 'teal', 'orange', 'pink', 'gray', 'slate']) {
      const color = read(`--${family}-${name}`)
      const channels = parseThemeColor(color)
      if (!channels) continue
      const tinted = surfaces.map((background) => compositeThemeColor(`rgba(${channels.slice(0, 3).join(',')},0.15)`, background))
      root.style.setProperty(`--${family}-${name}-text`, getContrastSafeColor(color, [...surfaces, ...tinted]))
    }
  }
}
