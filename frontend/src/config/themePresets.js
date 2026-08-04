import {
  Briefcase,
  Brush,
  Cpu,
  Moon,
  OfficeBuilding,
  Pear,
  Promotion,
  SuitcaseLine
} from '@element-plus/icons-vue'

export const DEFAULT_THEME_PRESET_ID = 'kacon'
export const DEFAULT_FONT_SIZE = 14

export const THEME_PRESET_LIST = Object.freeze([
  {
    id: 'default',
    name: '默认主题',
    description: '标准浅色界面，适合通用办公场景',
    primaryColor: '#409EFF',
    mode: 'light',
    icon: Brush
  },
  {
    id: 'tech',
    name: '科技主题',
    description: '深色高对比界面，适合看板和监控场景',
    primaryColor: '#00C3FF',
    mode: 'dark',
    icon: Cpu
  },
  {
    id: 'business',
    name: '商务主题',
    description: '稳重低饱和配色，适合经营管理场景',
    primaryColor: '#2C3E50',
    mode: 'light',
    icon: Briefcase
  },
  {
    id: 'vibrant',
    name: '活力主题',
    description: '明快配色，适合高频协作和轻量工作台',
    primaryColor: '#FF6B6B',
    mode: 'light',
    icon: Promotion
  },
  {
    id: 'nature',
    name: '自然主题',
    description: '低饱和绿色系，适合长时间浏览',
    primaryColor: '#51CF66',
    mode: 'light',
    icon: Pear
  },
  {
    id: 'dark',
    name: '深色主题',
    description: '低亮度深色界面，适合夜间和弱光环境',
    primaryColor: '#60A5FA',
    mode: 'dark',
    icon: Moon
  },
  {
    id: 'premium',
    name: 'Premium Editorial',
    description: '黑白高级杂志风，适合总控大屏和经营驾驶舱',
    primaryColor: '#FFFFFF',
    mode: 'dark',
    icon: SuitcaseLine
  },
  {
    id: 'professional',
    name: '专业主题',
    description: '企业级扁平化风格，强调清晰和稳定',
    primaryColor: '#1F4E79',
    mode: 'light',
    icon: SuitcaseLine
  },
  {
    id: 'kacon',
    name: 'KACON品牌',
    description: 'KACON 品牌深翡翠绿，适合默认业务操作',
    primaryColor: '#15803D',
    mode: 'light',
    icon: OfficeBuilding
  }
])

export const THEME_PRESETS = Object.freeze(
  Object.fromEntries(THEME_PRESET_LIST.map((preset) => [preset.id, preset]))
)

export const DEFAULT_THEME_SETTINGS = Object.freeze({
  theme: THEME_PRESETS[DEFAULT_THEME_PRESET_ID].mode,
  preset: DEFAULT_THEME_PRESET_ID,
  primaryColor: THEME_PRESETS[DEFAULT_THEME_PRESET_ID].primaryColor,
  fontSize: DEFAULT_FONT_SIZE
})

export const isThemePreset = (presetId) => Object.hasOwn(THEME_PRESETS, presetId)

export const getThemePreset = (presetId) => {
  return THEME_PRESETS[presetId] || THEME_PRESETS[DEFAULT_THEME_PRESET_ID]
}

export const normalizePrimaryColor = (value, fallback = THEME_PRESETS[DEFAULT_THEME_PRESET_ID].primaryColor) => {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toUpperCase()
    : fallback
}

const parseHexColor = (value) => {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    return null
  }

  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16))
}

const relativeLuminance = (rgb) => {
  const channels = rgb.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

export const getAccessibleTextColor = (backgroundColor) => {
  const background = parseHexColor(backgroundColor)
  if (!background) return '#FFFFFF'

  const backgroundLuminance = relativeLuminance(background)
  const blackLuminance = 0
  const whiteContrast = 1.05 / (backgroundLuminance + 0.05)
  const blackContrast =
    (Math.max(backgroundLuminance, blackLuminance) + 0.05) /
    (Math.min(backgroundLuminance, blackLuminance) + 0.05)

  return blackContrast >= whiteContrast ? '#000000' : '#FFFFFF'
}

const normalizeFontSize = (value) => {
  const fontSize = Number(value)
  if (!Number.isFinite(fontSize)) {
    return DEFAULT_FONT_SIZE
  }

  return Math.min(18, Math.max(12, Math.round(fontSize)))
}

export const normalizeThemeAppearance = (appearance = {}) => {
  const source = appearance && typeof appearance === 'object' ? appearance : {}
  const preset = getThemePreset(source.preset)

  return {
    ...DEFAULT_THEME_SETTINGS,
    theme: preset.mode,
    preset: preset.id,
    primaryColor: normalizePrimaryColor(source.primaryColor, preset.primaryColor),
    fontSize: normalizeFontSize(source.fontSize)
  }
}
