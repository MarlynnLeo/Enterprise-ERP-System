/**
 * 操作列「查看 / 详情」统一为实心主题主色按钮：
 * type="primary" size="small" class="btn-op-view"
 * 去掉 link 文字链样式。
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

const EXCLUDE_TEXT = /查看(全部|更多|执行|历史|排名|详情)|跳转|打开/

function shouldUnify(tag) {
  if (!/<el-button\b/i.test(tag)) return false
  // 仅「查看」或「详情」短标签
  const text = tag.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!/^(查看|详情)$/.test(text) && !/>\s*(查看|详情)\s*</.test(tag)) {
    // 允许 icon + 查看
    if (!/(查看|详情)\s*<\/el-button>/i.test(tag)) return false
    if (EXCLUDE_TEXT.test(tag) && !/>\s*详情\s*</.test(tag) && !/>\s*查看\s*</.test(tag)) return false
  }
  if (/查看(全部|更多|执行分析|历史记录|排名)/.test(tag)) return false
  if (/查看详情/.test(tag) && !/>\s*查看\s*</.test(tag)) return false // 通知里的「查看详情」另议
  return true
}

function unifyTag(tag) {
  if (!shouldUnify(tag)) return tag
  let t = tag

  // 去掉 link 属性（独立属性 link 或 is-link）
  t = t.replace(/\s+link(?=[\s>])/g, '')
  t = t.replace(/\s+is-link(?=[\s>])/g, '')
  t = t.replace(/:link="[^"]*"/g, '')

  // type
  if (/type\s*=\s*["'][^"']*["']/.test(t)) {
    t = t.replace(/type\s*=\s*["'][^"']*["']/, 'type="primary"')
  } else {
    t = t.replace(/<el-button\b/, '<el-button type="primary"')
  }

  // size
  if (!/size\s*=/.test(t)) {
    t = t.replace(/type="primary"/, 'type="primary" size="small"')
  }

  // class btn-op-view
  if (!/btn-op-view/.test(t)) {
    if (/class\s*=\s*["']([^"']*)["']/.test(t)) {
      t = t.replace(/class\s*=\s*["']([^"']*)["']/, (m, c) =>
        c.includes('btn-op-view') ? m : `class="${c} btn-op-view"`
      )
    } else {
      t = t.replace(/<el-button\b/, '<el-button class="btn-op-view"')
    }
  }

  // 去掉 plain（查看应为实心主色）
  t = t.replace(/\s+plain(?=[\s>])/g, '')
  t = t.replace(/:plain="[^"]*"/g, '')

  return t
}

function processFile(fp) {
  let content = fs.readFileSync(fp, 'utf8')
  const orig = content
  content = content.replace(/<el-button\b[\s\S]*?<\/el-button>/g, (tag) => {
    if (tag.length > 700) return tag
    if (!/(查看|详情)/.test(tag)) return tag
    return unifyTag(tag)
  })
  if (content !== orig) {
    fs.writeFileSync(fp, content, 'utf8')
    return true
  }
  return false
}

let n = 0
for (const f of walk(VIEWS)) {
  if (processFile(f)) {
    n++
    console.log('updated', path.relative(VIEWS, f))
  }
}
console.log(JSON.stringify({ filesUpdated: n }))
