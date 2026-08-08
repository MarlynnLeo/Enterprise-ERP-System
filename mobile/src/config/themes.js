/**
 * Mobile theme registry.
 * Keep this list aligned with the PC theme preset IDs.
 */

export const themes = Object.freeze([
  {
    name: 'default',
    label: '默认主题',
    description: '标准浅色界面，适合通用办公场景',
    icon: 'brush-o',
    dataTheme: 'default',
    isDark: false,
    preview: {
      primary: '#409EFF',
      accent: '#3498DB',
      bg: '#F2F3F5'
    }
  },
  {
    name: 'tech',
    label: '科技主题',
    description: '深色高对比界面，适合看板和监控场景',
    icon: 'cluster-o',
    dataTheme: 'tech',
    isDark: true,
    preview: {
      primary: '#00C3FF',
      accent: '#7C4DFF',
      bg: '#0B1120'
    }
  },
  {
    name: 'business',
    label: '商务主题',
    description: '稳重低饱和配色，适合经营管理场景',
    icon: 'bag-o',
    dataTheme: 'business',
    isDark: false,
    preview: {
      primary: '#2C3E50',
      accent: '#D4AF37',
      bg: '#ECF0F1'
    }
  },
  {
    name: 'vibrant',
    label: '活力主题',
    description: '明快配色，适合高频协作和轻量工作台',
    icon: 'fire-o',
    dataTheme: 'vibrant',
    isDark: false,
    preview: {
      primary: '#FF6B6B',
      accent: '#4ECDC4',
      bg: '#FFF8F8'
    }
  },
  {
    name: 'nature',
    label: '自然主题',
    description: '低饱和绿色系，适合长时间浏览',
    icon: 'flower-o',
    dataTheme: 'nature',
    isDark: false,
    preview: {
      primary: '#51CF66',
      accent: '#51CF66',
      bg: '#F0FFF4'
    }
  },
  {
    name: 'dark',
    label: '深色主题',
    description: '低亮度深色界面，适合夜间和弱光环境',
    icon: 'closed-eye',
    dataTheme: 'dark',
    isDark: true,
    preview: {
      primary: '#60A5FA',
      accent: '#818CF8',
      bg: '#0F172A'
    }
  },
  {
    name: 'premium',
    label: 'Premium Editorial',
    description: '黑白高级杂志风，适合总控大屏和经营驾驶舱',
    icon: 'diamond-o',
    dataTheme: 'premium',
    isDark: true,
    preview: {
      // 与 PC themePresets.premium.primaryColor / premium.css 一致
      primary: '#E4E4E7',
      accent: '#71717A',
      bg: '#050505'
    }
  },
  {
    name: 'professional',
    label: '专业主题',
    description: '企业级扁平化风格，强调清晰和稳定',
    icon: 'manager-o',
    dataTheme: 'professional',
    isDark: false,
    preview: {
      primary: '#1F4E79',
      accent: '#2563EB',
      bg: '#F4F7FB'
    }
  },
  {
    name: 'kacon',
    label: 'KACON品牌',
    description: 'KACON 品牌深翡翠绿，适合默认业务操作',
    icon: 'wap-home-o',
    dataTheme: 'kacon',
    isDark: false,
    preview: {
      primary: '#15803D',
      accent: '#166534',
      bg: '#EFF3F8'
    }
  }
])

export const defaultThemeName = 'kacon'

export const getTheme = (name) => {
  return themes.find((theme) => theme.name === name) || themes.find((theme) => theme.name === defaultThemeName)
}
