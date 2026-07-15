/**
 * 将「查看/详情」类 el-dialog 批量迁移为 AppDialog mode="view"
 * 表单/新建/编辑弹窗不迁移。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(__dirname, '../src')

const VIEW_HINT =
  /详情|查看|viewDialog|detailDialog|detailsVisible|detailVis\b|detailVisible|detailsDialog|drilldown|showPreview|stepsVisible|previewDialog/i

const FORM_ONLY =
  /新增|编辑|创建|修改|导入|导出|选择|确认|调整|审核|审批|分配|设置|配置|add|edit|create|import/i

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, acc)
    else if (ent.name.endsWith('.vue')) acc.push(p)
  }
  return acc
}

function findMatchingClose(content, openEndIndex) {
  // openEndIndex points after the opening '>' of el-dialog
  const i = openEndIndex
  let depth = 1
  const re = /<\/?el-dialog\b[^>]*>/g
  re.lastIndex = i
  let m
  while ((m = re.exec(content))) {
    if (m[0].startsWith('</')) {
      depth--
      if (depth === 0) return { start: m.index, end: m.index + m[0].length }
    } else if (!m[0].endsWith('/>')) {
      depth++
    }
  }
  return null
}

function extractAttrs(openTag) {
  // crude attr parse: key="val" | :key="val" | key | v-model="x"
  const attrs = {}
  const re =
    /([:@]?[a-zA-Z][\w.-]*(?:\.[a-zA-Z][\w.-]*)*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|([^\s"'=<>`]+)))?/g
  let m
  // strip tag name
  const inner = openTag.replace(/^<el-dialog\b/i, '').replace(/>$/, '').trim()
  while ((m = re.exec(inner))) {
    const key = m[1]
    const val = m[2] ?? m[3] ?? m[4] ?? m[5] ?? true
    attrs[key] = val
  }
  return attrs
}

function shouldMigrate(openTag, openAttrs, nearby) {
  if (!VIEW_HINT.test(openTag + nearby)) return false
  // dual-mode dialogs with edit in title: still migrate if 详情 present, or mode-based
  const title = String(openAttrs.title || openAttrs[':title'] || '')
  if (FORM_ONLY.test(title) && !/详情|查看/.test(title) && !/detailMode|dialogMode|isEditing|dialogType/.test(openTag + nearby)) {
    return false
  }
  // explicit review/audit small dialogs can stay form-like but 审核8D报告 is form - skip pure review without 详情
  if (/审核|审批/.test(title) && !/详情/.test(title)) return false
  return true
}

function buildAppDialogOpen(openAttrs) {
  const keep = []
  // v-model
  if (openAttrs['v-model'] !== undefined) keep.push(`v-model="${openAttrs['v-model']}"`)
  if (openAttrs[':model-value'] !== undefined) keep.push(`:model-value="${openAttrs[':model-value']}"`)
  if (openAttrs['model-value'] !== undefined) keep.push(`:model-value="${openAttrs['model-value']}"`)
  if (openAttrs['@update:model-value'] !== undefined) {
    keep.push(`@update:model-value="${openAttrs['@update:model-value']}"`)
  }
  if (openAttrs['@update:modelValue'] !== undefined) {
    keep.push(`@update:model-value="${openAttrs['@update:modelValue']}"`)
  }

  if (openAttrs.title !== undefined && openAttrs.title !== true) {
    keep.push(`title="${openAttrs.title}"`)
  }
  if (openAttrs[':title'] !== undefined) {
    keep.push(`:title="${openAttrs[':title']}"`)
  }

  keep.push('mode="view"')
  keep.push('content-width="wide"')

  if (openAttrs['destroy-on-close'] !== undefined || openAttrs.destroyOnClose !== undefined) {
    // AppDialog default true
  }
  if (openAttrs[':close-on-click-modal'] !== undefined) {
    keep.push(`:close-on-click-modal="${openAttrs[':close-on-click-modal']}"`)
  }
  if (openAttrs['close-on-click-modal'] === false || openAttrs['close-on-click-modal'] === 'false') {
    keep.push(':close-on-click-modal="false"')
  }
  if (openAttrs['v-loading'] !== undefined) {
    // not a dialog prop usually
  }
  // preserve @open @close etc
  for (const [k, v] of Object.entries(openAttrs)) {
    if (k.startsWith('@') && !k.startsWith('@update:model')) {
      keep.push(v === true ? k : `${k}="${v}"`)
    }
  }

  // multiline pretty
  return `<AppDialog\n      ${keep.join('\n      ')}\n    >`
}

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')
  if (!content.includes('<el-dialog')) return { file: filePath, changed: false, count: 0 }

  let count = 0
  let searchFrom = 0
  let safety = 0

  while (safety++ < 100) {
    const idx = content.indexOf('<el-dialog', searchFrom)
    if (idx === -1) break

    // find end of opening tag (handle multi-line)
    let gt = -1
    let inQuote = null
    for (let i = idx; i < content.length; i++) {
      const ch = content[i]
      if (inQuote) {
        if (ch === inQuote && content[i - 1] !== '\\') inQuote = null
        continue
      }
      if (ch === '"' || ch === "'") {
        inQuote = ch
        continue
      }
      if (ch === '>') {
        gt = i
        break
      }
    }
    if (gt === -1) {
      searchFrom = idx + 10
      continue
    }

    const openTag = content.slice(idx, gt + 1)
    const nearby = content.slice(Math.max(0, idx - 80), Math.min(content.length, gt + 200))
    const attrs = extractAttrs(openTag)

    if (!shouldMigrate(openTag, attrs, nearby)) {
      searchFrom = gt + 1
      continue
    }

    const close = findMatchingClose(content, gt + 1)
    if (!close) {
      searchFrom = gt + 1
      continue
    }

    const newOpen = buildAppDialogOpen(attrs)
    const before = content.slice(0, idx)
    const inner = content.slice(gt + 1, close.start)
    const after = content.slice(close.end)
    content = before + newOpen + inner + '</AppDialog>' + after
    count++
    // continue after this replacement
    searchFrom = before.length + newOpen.length + inner.length + '</AppDialog>'.length
  }

  // clean page-level max-height dialog body patches
  const cleaned = content.replace(
    /\/\*\s*对话框高度[\s\S]*?\*\/\s*:deep\(\.el-dialog__body\)\s*\{[^}]*\}\s*/g,
    ''
  ).replace(
    /:deep\(\.el-dialog__body\)\s*\{\s*max-height:\s*6[05]vh;[^}]*\}\s*/g,
    ''
  ).replace(
    /:deep\(\.el-dialog__body\)\s*\{\s*max-height:\s*70vh;[^}]*\}\s*/g,
    ''
  ).replace(
    /:deep\(\.el-dialog:not\(\.is-fullscreen\)\s*\.el-dialog__body\)\s*\{[^}]*\}\s*/g,
    ''
  ).replace(
    /:deep\(\.el-dialog\.is-fullscreen\s*\.el-dialog__body\)\s*\{[^}]*\}\s*/g,
    ''
  )

  const changed = cleaned !== fs.readFileSync(filePath, 'utf8')
  if (changed || count > 0) {
    fs.writeFileSync(filePath, cleaned, 'utf8')
  }
  return { file: path.relative(SRC, filePath), changed: changed || count > 0, count }
}

const files = walk(SRC)
const results = []
for (const f of files) {
  const r = migrateFile(f)
  if (r.count > 0 || r.changed) results.push(r)
}

const totalMigrated = results.reduce((s, r) => s + r.count, 0)
console.log(JSON.stringify({ filesTouched: results.length, dialogsMigrated: totalMigrated, results }, null, 2))
