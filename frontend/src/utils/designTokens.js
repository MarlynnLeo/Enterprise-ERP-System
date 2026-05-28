const FALLBACK_COLORS = Object.freeze({
  primary: '#409EFF',
  success: '#67C23A',
  warning: '#E6A23C',
  danger: '#F56C6C',
  info: '#909399',
  textPrimary: '#303133',
  textSecondary: '#606266',
  textMuted: '#909399',
  border: '#DCDFE6',
  borderLight: '#EBEEF5',
  surface: '#FFFFFF',
  page: '#F2F3F5',
  overlay: 'rgba(25, 28, 34, 0.95)',
  white: '#FFFFFF',
  black: '#000000',
  purple: '#7C3AED',
  orange: '#EA580C',
  pink: '#DB2777',
  cyan: '#00B4D8'
})

const CSS_TOKEN_MAP = Object.freeze({
  primary: '--color-primary',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
  info: '--color-info',
  textPrimary: '--color-text-primary',
  textSecondary: '--color-text-regular',
  textMuted: '--color-text-secondary',
  border: '--color-border-base',
  borderLight: '--color-border-lighter',
  surface: '--color-bg-base',
  page: '--color-bg-page',
  purple: '--ds-purple',
  orange: '--ds-orange',
  pink: '--ds-pink',
  cyan: '--ds-cyan'
})

export const cssVar = (token) => `var(${CSS_TOKEN_MAP[token] || token})`

export const getCssTokenValue = (token, fallback = FALLBACK_COLORS[token]) => {
  if (typeof window === 'undefined' || !window.document?.documentElement) {
    return fallback
  }

  const cssName = CSS_TOKEN_MAP[token] || token
  const value = window
    .getComputedStyle(window.document.documentElement)
    .getPropertyValue(cssName)
    .trim()

  return value || fallback
}

export const getChartPalette = () => [
  getCssTokenValue('primary'),
  getCssTokenValue('success'),
  getCssTokenValue('warning'),
  getCssTokenValue('danger'),
  getCssTokenValue('purple'),
  getCssTokenValue('cyan'),
  getCssTokenValue('orange'),
  getCssTokenValue('info')
]

export const alphaColor = (token, alpha = 1) => {
  const value = getCssTokenValue(token)
  const normalizedAlpha = Math.max(0, Math.min(1, Number(alpha)))

  if (/^#[0-9a-f]{6}$/i.test(value)) {
    const red = parseInt(value.slice(1, 3), 16)
    const green = parseInt(value.slice(3, 5), 16)
    const blue = parseInt(value.slice(5, 7), 16)
    return `rgba(${red}, ${green}, ${blue}, ${normalizedAlpha})`
  }

  if (/^rgb\(/i.test(value)) {
    return value.replace(/^rgb\((.*)\)$/i, `rgba($1, ${normalizedAlpha})`)
  }

  return value
}

export const getStatusColor = (status) => {
  const map = {
    success: 'success',
    completed: 'success',
    passed: 'success',
    warning: 'warning',
    pending: 'warning',
    processing: 'primary',
    info: 'info',
    error: 'danger',
    danger: 'danger',
    failed: 'danger',
    cancelled: 'info'
  }

  return getCssTokenValue(map[status] || status || 'primary')
}

export const chartTheme = () => ({
  text: getCssTokenValue('textSecondary'),
  axis: getCssTokenValue('border'),
  splitLine: getCssTokenValue('borderLight'),
  surface: getCssTokenValue('surface'),
  tooltipBg: FALLBACK_COLORS.overlay,
  tooltipText: FALLBACK_COLORS.white,
  palette: getChartPalette()
})
