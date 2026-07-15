/**
 * 统一操作列「查看」按钮为 type="primary" size="small"（跟随主题主色）
 * - 无 type / type="info" / type="default" → type="primary"
 * - 已是 link + primary 保持
 * - 已是 primary 保持，补 size="small"（若缺失且非 link）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(__dirname, '../src')

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, acc)
    else if (ent.name.endsWith('.vue')) acc.push(p)
  }
  return acc
}

/**
 * 在标签字符串内规范化查看按钮
 */
function normalizeButtonTag(tag) {
  if (!/查看/.test(tag) || !/<el-button\b/i.test(tag)) return tag
  // 跳过「查看全部」「查看更多」等导航类，仅操作列短标签「查看」
  if (!/>\s*查看\s*</.test(tag) && !/>\s*<el-icon[^>]*>[\s\S]*?<\/el-icon>\s*查看\s*</.test(tag)) {
    // 也匹配 icon 在前：><el-icon.../> 查看</el-button>
    if (!/查看\s*<\/el-button>/i.test(tag)) return tag
    // 排除查看全部/详情长文案
    if (/查看(全部|更多|明细列表|执行分析)/.test(tag)) return tag
  }
  if (/查看(全部|更多|执行分析)/.test(tag)) return tag

  let t = tag
  const isLink = /\bis-link\b|\blink\b/.test(t) || /\slink[\s>]/.test(t) || /:link=/.test(t) || /\slink\s/.test(t)

  // type 处理
  if (/type\s*=\s*["']info["']/.test(t) || /type\s*=\s*["']default["']/.test(t)) {
    t = t.replace(/type\s*=\s*["'](?:info|default)["']/, 'type="primary"')
  } else if (!/type\s*=/.test(t)) {
    // 在 <el-button 后插入 type="primary"
    t = t.replace(/<el-button\b/, '<el-button type="primary"')
  }

  // size：非 link 时补 small
  if (!isLink && !/size\s*=/.test(t)) {
    t = t.replace(/<el-button\b([^>]*?)type="primary"/, '<el-button$1type="primary" size="small"')
    if (!/size\s*=/.test(t)) {
      t = t.replace(/<el-button\b/, '<el-button size="small"')
    }
  }

  // 统一加 class 便于主题扩展（幂等）
  if (!/btn-op-view/.test(t)) {
    if (/class\s*=\s*["']([^"']*)["']/.test(t)) {
      t = t.replace(/class\s*=\s*["']([^"']*)["']/, (m, c) => {
        if (c.includes('btn-op-view')) return m
        return `class="${c} btn-op-view"`
      })
    } else {
      t = t.replace(/<el-button\b/, '<el-button class="btn-op-view"')
    }
  }

  return t
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')
  const orig = content

  // 匹配单行与简单多行 el-button ... 查看 ... </el-button>
  content = content.replace(
    /<el-button\b[\s\S]*?<\/el-button>/g,
    (tag) => {
      if (!tag.includes('查看')) return tag
      // 过长的可能是大块误匹配，限制长度
      if (tag.length > 800) return tag
      return normalizeButtonTag(tag)
    }
  )

  if (content !== orig) {
    fs.writeFileSync(filePath, content, 'utf8')
    return true
  }
  return false
}

const files = walk(path.join(SRC, 'views'))
let n = 0
for (const f of files) {
  if (processFile(f)) {
    n++
    console.log('updated', path.relative(SRC, f))
  }
}
console.log(JSON.stringify({ filesUpdated: n }))
