// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse, compileStyle } from '@vue/compiler-sfc'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { transformSync } from 'esbuild'
import { JSDOM } from 'jsdom'
import { afterAll, afterEach, describe, expect, test } from 'vitest'
import { THEME_PRESET_LIST } from '@/config/themePresets'

const policyFile = 'src/assets/performance-policy.css'
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
const document = dom.window.document
const source = file => readFileSync(resolve(process.cwd(), file), 'utf8')
const parsedStyles = new Map()
function stylesheet(file) {
  if (!parsedStyles.has(file)) {
    let css = source(file)
    if (file.endsWith('.vue')) {
      const style = parse(css).descriptor.styles[0]
      const compiled = compileStyle({ source: style.content, filename: file, id: 'data-v-policy-test', scoped: true })
      expect(compiled.errors).toEqual([])
      css = compiled.code
    }
    parsedStyles.set(file, postcss.parse(css, { from: file }))
  }
  return parsedStyles.get(file)
}

const commonFiles = [
  policyFile, // Deliberately first: late route/palette CSS must not undo policy.
  'src/assets/main.css',
  'src/assets/theme-utilities.css',
  'src/assets/themes/pc/theme-compat.css',
  'src/assets/themes/pc/theme-components.css',
  'src/assets/themes/pc/kacon.css',
  'src/assets/stat-cards.css',
  'src/views/layout.css',
  'src/views/dashboard/layouts/SharedDashboardLayout.vue',
  'src/views/auth/components/DecorativeAvatarFrame.vue'
]

function fixture(theme, mode = '') {
  document.documentElement.dataset.theme = theme
  document.documentElement.className = mode
  document.body.innerHTML = `<div class="app-shell">
    <aside class="sidebar"><ul class="app-menu-list"><li><button class="app-menu-title">Menu</button></li></ul></aside>
    <button class="icon-button">Action</button>
    <div class="stat-card" data-v-policy-test><div class="icon-container" data-v-policy-test>1</div></div>
    <div class="el-card dashboard-card"></div>
    <div class="el-input"><div class="el-input__wrapper is-focus"><input></div></div>
    <div class="frame-motion-breath"><img class="avatar-frame-image" data-v-policy-test></div>
    </div><div class="dialog-fade-enter-active"><div class="el-dialog"></div></div>
    <div class="el-drawer__open"><div class="el-drawer rtl"></div></div>`
  return [...commonFiles, ...(theme === 'kacon' ? [] : [`src/assets/themes/pc/${theme}.css`])].map(stylesheet)
}

// jsdom's computed styles do not resolve !important or custom-property cascade
// correctly. Resolve the actual parsed rules by the CSS cascade instead, using
// jsdom only for selector matching. The independent Chromium matrix also checks
// the same real component/palette styles and their native transition end events.
const compareSpecificity = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
function specificity(node) {
  if (node.type === 'id') return [1, 0, 0]
  if (node.type === 'class' || node.type === 'attribute') return [0, 1, 0]
  if (node.type === 'tag') return [0, 0, 1]
  if (node.type === 'pseudo') {
    if (node.value.startsWith('::') || [':before', ':after', ':first-line', ':first-letter'].includes(node.value)) return [0, 0, 1]
    if (node.value === ':where') return [0, 0, 0]
    if ([':is', ':not', ':has'].includes(node.value)) return node.nodes.map(specificity).sort(compareSpecificity).at(-1)
    return [0, 1, 0]
  }
  return (node.nodes || []).map(specificity).reduce((sum, item) => sum.map((n, i) => n + item[i]), [0, 0, 0])
}

