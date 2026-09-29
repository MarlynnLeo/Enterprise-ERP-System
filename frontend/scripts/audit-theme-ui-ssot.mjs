/**
 * Static audit: themes + UI SSOT snapshot
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_FONT_SIZE, DEFAULT_THEME_PRESET_ID, THEME_PRESET_LIST, THEME_PRESETS } from '../src/config/themePresets.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const themesDir = path.join(root, 'src/assets/themes/pc')
const themes = THEME_PRESET_LIST.map(({ id }) => id)

function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, a)
    else if (e.name.endsWith('.vue')) a.push(p)
  }
  return a
}

function extractToken(css, name) {
  const re = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+);`)
  const m = css.replace(/\/\*[\s\S]*?\*\//g, '').match(re)
  return m ? m[1].trim() : null
}

const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8')
const compat = fs.readFileSync(path.join(themesDir, 'theme-compat.css'), 'utf8')
const components = fs.readFileSync(path.join(themesDir, 'theme-components.css'), 'utf8')

const report = {
  architecture: {},
  themes: {},
  uiSsot: {},
  findings: [],
}

// architecture
// Match actual side-effect imports, not explanatory comments mentioning their order.
const cssImports = [...main.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^import\s+['"]([^'"]+\.css)['"]/gm)].map((match) => match[1])
const i1 = cssImports.findIndex((source) => source.endsWith('/theme-compat.css'))
const i2 = cssImports.findIndex((source) => source.endsWith('/theme-components.css'))
const i3 = cssImports.findIndex((source) => source.endsWith(`/${DEFAULT_THEME_PRESET_ID}.css`))
report.architecture = {
  importOrderOk: i1 >= 0 && i2 > i1 && i3 > i2,
  indices: { themeCompat: i1, themeComponents: i2, defaultTheme: i3 },
  compatBytes: Buffer.byteLength(compat, 'utf8'),
  componentsBytes: Buffer.byteLength(components, 'utf8'),
  hasBorderAlias: /--color-border\s*:\s*var\(--color-border-base\)/.test(compat),
  hasDefaultFont: extractToken(compat, '--font-size-base') === `${DEFAULT_FONT_SIZE}px`,
  hasElPrimary: /--el-color-primary\s*:\s*var\(--color-primary\)/.test(compat),
  hasShellSidebarBg: compat.includes('--shell-sidebar-bg'),
  componentsHasTable: components.includes('[data-theme] .el-table'),
  componentsHasMenuActive: components.includes('.sidebar .app-menu-link.is-active'),
  componentsHasButtonPrimary: components.includes('.el-button--primary'),
}

if (!report.architecture.importOrderOk) {
  report.findings.push({ severity: 'high', msg: 'main.js 主题 CSS 引入顺序异常' })
}

const optionalShell = { activeShadow: [], railWidth: [] }
// themes
for (const id of themes) {
  const source = fs.readFileSync(path.join(themesDir, `${id}.css`), 'utf8')
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const presetPrimary = THEME_PRESETS[id].primaryColor.toUpperCase()
  const cssPrimary = (extractToken(css, '--color-primary') || '').toUpperCase()
  const font = extractToken(css, '--font-size-base') || extractToken(compat, '--font-size-base')
  const onP = extractToken(css, '--color-on-primary')
  report.themes[id] = {
    bytes: Buffer.byteLength(source, 'utf8'),
    fontSizeBase: font,
    primaryCss: cssPrimary,
    primaryPreset: presetPrimary,
    primaryMatch: !!(presetPrimary && cssPrimary && presetPrimary === cssPrimary),
    onPrimary: onP,
    shellSidebarBg: css.includes('--shell-sidebar-bg'),
    shellActiveBg: css.includes('--shell-sidebar-active-bg'),
    shellAccent: css.includes('--shell-accent'),
    tableHits: (css.match(/el-table/g) || []).length,
    inputHits: (css.match(/el-input/g) || []).length,
    menuIsActive: (css.match(/el-menu-item\.is-active/g) || []).length,
    important: (css.match(/!important/g) || []).length,
  }
  if (!report.themes[id].primaryMatch) {
    report.findings.push({
      severity: 'high',
      msg: `${id}: preset primary ${presetPrimary} ≠ css ${cssPrimary}`,
    })
  }
  if (font !== `${DEFAULT_FONT_SIZE}px`) {
    report.findings.push({ severity: 'high', msg: `${id}: font-size-base=${font}` })
  }
  if (css.includes('--shell-sidebar-active-shadow')) optionalShell.activeShadow.push(id)
  if (css.includes('--shell-sidebar-rail-width')) optionalShell.railWidth.push(id)
}

// UI SSOT in views
let pageHeader = 0
let queryCard = 0
let appDialog = 0
let elDialog = 0
let emptyState = 0
let elEmpty = 0
let hexStyleFiles = 0
let hexStyleCount = 0
const views = walk(path.join(root, 'src/views'))
for (const f of views) {
  const s = fs.readFileSync(f, 'utf8')
  if (s.includes('<PageHeader')) pageHeader++
  if (s.includes('<FinanceQueryCard')) queryCard++
  appDialog += (s.match(/<AppDialog\b/g) || []).length
  elDialog += (s.match(/<el-dialog\b/g) || []).length
  emptyState += (s.match(/<EmptyState\b/g) || []).length
  elEmpty += (s.match(/<el-empty\b/g) || []).length
  const styles = s.match(/<style[\s\S]*?<\/style>/g) || []
  let n = 0
  for (const st of styles) {
    const m = st.match(/#[0-9a-fA-F]{3,8}\b/g)
    if (m) n += m.length
  }
  if (n) {
    hexStyleFiles++
    hexStyleCount += n
  }
}

// components bare dialog
const bareDialogComponents = []
for (const f of walk(path.join(root, 'src/components'))) {
  const s = fs.readFileSync(f, 'utf8')
  if (s.includes('<el-dialog') && !f.replace(/\\/g, '/').endsWith('components/ui/AppDialog.vue')) {
    bareDialogComponents.push(path.relative(root, f).replace(/\\/g, '/'))
  }
}

report.uiSsot = {
  viewFiles: views.length,
  pageHeaderFiles: pageHeader,
  financeQueryCardFiles: queryCard,
  appDialogOpens: appDialog,
  bareElDialogInViews: elDialog,
  emptyState: emptyState,
  elEmptyInViews: elEmpty,
  bareElDialogInComponents: bareDialogComponents,
  viewStyleHexFiles: hexStyleFiles,
  viewStyleHexCount: hexStyleCount,
}

if (elDialog > 0) {
  report.findings.push({ severity: 'high', msg: `views 仍有 ${elDialog} 处裸 el-dialog` })
}
if (bareDialogComponents.length) {
  report.findings.push({
    severity: 'high',
    msg: `components 裸 el-dialog: ${bareDialogComponents.join(', ')}`,
  })
}

// optional shadows not required on all themes
report.optionalShell = optionalShell

// Usage counts are descriptive; theme-specific thresholds are not quality gates.
if (report.uiSsot.elEmptyInViews > 0) {
  report.findings.push({
    severity: 'low',
    msg: `views 仍有 ${report.uiSsot.elEmptyInViews} 处 el-empty（EmptyState=${report.uiSsot.emptyState}）`,
  })
}
if (report.uiSsot.viewStyleHexCount > 0) {
  report.findings.push({
    severity: 'low',
    msg: `views style 硬编码 hex: ${report.uiSsot.viewStyleHexCount} 处 / ${report.uiSsot.viewStyleHexFiles} 文件`,
  })
}

report.issueSummary = Object.fromEntries(
  ['high', 'medium', 'low'].map((severity) => [
    severity, report.findings.filter((finding) => finding.severity === severity).length,
  ])
)
report.coverageNote = '静态源码扫描；不代表 CI、浏览器效果或可访问性验证通过'

console.log(JSON.stringify(report, null, 2))
