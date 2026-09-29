// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_FONT_SIZE, DEFAULT_THEME_PRESET_ID, THEME_PRESET_LIST } from '../src/config/themePresets.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const fixtures = []
const run = (script, directory = root) => JSON.parse(execFileSync(
  process.execPath, [path.join(directory, 'scripts', script)], { encoding: 'utf8' }
))

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'erp-theme-audit-'))
  fixtures.push(directory)
  for (const folder of ['scripts', 'src/config', 'src/assets/themes/pc', 'src/views', 'src/components']) {
    mkdirSync(path.join(directory, folder), { recursive: true })
  }
  writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}')
  for (const script of ['audit-themes.mjs', 'audit-theme-ui-ssot.mjs']) {
    copyFileSync(path.join(root, 'scripts', script), path.join(directory, 'scripts', script))
  }
  // A new registered preset must be picked up without changing the audit scripts.
  const presets = [...THEME_PRESET_LIST, { id: 'future', primaryColor: '#123456', mode: 'light' }]
  writeFileSync(path.join(directory, 'src/config/themePresets.js'), `
    export const THEME_PRESET_LIST = ${JSON.stringify(presets)};
    export const DEFAULT_FONT_SIZE = ${DEFAULT_FONT_SIZE};
    export const DEFAULT_THEME_PRESET_ID = ${JSON.stringify(DEFAULT_THEME_PRESET_ID)};
    export const THEME_PRESETS = Object.fromEntries(THEME_PRESET_LIST.map(p => [p.id, p]));
  `)
  for (const preset of presets) {
    writeFileSync(path.join(directory, `src/assets/themes/pc/${preset.id}.css`), `
      /* --font-size-base: 99px; --color-primary: #000000;
         --shell-sidebar-active-shadow: none; !important; [data-theme="comment"] .el-input {} */
      :root[data-theme="${preset.id}"] { --color-primary: ${preset.primaryColor}; }
    `)
  }
  writeFileSync(path.join(directory, 'src/assets/themes/pc/theme-compat.css'), `
    :root { --font-size-base: 14px; --el-color-primary: var(--color-primary); }
    .component { --color-success: #123456; }
    :root[data-theme="kacon"] { --color-danger: #123456; }
  `)
  writeFileSync(path.join(directory, 'src/assets/themes/pc/theme-components.css'), '')
  writeFileSync(path.join(directory, 'src/main.js'), `
/* Correct-looking order in documentation must not mask wrong actual imports.
import './assets/themes/pc/theme-compat.css'
import './assets/themes/pc/theme-components.css'
import './assets/themes/pc/kacon.css'
*/
import './assets/themes/pc/kacon.css'
import './assets/themes/pc/theme-components.css'
import './assets/themes/pc/theme-compat.css'
`)
  return directory
}

describe('theme audit scripts', () => {
  it('includes every registered preset, including the classic theme, in both reports', () => {
    const tokens = run('audit-themes.mjs')
    const ui = run('audit-theme-ui-ssot.mjs')
    expect(tokens.themes).toEqual(THEME_PRESET_LIST.map(({ id }) => id))
    expect(Object.keys(ui.themes)).toEqual(tokens.themes)
    expect(tokens.dataThemeAttrs.workspace).toContain('workspace')
    expect(ui).not.toHaveProperty('ci')
    expect(ui).not.toHaveProperty('score')
    expect(ui.issueSummary.high).toBe(0)
    expect(ui.themes.workspace.primaryMatch).toBe(true)
    expect(ui.themes.workspace.fontSizeBase).toBe('14px')
  })

  it('discovers future presets and distinguishes shared defaults from genuinely missing tokens', () => {
    const report = run('audit-themes.mjs', fixture())
    expect(report.themes).toContain('future')
    expect(report.coreInheritedByTheme.future).toContain('--el-color-primary')
    expect(report.coreMissingByTheme.future).not.toContain('--el-color-primary')
    expect(report.coreMissingByTheme.future).toContain('--color-success')
    expect(report.coreMissingByTheme.future).toContain('--color-danger')
    expect(report.fontSizeBase_future).toBe('14px')
    expect(report.dataThemeAttrs.future).toEqual(['future'])
    expect(report.issues.filter(({ msg }) => msg.includes('primaryColor'))).toEqual([])
  })

  it('checks real import order and shared font defaults without trusting CSS comments', () => {
    const report = run('audit-theme-ui-ssot.mjs', fixture())
    expect(report.architecture.importOrderOk).toBe(false)
    expect(report.findings.some(({ msg }) => msg.includes('引入顺序异常'))).toBe(true)
    expect(report.themes.future.primaryMatch).toBe(true)
    expect(report.themes.future.fontSizeBase).toBe('14px')
    expect(report.themes.future.important).toBe(0)
    expect(report.themes.future.inputHits).toBe(0)
    expect(report.optionalShell.activeShadow).toEqual([])
    expect(report.findings.some(({ msg }) => msg.includes('font-size-base'))).toBe(false)
  })
})