function winningDeclaration(styles, target, property, { pseudo = '', reducedMotion = false } = {}) {
  const element = document.querySelector(target)
  let winner = null
  for (const sheet of styles) sheet.walkRules(rule => {
    for (let ancestor = rule.parent; ancestor; ancestor = ancestor.parent) {
      if (ancestor.type !== 'atrule') continue
      // Simulate a browser that ignores unsupported @layer blocks entirely.
      if (ancestor.name !== 'media') return
      if (ancestor.params !== '(prefers-reduced-motion: reduce)' || !reducedMotion) return
    }
    const shorthand = property.startsWith('transition-') ? 'transition' : property.startsWith('animation-') ? 'animation' : null
    const declarations = rule.nodes.filter(node => node.type === 'decl' && (node.prop === property || node.prop === shorthand))
    if (!declarations.length) return
    for (const selector of selectorParser().astSync(rule.selector).nodes) {
      const text = selector.toString()
      const pseudoMatch = text.match(/:{1,2}(before|after)\b/)
      const rulePseudo = pseudoMatch ? `::${pseudoMatch[1]}` : ''
      if (pseudo !== rulePseudo) continue
      const matchable = text.replace(/:{1,2}(?:before|after)\b/g, '').replace(/:hover\b/g, '.policy-test-hover')
      let matches = false
      try { matches = element.matches(matchable) } catch { continue }
      if (!matches) continue
      for (const declaration of declarations) {
        const candidate = { property: declaration.prop, value: declaration.value, important: Boolean(declaration.important), specificity: specificity(selector) }
        if (!winner || Number(candidate.important) > Number(winner.important)
          || (candidate.important === winner.important && compareSpecificity(candidate.specificity, winner.specificity) >= 0)) winner = candidate
      }
    }
  })
  return winner
}

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.className = ''
  document.documentElement.removeAttribute('data-theme')
})
afterAll(() => dom.window.close())

