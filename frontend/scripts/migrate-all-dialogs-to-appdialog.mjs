/**
 * 全站 el-dialog → AppDialog 迁移
 *
 * - 业务 views 内禁止裸 el-dialog（仅 AppDialog 内部可有）
 * - 根据标题/上下文推断 mode: view | form | preview
 * - 保留 v-model / title / width / before-close / 事件 / footer slot
 * - 丢弃 append-to-body / destroy-on-close（AppDialog 默认已处理）
 * - 宽弹窗（>=900 或 百分比）自动 wide 或保留 width
 *
 * Usage: node scripts/migrate-all-dialogs-to-appdialog.mjs [--dry-run]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const VIEWS = path.join(ROOT, 'src/views')
const DRY = process.argv.includes('--dry-run')

const VIEW_HINT =
  /详情|查看|预览|明细|对比|定位结果|匹配明细|drill|viewDialog|detailDialog|detailsVisible|detailVis\b|detailVisible|detailsDialog|previewDialog|showPreview|stepsVisible|locateDialog|compareDialog/i

const PREVIEW_HINT = /预览|preview|文件预览|文档预览|PDF/i

const FORM_HINT =
  /新增|编辑|创建|修改|导入|导出|选择|确认|调整|审核|审批|分配|设置|配置|记录|作废|录入|新建|添加|批量|转固|归集|计提|处置|拆分|匹配|绑定|解绑|重置|同步|上传|下载|打印设置|规则|指标|期间|add|edit|create|import|form/i

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, acc)
    else if (ent.name.endsWith('.vue')) acc.push(p)
  }
  return acc
}

function findOpenTagEnd(content, start) {
  let inQuote = null
  for (let i = start; i < content.length; i++) {
    const ch = content[i]
    if (inQuote) {
      if (ch === inQuote && content[i - 1] !== '\\') inQuote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch
      continue
    }
    if (ch === '>') return i
  }
  return -1
}

function findMatchingClose(content, afterOpenGt) {
  let depth = 1
  const re = /<\/?el-dialog\b[^>]*>/gi
  re.lastIndex = afterOpenGt
  let m
  while ((m = re.exec(content))) {
    const tag = m[0]
    if (/^<\/el-dialog/i.test(tag)) {
      depth--
      if (depth === 0) return { start: m.index, end: m.index + tag.length }
    } else if (!/\/>\s*$/.test(tag)) {
      depth++
    }
  }
  return null
}

/**
 * 解析 el-dialog 开标签属性，保留原始 key 写法
 */
