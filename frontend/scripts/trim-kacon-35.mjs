import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets/themes/pc/kacon.css')
let css = fs.readFileSync(file, 'utf8')
const before = css.length
const start = css.indexOf('/* ===== 35.1 分页器')
const end = css.indexOf('/* ===== 35.6 标签')
if (start !== -1 && end !== -1 && end > start) {
  css =
    css.slice(0, start) +
    '/* ===== 35.1–35.5 分页/Tabs/开关/勾选/Focus → theme-components ===== */\n\n' +
    css.slice(end)
  console.log('cut 35.1-35.5', end - start)
} else {
  console.warn('not found', start, end)
}
fs.writeFileSync(file, css)
console.log({
  before,
  after: css.length,
  saved: before - css.length,
  lines: css.split(/\n/).length,
  hex: (css.match(/#[0-9a-fA-F]{3,8}/g) || []).length,
})