describe('global performance policy', () => {
  test.each(THEME_PRESET_LIST)('$id keeps real component timing reduced without cascade layers or load-order assumptions', ({ id }) => {
    for (const mode of ['perf-low-end', 'perf-reduced-motion']) {
      const styles = fixture(id, mode)
      for (const target of ['html', '.stat-card', '.icon-container', '.icon-button', '.el-card', '.el-dialog', '.el-drawer', '.avatar-frame-image']) {
        for (const [property, value] of [['transition-duration', '0.01ms'], ['animation-duration', '0.01ms'], ['transition-delay', '0s'], ['animation-delay', '0s'], ['animation-iteration-count', '1']]) {
          expect(winningDeclaration(styles, target, property), `${id} ${mode} ${target} ${property}`).toMatchObject({ property, value, important: true })
        }
      }
      for (const target of ['html', '.stat-card']) for (const pseudo of ['::before', '::after']) {
        expect(winningDeclaration(styles, target, 'animation-duration', { pseudo })).toMatchObject({ property: 'animation-duration', value: '0.01ms' })
        expect(winningDeclaration(styles, target, 'animation-delay', { pseudo })).toMatchObject({ property: 'animation-delay', value: '0s' })
      }
      expect(winningDeclaration(styles, '.app-menu-title', 'transition-duration')).toMatchObject({ property: 'transition', value: 'none' })
    }
  })

  test.each(THEME_PRESET_LIST)('$id cannot restore reduced elevation from a late palette or hover rule', ({ id }) => {
    const styles = fixture(id, 'perf-low-end')
    for (const target of ['html', '.app-shell']) for (const token of ['--shadow-sm', '--shadow-md', '--shadow-card', '--theme-dialog-shadow', '--shell-shadow']) {
      expect(winningDeclaration(styles, target, token), `${id} ${target} ${token}`).toMatchObject({ value: 'none', important: true })
    }
    for (const target of ['.stat-card', '.el-card', '.el-dialog', '.sidebar']) {
      document.querySelector(target).classList.add('policy-test-hover')
      expect(winningDeclaration(styles, target, 'box-shadow'), `${id} ${target}:hover`).toMatchObject({ value: 'none' })
    }
    expect(winningDeclaration(styles, '.avatar-frame-image', 'filter')).toMatchObject({ value: 'none' })
    // Elevation policy must not erase the inset focus/border affordance of inputs.
    expect(winningDeclaration([stylesheet(policyFile)], '.el-input__wrapper', 'box-shadow')).toBeNull()
  })

  test('the OS preference works before runtime classes and does not change palette surfaces', () => {
    const styles = fixture('kacon')
    const normalShadow = winningDeclaration(styles, '.stat-card', 'box-shadow')
    expect(winningDeclaration(styles, '.stat-card', 'transition-duration', { reducedMotion: true })).toMatchObject({ value: '0.01ms' })
    expect(winningDeclaration(styles, '.stat-card', 'box-shadow', { reducedMotion: true })).toEqual(normalShadow)
    document.documentElement.classList.add('perf-reduced-motion')
    expect(winningDeclaration(styles, '.stat-card', 'box-shadow')).toEqual(normalShadow)
  })

  test.each([
    'src/views/finance/budget/BudgetAI.vue',
    'src/views/finance/tax/TaxInvoices.vue',
    'src/views/production/EquipmentMonitoring.vue',
    'src/views/quality/GaugeManagement.vue'
  ])('a late scoped page cannot restore stat-card elevation on hover (%s)', file => {
    const styles = fixture('kacon', 'perf-low-end')
    styles.push(stylesheet(file))
    document.querySelector('.stat-card').classList.add('policy-test-hover')
    expect(winningDeclaration(styles, '.stat-card', 'box-shadow')).toMatchObject({ value: 'none' })
  })

  test('legacy CSS minification preserves the complete policy without modern selector or layer dependencies', () => {
    const css = transformSync(source(policyFile), { loader: 'css', minify: true, target: ['chrome49', 'edge16', 'firefox52', 'safari10'] }).code
    const stylesheet = postcss.parse(css)
    const unsupported = []
    stylesheet.walkAtRules('layer', node => unsupported.push(node.toString()))
    stylesheet.walkRules(rule => selectorParser(selectors => selectors.walkPseudos(node => {
      if ([':is', ':where', ':has'].includes(node.value)) unsupported.push(node.value)
    })).processSync(rule.selector))
    expect(unsupported).toEqual([])
    const styles = fixture('kacon', 'perf-low-end')
    styles[0] = stylesheet
    expect(winningDeclaration(styles, '.stat-card', 'transition-duration')).toMatchObject({ value: '.01ms' })
    expect(winningDeclaration(styles, '.stat-card', 'box-shadow')).toMatchObject({ value: 'none' })
    for (const target of ['html', '.stat-card']) for (const pseudo of ['::before', '::after']) {
      expect(winningDeclaration(styles, target, 'animation-duration', { pseudo })).toMatchObject({ property: 'animation-duration', value: '.01ms' })
    }
  })

  test('component and palette styles cannot reclaim timing or shared-surface elevation priorities', () => {
    const failures = []
    const surfaces = new Set(['el-card', 'el-dialog', 'el-table', 'sidebar', 'app-sidebar', 'header', 'app-header', 'chart-container', 'calendar-wrapper', 'combined-info-card'])
    const isSurface = selector => selectorParser().astSync(selector).nodes.some(node => {
      const compound = node.nodes.slice(node.nodes.findLastIndex(part => part.type === 'combinator') + 1)
      return compound.some(part => part.type === 'class' && (surfaces.has(part.value) || /stat-card|dashboard-card/.test(part.value)))
    })
    const walk = directory => {
      for (const entry of readdirSync(resolve(process.cwd(), directory), { withFileTypes: true })) {
        const file = `${directory}/${entry.name}`
        if (entry.isDirectory()) { walk(file); continue }
        if (!/\.(css|vue)$/.test(file) || file === policyFile) continue
        const text = source(file)
        const blocks = file.endsWith('.vue') ? parse(text).descriptor.styles.map(style => style.content) : [text]
        for (const css of blocks) postcss.parse(css).walkDecls(declaration => {
          if (!declaration.important || declaration.value === 'none') return
          const ownsTiming = /^(animation|transition)(-|$)/.test(declaration.prop)
          const ownsElevation = declaration.prop === 'box-shadow' && !declaration.value.includes('inset')
            && declaration.parent.type === 'rule' && isSurface(declaration.parent.selector)
          if (ownsTiming || ownsElevation) failures.push(`${file}: ${declaration}`)
        })
      }
    }
    walk('src')
    expect(failures).toEqual([])
  })
})