function extractAttrPairs(openTag) {
  const inner = openTag.replace(/^<el-dialog\b/i, '').replace(/>\s*$/, '').trim()
  const pairs = []
  // attr patterns: v-model="x" | :title="x" | @close="fn" | destroy-on-close | append-to-body
  const re =
    /([@:]?[a-zA-Z_:][\w:.-]*(?:\.[a-zA-Z][\w.-]*)*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m
  while ((m = re.exec(inner))) {
    const key = m[1]
    const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : true
    pairs.push({ key, val, raw: m[0] })
  }
  return pairs
}

function attrMap(pairs) {
  const map = {}
  for (const p of pairs) map[p.key] = p.val
  return map
}

function inferMode(openTag, attrs, nearby, inner) {
  const title = String(attrs.title ?? attrs[':title'] ?? '')
  const blob = `${openTag}\n${nearby}\n${title}\n${inner.slice(0, 400)}`

  if (PREVIEW_HINT.test(title) || PREVIEW_HINT.test(blob)) {
    // 仅当明确是文件/文档预览才用 preview；普通「预览」详情仍用 view
    if (/文件|文档|PDF|图片预览|附件预览/i.test(blob)) return 'preview'
  }
  if (VIEW_HINT.test(title) || VIEW_HINT.test(blob)) {
    // 若标题同时是「编辑xxx详情」之类，仍 view；纯表单标题走 form
    if (FORM_HINT.test(title) && !/详情|查看|预览|明细|对比/.test(title)) {
      // e.g. dialogTitle 动态可能是 新增/编辑 — 用 form
      return 'form'
    }
    return 'view'
  }
  // 内容以 el-form 为主 → form
  if (/<el-form[\s>]/.test(inner.slice(0, 800))) return 'form'
  // 内容以 descriptions + table 为主且无 form → view
  if (
    /<el-descriptions[\s>]/.test(inner.slice(0, 600)) &&
    !/<el-form[\s>]/.test(inner.slice(0, 600))
  ) {
    return 'view'
  }
  return 'form'
}

function parseWidth(attrs) {
  const w = attrs.width ?? attrs[':width']
  if (w === undefined || w === true) return { kind: 'default' }
  const s = String(w)
  // static like 600px / 50% / 900
  if (attrs.width !== undefined) {
    const num = parseInt(s, 10)
    if (s.includes('%') || (!Number.isNaN(num) && num >= 900)) {
      return { kind: 'wide', raw: s }
    }
    if (!Number.isNaN(num) && num > 640) {
      return { kind: 'width', raw: s.includes('px') ? s : `${num}px` }
    }
    if (!Number.isNaN(num)) {
      return { kind: 'width', raw: s.includes('px') ? s : `${num}px` }
    }
    return { kind: 'width', raw: s }
  }
  // dynamic :width
  return { kind: 'bind', expr: s }
}

function buildAppDialogOpen(pairs, mode, indent) {
  const attrs = attrMap(pairs)
  const lines = []
  const push = (s) => lines.push(s)

  // v-model / model-value
  if (attrs['v-model'] !== undefined) push(`v-model="${attrs['v-model']}"`)
  if (attrs[':model-value'] !== undefined) push(`:model-value="${attrs[':model-value']}"`)
  if (attrs['model-value'] !== undefined) push(`:model-value="${attrs['model-value']}"`)
  if (attrs['@update:model-value'] !== undefined) {
    push(`@update:model-value="${attrs['@update:model-value']}"`)
  }
  if (attrs['@update:modelValue'] !== undefined) {
    push(`@update:model-value="${attrs['@update:modelValue']}"`)
  }

  // title
  if (attrs.title !== undefined && attrs.title !== true) push(`title="${attrs.title}"`)
  if (attrs[':title'] !== undefined) push(`:title="${attrs[':title']}"`)

  push(`mode="${mode}"`)

  // width / wide / content-width
  const w = parseWidth(attrs)
  if (mode === 'view') {
    if (w.kind === 'wide') {
      push('content-width="wide"')
      // wide already expands; keep explicit width only if not percentage-like default
    } else if (w.kind === 'width') {
      const n = parseInt(w.raw, 10)
      if (!Number.isNaN(n) && n >= 800) push('content-width="wide"')
      else if (w.raw && w.raw !== '800px') push(`width="${w.raw}"`)
      else push('content-width="wide"') // view 默认略宽
    } else if (w.kind === 'bind') {
      push(`:width="${w.expr}"`)
    } else {
      push('content-width="wide"')
    }
  } else if (mode === 'form') {
    if (w.kind === 'wide') {
      push('wide')
    } else if (w.kind === 'width') {
      const n = parseInt(w.raw, 10)
      if (!Number.isNaN(n) && n >= 900) push('wide')
      else if (w.raw && w.raw !== '640px') push(`width="${w.raw}"`)
      // else default 640
    } else if (w.kind === 'bind') {
      push(`:width="${w.expr}"`)
    }
  } else {
    // preview
    if (w.kind === 'width') push(`width="${w.raw}"`)
    else if (w.kind === 'bind') push(`:width="${w.expr}"`)
  }

  // boolean / other props AppDialog supports
  const DROP = new Set([
    'v-model',
    ':model-value',
    'model-value',
    '@update:model-value',
    '@update:modelValue',
    'title',
    ':title',
    'width',
    ':width',
    'append-to-body',
    ':append-to-body',
    'destroy-on-close',
    ':destroy-on-close',
    'align-center',
    ':align-center',
    'fullscreen',
    ':fullscreen',
    'top',
    ':top',
    'center',
    'draggable', // keep via prop if true
    'class',
    ':class',
    'custom-class',
    ':custom-class',
  ])

  // destroy-on-close false → :destroy-on-close="false"
  if (attrs[':destroy-on-close'] === 'false' || attrs['destroy-on-close'] === 'false') {
    push(':destroy-on-close="false"')
  }
  // default destroy true — omit

  if (attrs['close-on-click-modal'] === 'false' || attrs['close-on-click-modal'] === false) {
    push(':close-on-click-modal="false"')
  }
  if (attrs[':close-on-click-modal'] !== undefined) {
    push(`:close-on-click-modal="${attrs[':close-on-click-modal']}"`)
  }
  if (attrs['close-on-press-escape'] === 'false') {
    push(':close-on-press-escape="false"')
  }
  if (attrs[':close-on-press-escape'] !== undefined) {
    push(`:close-on-press-escape="${attrs[':close-on-press-escape']}"`)
  }
  if (attrs['show-close'] === 'false') push(':show-close="false"')
  if (attrs[':show-close'] !== undefined) push(`:show-close="${attrs[':show-close']}"`)
  if (attrs.draggable === true || attrs.draggable === '' || attrs.draggable === true) {
    // boolean attr present
    if (attrs.draggable !== undefined && attrs.draggable !== false) push('draggable')
  }
  if (attrs[':draggable'] !== undefined) push(`:draggable="${attrs[':draggable']}"`)
  if (attrs[':before-close'] !== undefined) push(`:before-close="${attrs[':before-close']}"`)
  if (attrs['before-close'] !== undefined && attrs['before-close'] !== true) {
    push(`:before-close="${attrs['before-close']}"`)
  }
  if (attrs['v-loading'] !== undefined) {
    // invalid on dialog root usually — skip, body uses loading prop if needed
  }
  if (attrs.loading !== undefined || attrs[':loading'] !== undefined) {
    if (attrs[':loading'] !== undefined) push(`:loading="${attrs[':loading']}"`)
    else if (attrs.loading === true) push('loading')
  }

  // class → custom-class
  if (attrs.class !== undefined && attrs.class !== true) {
    push(`custom-class="${attrs.class}"`)
  }
  if (attrs[':class'] !== undefined) {
    push(`:custom-class="${attrs[':class']}"`)
  }
  if (attrs['custom-class'] !== undefined) push(`custom-class="${attrs['custom-class']}"`)
  if (attrs[':custom-class'] !== undefined) push(`:custom-class="${attrs[':custom-class']}"`)

  // remaining events @open @opened @close @closed etc.
  for (const p of pairs) {
    if (DROP.has(p.key)) continue
    if (p.key.startsWith('@')) {
      push(p.val === true ? p.key : `${p.key}="${p.val}"`)
      continue
    }
    // skip already handled
    if (
      [
        'close-on-click-modal',
        ':close-on-click-modal',
        'close-on-press-escape',
        ':close-on-press-escape',
        'show-close',
        ':show-close',
        'draggable',
        ':draggable',
        'before-close',
        ':before-close',
        'loading',
        ':loading',
        'destroy-on-close',
        ':destroy-on-close',
      ].includes(p.key)
    ) {
      continue
    }
    // unknown attrs: drop silently (EP-only)
  }

  const pad = indent || '    '
  const innerPad = pad + '  '
  return `<AppDialog\n${lines.map((l) => innerPad + l).join('\n')}\n${pad}>`
}

function detectIndent(content, idx) {
  const lineStart = content.lastIndexOf('\n', idx - 1) + 1
  const prefix = content.slice(lineStart, idx)
  const m = prefix.match(/^(\s*)/)
  return m ? m[1] : '    '
}

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')
  if (!content.includes('<el-dialog')) {
    return { file: filePath, count: 0, modes: {} }
  }

  let count = 0
  const modes = { view: 0, form: 0, preview: 0 }
  let searchFrom = 0
  let safety = 0

  while (safety++ < 200) {
    const idx = content.indexOf('<el-dialog', searchFrom)
    if (idx === -1) break

    const gt = findOpenTagEnd(content, idx)
    if (gt === -1) {
      searchFrom = idx + 10
      continue
    }

    const openTag = content.slice(idx, gt + 1)
    const close = findMatchingClose(content, gt + 1)
    if (!close) {
      console.warn('NO_CLOSE', path.relative(ROOT, filePath), openTag.slice(0, 80))
      searchFrom = gt + 1
      continue
    }

    const inner = content.slice(gt + 1, close.start)
    const nearby = content.slice(Math.max(0, idx - 120), Math.min(content.length, gt + 250))
    const pairs = extractAttrPairs(openTag)
    const attrs = attrMap(pairs)
    const mode = inferMode(openTag, attrs, nearby, inner)
    modes[mode] = (modes[mode] || 0) + 1

    const indent = detectIndent(content, idx)
    const newOpen = buildAppDialogOpen(pairs, mode, indent)
    const before = content.slice(0, idx)
    const after = content.slice(close.end)
    content = before + newOpen + inner + `${indent}</AppDialog>` + after
    count++
    searchFrom = before.length + newOpen.length + inner.length + indent.length + '</AppDialog>'.length
  }

  // strip common local dialog shell CSS that fights dialog-system
  let cleaned = content
  const cssPatterns = [
    /\/\*\s*对话框[^]*?\*\/\s*:deep\(\.el-dialog[^)]*\)[^{]*\{[^}]*\}\s*/g,
    /:deep\(\.el-dialog__body\)\s*\{\s*max-height:[^}]*\}\s*/g,
    /:deep\(\.el-dialog:not\(\.is-fullscreen\)[^)]*\)\s*\{[^}]*\}\s*/g,
    /:deep\(\.el-dialog\.is-fullscreen[^)]*\)\s*\{[^}]*\}\s*/g,
    /:deep\(\.el-dialog\)\s*\{\s*[^}]*margin-top:[^}]*\}\s*/g,
  ]
  for (const re of cssPatterns) cleaned = cleaned.replace(re, '')

  if (count > 0 && !DRY) {
    fs.writeFileSync(filePath, cleaned, 'utf8')
  }

  return {
    file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
    count,
    modes,
  }
}

const files = walk(VIEWS)
const results = []
let total = 0
const modeTotals = { view: 0, form: 0, preview: 0 }

for (const f of files) {
  const r = migrateFile(f)
  if (r.count > 0) {
    results.push(r)
    total += r.count
    for (const k of Object.keys(modeTotals)) {
      modeTotals[k] += r.modes[k] || 0
    }
  }
}

// verify remaining
let remaining = 0
const remainFiles = []
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8')
  const n = (s.match(/<el-dialog\b/g) || []).length
  if (n > 0) {
    remaining += n
    remainFiles.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), n })
  }
}

console.log(
  JSON.stringify(
    {
      dryRun: DRY,
      filesTouched: results.length,
      dialogsMigrated: total,
      modeTotals,
      remainingElDialog: remaining,
      remainFiles: remainFiles.slice(0, 30),
      sample: results.slice(0, 15),
    },
    null,
    2
  )
)
