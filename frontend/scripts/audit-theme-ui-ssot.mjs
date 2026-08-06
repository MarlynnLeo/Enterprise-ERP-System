/**
 * One-shot audit: themes + UI SSOT snapshot
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const themesDir = path.join(root, 'src/assets/themes/pc')
const themes = [
  'default',
  'tech',
  'business',
  'vibrant',
  'nature',
  'dark',
  'premium',
  'professional',
  'kacon',
]

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
  const m = css.match(re)
  return m ? m[1].trim() : null
}

const presets = fs.readFileSync(path.join(root, 'src/config/themePresets.js'), 'utf8')
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8')
const compat = fs.readFileSync(path.join(themesDir, 'theme-compat.css'), 'utf8')
const components = fs.readFileSync(path.join(themesDir, 'theme-components.css'), 'utf8')

const report = {
  ci: {},
  architecture: {},
  themes: {},
  uiSsot: {},
  findings: [],
}

// architecture
const i1 = main.indexOf('theme-compat')
const i2 = main.indexOf('theme-components')
const i3 = main.indexOf('kacon.css')
report.architecture = {
  importOrderOk: i1 > 0 && i2 > i1 && i3 > i2,
  indices: { themeCompat: i1, themeComponents: i2, kacon: i3 },
  compatBytes: compat.length,
  componentsBytes: components.length,
  hasBorderAlias: /--color-border\s*:\s*var\(--color-border-base\)/.test(compat),
  hasFont14: /--font-size-base\s*:\s*14px/.test(compat),
  hasElPrimary: /--el-color-primary\s*:\s*var\(--color-primary\)/.test(compat),
  hasShellSidebarBg: compat.includes('--shell-sidebar-bg'),
  componentsHasTable: components.includes('[data-theme] .el-table'),
  componentsHasMenuActive: components.includes('.sidebar .el-menu-item.is-active'),
  componentsHasButtonPrimary: components.includes('.el-button--primary'),
}

if (!report.architecture.importOrderOk) {
  report.findings.push({ severity: 'high', msg: 'main.js 主题 CSS 引入顺序异常' })
}

// themes
for (const id of themes) {
  const css = fs.readFileSync(path.join(themesDir, `${id}.css`), 'utf8')
  const re = new RegExp(`id:\\s*'${id}'[\\s\\S]*?primaryColor:\\s*'([^']+)'`)
  const pm = presets.match(re)
  const presetPrimary = pm ? pm[1].toUpperCase() : null
  const cssPrimary = (extractToken(css, '--color-primary') || '').toUpperCase()
  const font = extractToken(css, '--font-size-base')
  const onP = extractToken(css, '--color-on-primary')
  report.themes[id] = {
    bytes: css.length,
    fontSizeBase: font,
    primaryCss: cssPrimary,
    primaryPreset: presetPrimary,
    primaryMatch: !!(presetPrimary && cssPrimary && presetPrimary === cssPrimary),
    onPrimary: onP,
    shellSidebarBg: css.includes('--shell-sidebar-bg'),
    shellActiveBg: css.includes('--shell-sidebar-active-bg'),
    shellAccent: css.includes('--shell-sidebar-accent'),
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
  if (font !== '14px') {
    report.findings.push({ severity: 'high', msg: `${id}: font-size-base=${font}` })
  }
  if (id === 'premium' && cssPrimary === '#FFFFFF') {
    report.findings.push({ severity: 'high', msg: 'premium 仍使用纯白 primary' })
  }
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
const optionalShell = {
  activeShadow: themes.filter((id) =>
    fs.readFileSync(path.join(themesDir, `${id}.css`), 'utf8').includes('--shell-sidebar-active-shadow')
  ),
  railWidth: themes.filter((id) =>
    fs.readFileSync(path.join(themesDir, `${id}.css`), 'utf8').includes('--shell-sidebar-rail-width')
  ),
}
report.optionalShell = optionalShell

// medium findings
if (report.themes.kacon.important > 250) {
  report.findings.push({
    severity: 'medium',
    msg: `kacon !important 仍高 (${report.themes.kacon.important})，体积 ${report.themes.kacon.bytes}`,
  })
}
if (report.themes.premium.important > 80) {
  report.findings.push({
    severity: 'medium',
    msg: `premium !important 偏高 (${report.themes.premium.important})，杂志风覆盖仍多`,
  })
}
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

// health score rough
const high = report.findings.filter((f) => f.severity === 'high').length
const medium = report.findings.filter((f) => f.severity === 'medium').length
const low = report.findings.filter((f) => f.severity === 'low').length
report.score = {
  high,
  medium,
  low,
  overall: high === 0 ? (medium <= 2 ? 'B+' : 'B') : 'C',
  note:
    high === 0
      ? 'P0 门禁已绿；剩余为体量/皮肤覆盖与可选收敛'
      : '存在高优先级一致性缺口',
}

console.log(JSON.stringify(report, null, 2))
