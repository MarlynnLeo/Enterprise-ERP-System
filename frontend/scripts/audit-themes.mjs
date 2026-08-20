/**
 * 全站主题审计：token 覆盖、一致性、硬编码
 * Usage: node scripts/audit-themes.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(__dirname, '../src/assets/themes/pc')
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

function extractTokens(css) {
  const tokens = new Map()
  const re = /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g
  let m
  while ((m = re.exec(css))) {
    tokens.set(`--${m[1]}`, m[2].trim())
  }
  return tokens
}

function extractDataThemes(css) {
  const re = /\[data-theme=(["'])([^"']+)\1\]/g
  const set = new Set()
  let m
  while ((m = re.exec(css))) set.add(m[2])
  return [...set]
}

const CORE = [
  '--color-primary',
  '--color-success',
  '--color-warning',
  '--color-danger',
  '--color-info',
  '--color-text-primary',
  '--color-text-regular',
  '--color-text-secondary',
  '--color-text-placeholder',
  '--color-text-disabled',
  '--color-bg-base',
  '--color-bg-page',
  '--color-bg-section',
  '--color-bg-hover',
  '--color-bg-overlay',
  '--color-bg-light',
  '--color-border-base',
  '--color-border-light',
  '--color-border-lighter',
  '--color-border-extra-light',
  '--color-primary-light-3',
  '--color-primary-light-5',
  '--color-primary-light-7',
  '--color-primary-light-8',
  '--color-primary-light-9',
  '--color-primary-dark-2',
  '--color-success-light',
  '--color-warning-light',
  '--color-danger-light',
  '--color-info-light',
  '--el-color-primary',
  '--el-bg-color',
  '--el-text-color-primary',
  '--el-border-color',
  '--shell-sidebar-bg',
  '--shell-header-bg',
  '--shell-accent',
  '--shell-control-hover-bg',
  '--theme-dialog-radius',
  '--theme-dialog-footer-bg',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
  '--spacing-xs',
  '--spacing-sm',
  '--spacing-md',
  '--spacing-lg',
  '--spacing-xl',
  '--font-size-base',
  '--font-family-base',
  '--theme-feature-card-bg',
  '--theme-feature-card-color',
  '--theme-feature-card-border',
  '--theme-feature-card-shadow',
  '--theme-feature-card-hover-shadow',
  '--theme-feature-card-decor',
  '--color-on-primary',
  '--color-border', // alias used in some places
]

const perTheme = {}
const all = new Map()

for (const id of themes) {
  const css = fs.readFileSync(path.join(dir, `${id}.css`), 'utf8')
  const t = extractTokens(css)
  perTheme[id] = { tokens: t, css, dataThemes: extractDataThemes(css), size: css.length }
  for (const k of t.keys()) {
    if (!all.has(k)) all.set(k, new Set())
    all.get(k).add(id)
  }
}

const report = {
  themes,
  tokenCounts: {},
  dataThemeAttrs: {},
  coreCoverage: {},
  coreMissingByTheme: {},
  uniqueTokenCounts: {},
  hexCounts: {},
  componentRuleCounts: {},
  issues: [],
}

for (const id of themes) {
  report.tokenCounts[id] = perTheme[id].tokens.size
  report.dataThemeAttrs[id] = perTheme[id].dataThemes
  if (!perTheme[id].dataThemes.includes(id)) {
    report.issues.push({
      severity: 'high',
      theme: id,
      msg: `data-theme 选择器与 id 不一致: ${perTheme[id].dataThemes.join(',') || '(none)'}`,
    })
  }
  const hex = (perTheme[id].css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length
  const rgba = (perTheme[id].css.match(/rgba?\(/g) || []).length
  report.hexCounts[id] = { hex, rgba }
  // component-level rules (selectors after token block)
  const comp =
    (perTheme[id].css.match(/\.el-[a-zA-Z-]+/g) || []).length +
    (perTheme[id].css.match(/\.module-page|\.header-card|\.search-card|\.page-header/g) || [])
      .length
  report.componentRuleCounts[id] = comp
  report.uniqueTokenCounts[id] = 0
}

for (const [, set] of all) {
  if (set.size === 1) {
    const only = [...set][0]
    report.uniqueTokenCounts[only]++
  }
}

for (const tok of CORE) {
  const have = themes.filter((id) => perTheme[id].tokens.has(tok))
  const miss = themes.filter((id) => !perTheme[id].tokens.has(tok))
  report.coreCoverage[tok] = { have: have.length, miss }
  for (const m of miss) {
    if (!report.coreMissingByTheme[m]) report.coreMissingByTheme[m] = []
    report.coreMissingByTheme[m].push(tok)
  }
}

// font-size-base consistency (ERP dense UI expects 14px typically)
for (const id of themes) {
  const fsBase = perTheme[id].tokens.get('--font-size-base')
  if (fsBase && !/14px/.test(fsBase) && id !== 'default') {
    // note only
  }
  report[`fontSizeBase_${id}`] = fsBase || '(missing)'
}

// primaryColor from presets vs theme --color-primary
const presetsPath = path.resolve(__dirname, '../src/config/themePresets.js')
const presetsSrc = fs.readFileSync(presetsPath, 'utf8')
const presetPrimaries = {}
for (const id of themes) {
  const re = new RegExp(
    `id:\\s*'${id}'[\\s\\S]*?primaryColor:\\s*'([^']+)'`,
    'm'
  )
  const m = presetsSrc.match(re)
  presetPrimaries[id] = m ? m[1].toUpperCase() : null
  const cssPrimary = (perTheme[id].tokens.get('--color-primary') || '').toUpperCase()
  if (presetPrimaries[id] && cssPrimary && presetPrimaries[id] !== cssPrimary) {
    // allow if CSS has color-mix etc
    if (/^#[0-9A-F]{6}$/.test(cssPrimary)) {
      report.issues.push({
        severity: 'medium',
        theme: id,
        msg: `themePresets.primaryColor ${presetPrimaries[id]} ≠ CSS --color-primary ${cssPrimary}`,
      })
    }
  }
  const modeRe = new RegExp(`id:\\s*'${id}'[\\s\\S]*?mode:\\s*'([^']+)'`, 'm')
  const modeM = presetsSrc.match(modeRe)
  const mode = modeM ? modeM[1] : '?'
  // dark themes should have dark-ish bg
  const bg = perTheme[id].tokens.get('--color-bg-page') || perTheme[id].tokens.get('--color-bg-base')
  if (mode === 'dark' && bg && /#(f|e|d|c|b|a|9|8)/i.test(bg.replace(/\s/g, ''))) {
    // rough check - light hex on dark theme
  }
}

// Check theme-compat for aliases that themes might miss
const compat = fs.readFileSync(path.join(dir, 'theme-compat.css'), 'utf8')
const compatTokens = extractTokens(compat)

// shell tokens: critical for Layout
const SHELL = [
  '--shell-sidebar-bg',
  '--shell-header-bg',
  '--shell-accent',
  '--shell-control-hover-bg',
  '--shell-control-border',
  '--shell-radius-md',
]
report.shellCoverage = {}
for (const tok of SHELL) {
  report.shellCoverage[tok] = {
    inCompat: compatTokens.has(tok),
    themes: themes.filter((id) => perTheme[id].tokens.has(tok)),
  }
  if (!compatTokens.has(tok)) {
    const miss = themes.filter((id) => !perTheme[id].tokens.has(tok))
    if (miss.length) {
      report.issues.push({
        severity: 'high',
        theme: '*',
        msg: `Shell token ${tok} missing in compat and themes: ${miss.join(',')}`,
      })
    }
  }
}

// views hardcoding hex (sample count)
const viewsDir = path.resolve(__dirname, '../src/views')
function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, a)
    else if (e.name.endsWith('.vue')) a.push(p)
  }
  return a
}
let viewHexFiles = 0
let viewHexCount = 0
const viewHexSamples = []
for (const f of walk(viewsDir)) {
  const s = fs.readFileSync(f, 'utf8')
  // only style blocks roughly
  const styles = s.match(/<style[\s\S]*?<\/style>/g) || []
  let n = 0
  for (const st of styles) {
    const matches = st.match(/#[0-9a-fA-F]{3,8}\b/g) || []
    n += matches.length
  }
  if (n > 0) {
    viewHexFiles++
    viewHexCount += n
    if (viewHexSamples.length < 15) {
      viewHexSamples.push({
        file: path.relative(path.resolve(__dirname, '..'), f).replace(/\\/g, '/'),
        n,
      })
    }
  }
}
report.viewHardcodedHex = { files: viewHexFiles, count: viewHexCount, samples: viewHexSamples }

// Compare kacon size vs others - kacon has component overrides
report.kaconExtra =
  'kacon is the design SSOT with full component rules; others are token-heavy with fewer component overrides'

// Summary severity counts
report.issueSummary = {
  high: report.issues.filter((i) => i.severity === 'high').length,
  medium: report.issues.filter((i) => i.severity === 'medium').length,
  low: report.issues.filter((i) => i.severity === 'low').length,
}

// Missing core matrix compact
report.missingCoreSummary = Object.fromEntries(
  Object.entries(report.coreMissingByTheme).map(([k, v]) => [k, v.length])
)

console.log(JSON.stringify(report, null, 2))
