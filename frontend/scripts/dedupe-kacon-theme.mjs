/**
 * 从 kacon.css 删除已由 theme-components 覆盖的重复规则，
 * 并将硬编码品牌绿 rgba 改为 color-mix(primary)。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.resolve(__dirname, '../src/assets/themes/pc/kacon.css')
let css = fs.readFileSync(file, 'utf8')
const before = css.length

function cutBetween(startMarker, endMarker, replacement) {
  const si = css.indexOf(startMarker)
  const ei = css.indexOf(endMarker)
  if (si === -1 || ei === -1 || ei <= si) {
    console.warn('skip cut', startMarker.slice(0, 40))
    return false
  }
  css = css.slice(0, si) + replacement + css.slice(ei)
  console.log('cut', startMarker.slice(0, 36), 'bytes', ei - si)
  return true
}

function cutRegex(re, replacement = '') {
  const m = css.match(re)
  if (!m) {
    console.warn('skip re', String(re).slice(0, 50))
    return false
  }
  css = css.replace(re, replacement)
  console.log('re cut', m[0].length, 'bytes')
  return true
}

// §10 表格
cutBetween(
  '/* ========== 10. 表格 ========== */',
  '/* ========== 11. 输入框 ========== */',
  `/* ========== 10. 表格 ========== */
/* 密度/hover/选中/斑马纹 → theme-components.css */

`
)

// §11 输入框
cutBetween(
  '/* ========== 11. 输入框 ========== */',
  '/* ========== 12. 选择器 ========== */',
  `/* ========== 11. 输入框 ========== */
/* 圆角/底色/hover → theme-components + theme-compat */

`
)

// §12 选择器：去掉 item 态，保留玻璃 dropdown
cutRegex(
  /\[data-theme="kacon"\] \.el-select-dropdown__item\.is-selected[\s\S]*?\[data-theme="kacon"\] \.el-select-dropdown__item:hover \{[\s\S]*?\}\n\n/,
  ''
)

// §13 标签页
cutBetween(
  '/* ========== 13. 标签页 ========== */',
  '/* ========== 14. 分页器 ========== */',
  `/* ========== 13. 标签页 ========== */
/* 基础色 → theme-components；激活条见 §35.2 */

`
)

// §14 分页
cutBetween(
  '/* ========== 14. 分页器 ========== */',
  '/* ========== 15. 标签 ========== */',
  `/* ========== 14. 分页器 ========== */
/* → theme-components；is-background 见 §35.1 */

`
)

// §15 标签
cutBetween(
  '/* ========== 15. 标签 ========== */',
  '/* ========== 17. 下拉菜单 ========== */',
  `/* ========== 15. 标签 ========== */
/* 圆角 → theme-components */

`
)

// 标题色条重复
cutRegex(
  /\/\* 标题左侧品牌色渐变色条 \*\/\r?\n\[data-theme="kacon"\] \.el-dialog__title::before \{[\s\S]*?\}\r?\n\r?\n/,
  `/* 标题色条：共享壳 + kacon 品牌渐变覆盖 */
[data-theme="kacon"] .el-dialog__title::before {
  background: linear-gradient(
    180deg,
    var(--color-primary),
    var(--color-brand, var(--color-primary-dark-2))
  ) !important;
}

`
)

// §37 整块按钮 → 仅保留 focus 光晕
const btnStart = css.indexOf('/* ==================================================================\n   37. 按钮')
const btnStartAlt = css.indexOf('/* ==================================================================\r\n   37. 按钮')
const b0 = btnStart !== -1 ? btnStart : btnStartAlt
const cardStart = css.indexOf('/* ==================================================================\n   38. 卡片')
const cardStartAlt = css.indexOf('/* ==================================================================\r\n   38. 卡片')
const c0 = cardStart !== -1 ? cardStart : cardStartAlt
if (b0 !== -1 && c0 !== -1 && c0 > b0) {
  const inject = `/* ==================================================================
   37. 按钮 — 渐变/上浮/禁用 → theme-components.css
   ================================================================== */

[data-theme="kacon"] .el-button:focus-visible {
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--color-primary) 12%, transparent),
    var(--shadow-sm) !important;
}

`
  css = css.slice(0, b0) + inject + css.slice(c0)
  console.log('cut section 37 buttons', c0 - b0, 'bytes')
} else {
  console.warn('section 37 not found', b0, c0)
}

// 品牌绿硬编码 → color-mix
const greenBefore = (css.match(/rgba\(\s*22\s*,\s*163\s*,\s*74/g) || []).length
css = css.replace(/rgba\(\s*22\s*,\s*163\s*,\s*74\s*,\s*([0-9.]+)\s*\)/g, (_, a) => {
  const pct = Math.round(parseFloat(a) * 100)
  return `color-mix(in srgb, var(--color-primary) ${pct}%, transparent)`
})
const greenAfter = (css.match(/rgba\(\s*22\s*,\s*163\s*,\s*74/g) || []).length
console.log('green rgba', greenBefore, '->', greenAfter)

// 交互字色 #fff → on-primary；分页白底 → bg-base
css = css.replace(/color:\s*#fff\s*!important/gi, 'color: var(--color-on-primary) !important')
css = css.replace(
  /background-color:\s*#fff\s*!important/gi,
  'background-color: var(--color-bg-base) !important'
)

// 边框硬编码灰（玻璃边）→ token（保留透明度语义用 color-mix）
css = css.replace(
  /rgba\(\s*229\s*,\s*231\s*,\s*235\s*,\s*([0-9.]+)\s*\)/g,
  (_, a) => {
    const pct = Math.round(parseFloat(a) * 100)
    return `color-mix(in srgb, var(--color-border-base) ${pct}%, transparent)`
  }
)
css = css.replace(
  /rgba\(\s*249\s*,\s*250\s*,\s*251\s*,\s*([0-9.]+)\s*\)/g,
  (_, a) => {
    const pct = Math.round(parseFloat(a) * 100)
    return `color-mix(in srgb, var(--color-bg-section) ${pct}%, transparent)`
  }
)

fs.writeFileSync(file, css)
console.log(
  JSON.stringify(
    {
      before,
      after: css.length,
      saved: before - css.length,
      lines: css.split(/\n/).length,
    },
    null,
    2
  )
)
