/**
 * 将 el-table #empty 中的 <el-empty ...> 替换为 <EmptyState ...>
 * EmptyState 已全局注册。
 *
 * Usage: node scripts/migrate-empty-to-emptystate.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VIEWS = path.resolve(__dirname, '../src/views')

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, acc)
    else if (ent.name.endsWith('.vue')) acc.push(p)
  }
  return acc
}

let filesTouched = 0
let replacements = 0

for (const file of walk(VIEWS)) {
  let s = fs.readFileSync(file, 'utf8')
  const before = s

  // <el-empty description="xxx" />  or with image-size, self-closing or with ></el-empty>
  // Only inside or near #empty slots is ideal; global replace of simple el-empty is OK for tables
  s = s.replace(
    /<el-empty\b([^>]*?)\s*\/>/g,
    (full, attrs) => {
      // skip if already EmptyState context
      if (/EmptyState/.test(full)) return full
      replacements++
      // map description= / :description= / image-size=
      let a = attrs
        .replace(/\bdescription=/g, 'description=')
        .replace(/:image-size=/g, ':image-size=')
        .replace(/\bimage-size=/g, ':image-size=')
      return `<EmptyState${a} />`
    }
  )

  s = s.replace(
    /<el-empty\b([^>]*)>\s*<\/el-empty>/g,
    (full, attrs) => {
      replacements++
      let a = attrs
        .replace(/:image-size=/g, ':image-size=')
        .replace(/\bimage-size=/g, ':image-size=')
      return `<EmptyState${a} />`
    }
  )

  // block form with only description
  s = s.replace(
    /<el-empty\b([^>]*)>\s*<\/el-empty>/g,
    (full, attrs) => {
      replacements++
      return `<EmptyState${attrs} />`
    }
  )

  if (s !== before) {
    fs.writeFileSync(file, s, 'utf8')
    filesTouched++
  }
}

console.log(JSON.stringify({ filesTouched, replacements }, null, 2))
