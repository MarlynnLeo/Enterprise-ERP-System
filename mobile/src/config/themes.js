/**
 * 主题注册表
 * @description KACON 主题管理 — 注册可用主题
 * @version 2.0.0
 *
 * 新增主题步骤：
 * 1. 在 src/styles/themes/ 下创建新的 CSS 文件
 * 2. 使用 :root[data-theme="xxx"] { ... } 包裹变量
 * 3. 在 glass-theme.css 中 @import 新文件
 * 4. 在本文件中注册主题
 */

export const themes = [
  {
    name: 'kacon',
    label: 'KACON 工业',
    description: '品牌标准配色 — 深灰蓝 + 青色',
    dataTheme: '', // 默认主题，不设置 data-theme
    preview: {
      primary: '#3C4858',
      accent: '#67C1D9',
      bg: '#F4F7FA'
    }
  },
  {
    name: 'dark',
    label: '暗色模式',
    description: '深色背景 — 护眼夜间模式',
    dataTheme: 'dark',
    preview: {
      primary: '#0f172a',
      accent: '#60a5fa',
      bg: '#0f172a'
    }
  },
  {
    name: 'nature',
    label: '自然护眼',
    description: '清新绿色 — 缓解视觉疲劳',
    dataTheme: 'nature',
    preview: {
      primary: '#51CF66',
      accent: '#40C057',
      bg: '#F0FFF4'
    }
  },
  {
    name: 'tech',
    label: '科技主题',
    description: '霓虹蓝绿 — 信息密集场景',
    dataTheme: 'tech',
    preview: {
      primary: '#00c3ff',
      accent: '#7c4dff',
      bg: '#0B1120'
    }
  }
]

// 默认主题名称
export const defaultThemeName = 'kacon'

// 根据名称获取主题配置
export const getTheme = (name) => {
  return themes.find((t) => t.name === name) || themes[0]
}
