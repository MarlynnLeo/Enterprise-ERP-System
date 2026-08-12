/**
 * 移动端完整度/假按钮审计
 * - 路由与 views 对齐
 * - API 模块方法是否被 views 引用
 * - 疑似假按钮：@click 无处理 / 仅 toast / 开发中文案
 * - 对照 PC 模块覆盖（粗粒度）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const PC_VIEWS = path.resolve(ROOT, '../frontend/src/views')

function walk(dir, pred = () => true, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, pred, acc)
    else if (pred(p)) acc.push(p)
  }
  return acc
}

function read(p) {
  return fs.readFileSync(p, 'utf8')
}

function rel(p) {
  return path.relative(SRC, p).replace(/\\/g, '/')
}

// ---- routes ----
const routerFiles = walk(path.join(SRC, 'router'), (p) => p.endsWith('.js'))
const routeImportRe = /component:\s*\(\)\s*=>\s*import\(['"]@\/([^'"]+)['"]\)/g
const routePathRe = /path:\s*['"]([^'"]+)['"]/g
const routeNameRe = /name:\s*['"]([^'"]+)['"]/g

const routes = []
for (const f of routerFiles) {
  const src = read(f)
  // crude block split by path:
  const blocks = src.split(/(?=path:\s*['"])/)
  for (const block of blocks) {
    const pathM = block.match(/path:\s*['"]([^'"]+)['"]/)
    const nameM = block.match(/name:\s*['"]([^'"]+)['"]/)
    const impM = block.match(/import\(['"]@\/([^'"]+)['"]\)/)
    if (pathM && impM) {
      routes.push({
        path: pathM[1],
        name: nameM?.[1] || '',
        component: impM[1],
        file: rel(f),
      })
    }
  }
}

// ---- views ----
const viewFiles = walk(path.join(SRC, 'views'), (p) => p.endsWith('.vue'))
const viewSet = new Set(viewFiles.map((p) => rel(p)))

const missingViews = []
const resolvedComponents = new Set()
for (const r of routes) {
  const candidate = r.component.endsWith('.vue') ? r.component : `${r.component}.vue`
  const alt = candidate.startsWith('views/') ? candidate : `views/${candidate}`
  const keys = [candidate, alt, candidate.replace(/^views\//, '')]
  let ok = false
  for (const k of keys) {
    const full = path.join(SRC, k.startsWith('views/') ? k : `views/${k.replace(/^views\//, '')}`)
    // import is @/views/...
    const fromAt = path.join(SRC, r.component.replace(/^views\//, r.component.startsWith('views/') ? '' : '') )
    // r.component is like views/Login.vue
    const compPath = path.join(SRC, r.component)
    if (fs.existsSync(compPath)) {
      ok = true
      resolvedComponents.add(rel(compPath))
      break
    }
  }
  const compPath = path.join(SRC, r.component)
  if (!fs.existsSync(compPath)) {
    missingViews.push(r)
  } else {
    resolvedComponents.add(rel(compPath))
  }
}

// orphan views (not in any route)
const routedViews = new Set(
  routes.map((r) => rel(path.join(SRC, r.component))).filter((p) => p.endsWith('.vue'))
)
// normalize
const routedNormalized = new Set(
  routes
    .map((r) => {
      const p = path.join(SRC, r.component)
      return fs.existsSync(p) ? rel(p) : null
    })
    .filter(Boolean)
)

const orphanViews = viewFiles
  .map((p) => rel(p))
  .filter((v) => !routedNormalized.has(v) && !v.includes('components/'))

// ---- fake button / incomplete patterns ----
const FAKE_PATTERNS = [
  { id: 'dev_wip', re: /开发中|暂未实现|暂不支持|敬请期待|coming soon|not implemented|功能待/i },
  { id: 'empty_click', re: /@click\s*=\s*["']\s*["']/ },
  { id: 'noop_handler', re: /(?:const|function)\s+\w+\s*=\s*(?:async\s*)?\(\s*\)\s*=>\s*\{\s*\}/ },
  { id: 'todo_fixme', re: /\bTODO\b|\bFIXME\b|\bXXX\b/ },
  { id: 'mock_only', re: /mockData|MOCK_|假数据|写死/i },
  { id: 'alert_only', re: /@click[^>]*>[\s\S]{0,80}showToast\(\s*['"][^'"]{0,40}['"]\s*\)/ },
]

const viewHits = []
for (const vf of viewFiles) {
  const src = read(vf)
  const hits = []
  for (const p of FAKE_PATTERNS) {
    if (p.re.test(src)) hits.push(p.id)
  }
  // buttons without @click in template (van-button / button with only type)
  const template = src.match(/<template[\s\S]*?<\/template>/)?.[0] || ''
  const buttons = [...template.matchAll(/<(?:van-button|button)([^>]*)>/gi)]
  let bareButtons = 0
  for (const m of buttons) {
    const attrs = m[1] || ''
    if (!/@click|native-type\s*=\s*["']submit["']|type\s*=\s*["']submit["']/.test(attrs)) {
      // exclude pure decorative
      if (!/disabled|class="[^"]*icon/.test(attrs)) bareButtons++
    }
  }
  if (hits.length || bareButtons > 0) {
    viewHits.push({
      file: rel(vf),
      patterns: hits,
      bareButtons,
    })
  }
}

// 暂不支持详情 — real gap
const softGaps = []
for (const vf of viewFiles) {
  const src = read(vf)
  const m = src.match(/showToast\(['"]([^'"]*(?:暂不|未配置|开发)[^'"]*)['"]\)/g)
  if (m) softGaps.push({ file: rel(vf), messages: m })
}

// ---- API modules usage ----
const apiModules = walk(path.join(SRC, 'api/modules'), (p) => p.endsWith('.js'))
const allViewSrc = viewFiles.map(read).join('\n')
const apiUsage = []
for (const mod of apiModules) {
  const name = path.basename(mod, '.js')
  const src = read(mod)
  const methodNames = new Set()
  for (const mm of src.matchAll(/^\s{2,}(\w+)\s*\(/gm)) methodNames.add(mm[1])
  for (const mm of src.matchAll(/(\w+)\s*:\s*async\s*\(/g)) methodNames.add(mm[1])
  for (const mm of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) methodNames.add(mm[1])
  for (const mm of src.matchAll(/^\s+(\w+)\s*\([^)]*\)\s*\{/gm)) {
    if (!['if', 'for', 'while', 'switch', 'catch'].includes(mm[1])) methodNames.add(mm[1])
  }

  const used = []
  const unused = []
  for (const method of methodNames) {
    if (method === 'constructor') continue
    // referenced in views/api index
    const re = new RegExp(`\\b${method}\\b`)
    if (re.test(allViewSrc) || re.test(read(path.join(SRC, 'api/index.js')))) {
      // also check if module itself exports and something imports module.method
      used.push(method)
    } else {
      // check module.api.method pattern across src
      const whole = walk(SRC, (p) => p.endsWith('.vue') || p.endsWith('.js'))
        .filter((p) => !p.includes('api/modules'))
        .map(read)
        .join('\n')
      if (new RegExp(`\\.${method}\\s*\\(`).test(whole)) used.push(method)
      else unused.push(method)
    }
  }
  apiUsage.push({
    module: name,
    methodCount: methodNames.size,
    used: used.length,
    unusedSample: unused.slice(0, 15),
    unusedCount: unused.length,
  })
}

// ---- PC vs Mobile module folders ----
const mobileModules = fs
  .readdirSync(path.join(SRC, 'views'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
const pcModules = fs.existsSync(PC_VIEWS)
  ? fs
      .readdirSync(PC_VIEWS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  : []

const pcOnly = pcModules.filter((m) => !mobileModules.includes(m) && !['auth', 'dashboard', 'dataoverview', 'layout'].includes(m))
const mobileOnly = mobileModules.filter((m) => !pcModules.includes(m))

// PC important gaps
const PC_CRITICAL = {
  finance: ['cost', 'budget', 'tax', 'pricing', 'period', 'gl'],
  quality: ['first-article', '8d', 'rework', 'scrap', 'gauge', 'aql'],
  production: ['gantt', 'calendar', 'mrp', 'material-readiness', 'assembly'],
  sales: ['packing', 'contract'],
  purchase: ['history'],
  inventory: ['year-end', 'manual'],
  system: ['users', 'roles', 'backup', 'workflow-mgmt', 'print'],
}

const mobileAllSrc = walk(SRC, (p) => p.endsWith('.vue') || p.endsWith('.js'))
  .map(read)
  .join('\n')
  .toLowerCase()

const featureGaps = []
for (const [mod, feats] of Object.entries(PC_CRITICAL)) {
  for (const f of feats) {
    const hit =
      mobileAllSrc.includes(f.replace(/-/g, '')) ||
      mobileAllSrc.includes(f) ||
      mobileAllSrc.includes(f.replace(/-/g, '_'))
    if (!hit) featureGaps.push({ module: mod, feature: f, status: 'likely_missing' })
  }
}

// Index pages menu paths existence
const indexFiles = viewFiles.filter((p) => /Index\.vue$/.test(p))
const indexLinkIssues = []
for (const idx of indexFiles) {
  const src = read(idx)
  const paths = [...src.matchAll(/path:\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
  for (const pth of paths) {
    if (!pth.startsWith('/')) continue
    const exists = routes.some((r) => {
      // simple match: exact or param
      if (r.path === pth) return true
      const base = r.path.replace(/:[\w]+/g, '[^/]+')
      try {
        return new RegExp(`^${base}$`).test(pth)
      } catch {
        return false
      }
    })
    if (!exists) indexLinkIssues.push({ file: rel(idx), path: pth })
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  scale: {
    views: viewFiles.length,
    routes: routes.length,
    apiModules: apiModules.length,
    routerFiles: routerFiles.length,
  },
  routes: {
    total: routes.length,
    missingViews: missingViews,
    orphanViews: orphanViews.slice(0, 40),
    orphanCount: orphanViews.length,
  },
  incomplete: {
    viewsWithPatterns: viewHits.filter((v) => v.patterns.length > 0 || v.bareButtons >= 3),
    softGaps,
    indexDeadLinks: indexLinkIssues,
  },
  api: apiUsage,
  coverageVsPc: {
    mobileModules,
    pcModules,
    pcOnlyFolders: pcOnly,
    mobileOnlyFolders: mobileOnly,
    featureGaps,
  },
}

const out = path.join(ROOT, 'scripts/mobile-completeness-audit.json')
fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8')

// print summary
console.log('=== Mobile Completeness Audit ===')
console.log(JSON.stringify(report.scale, null, 2))
console.log('missing route components:', missingViews.length)
console.log('orphan views:', orphanViews.length)
console.log('views with WIP patterns:', report.incomplete.viewsWithPatterns.length)
console.log('soft toast gaps:', softGaps.length)
console.log('index dead links:', indexLinkIssues.length)
console.log('feature gaps vs PC critical:', featureGaps.length)
console.log('API unused methods total:', apiUsage.reduce((s, a) => s + a.unusedCount, 0))
console.log('Report:', out)

// top issues
if (softGaps.length) {
  console.log('\n--- soft gaps (toast) ---')
  softGaps.slice(0, 15).forEach((g) => console.log(g.file, g.messages.join('; ')))
}
if (indexLinkIssues.length) {
  console.log('\n--- index dead links ---')
  indexLinkIssues.slice(0, 20).forEach((g) => console.log(g.file, '->', g.path))
}
if (featureGaps.length) {
  console.log('\n--- missing critical features (keyword scan) ---')
  featureGaps.forEach((g) => console.log(`${g.module}.${g.feature}`))
}
if (missingViews.length) {
  console.log('\n--- missing views ---')
  missingViews.forEach((r) => console.log(r.path, r.component))
}
