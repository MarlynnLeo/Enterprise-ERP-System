/**
 * PC 前端操作按钮有效性审计（v2）
 * - 假文案 / 空 handler
 * - 展开嵌套路由完整 path，校验 router.push 静态路径
 * - 识别 composable 解构，降低 missing handler 误报
 * - 操作列 + API 调用粗粒度完备度
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')

function walk(dir, pred = () => true, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (['node_modules', 'dist', 'coverage'].includes(ent.name)) continue
      walk(p, pred, acc)
    } else if (pred(p)) acc.push(p)
  }
  return acc
}

const rel = (p) => path.relative(SRC, p).replace(/\\/g, '/')
const read = (p) => fs.readFileSync(p, 'utf8')

function buildFullRouteSet() {
  const paths = new Set()
  const routerRoot = path.join(SRC, 'router')
  const files = walk(routerRoot, (p) => p.endsWith('.js'))

  // Parse modules as children of '/' typically with parent path like 'finance'
  // Collect all path segments from each module file and join with common parents
  for (const f of files) {
    const src = read(f)
    const filePaths = []
    for (const m of src.matchAll(/path:\s*['"`]([^'"`]+)['"`]/g)) {
      filePaths.push(m[1])
    }
    // find top-level module path (first non-empty, non-redirect style)
    const top = filePaths.find((p) => p && p !== '' && !p.includes('*') && !p.startsWith('/'))
    for (const p of filePaths) {
      if (!p || p.includes('*')) continue
      if (p.startsWith('/')) {
        paths.add(p)
        continue
      }
      if (p === '') {
        if (top) paths.add('/' + top)
        continue
      }
      // child of module
      if (top && p !== top) {
        // p may already include module prefix or be relative
        if (p.startsWith(top + '/') || p === top) {
          paths.add('/' + p)
        } else {
          paths.add('/' + top + '/' + p)
          // also without double
          paths.add('/' + p)
        }
      } else {
        paths.add('/' + p)
      }
    }
  }

  // index.js absolute + relative under layout
  const indexSrc = read(path.join(routerRoot, 'index.js'))
  for (const m of indexSrc.matchAll(/path:\s*['"`]([^'"`]+)['"`]/g)) {
    const p = m[1]
    if (p.startsWith('/')) paths.add(p)
    else if (p && !p.includes('*')) {
      paths.add('/' + p)
    }
  }

  // normalize: remove trailing slashes
  const normalized = new Set()
  for (const p of paths) {
    if (!p || p === '/') {
      normalized.add('/')
      continue
    }
    normalized.add(p.replace(/\/+$/, '') || '/')
  }
  return normalized
}

const routePaths = buildFullRouteSet()

function matchRoute(inputPath) {
  if (!inputPath || inputPath.includes('${')) return { ok: true, reason: 'dynamic_template' }
  const clean = inputPath.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/'
  if (routePaths.has(clean)) return { ok: true, path: clean }
  // :param match
  for (const rp of routePaths) {
    if (!rp.includes(':')) continue
    const re = new RegExp('^' + rp.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/') + '$')
    if (re.test(clean)) return { ok: true, path: clean, matched: rp }
  }
  // numeric id segment substitution against :id routes
  const asPattern = clean.replace(/\/\d+/g, '/:id')
  if (routePaths.has(asPattern)) return { ok: true, path: clean, matched: asPattern }
  // prefix: if any route starts with clean + '/' parent list page exists
  for (const rp of routePaths) {
    if (rp === clean || rp.startsWith(clean + '/')) return { ok: true, path: clean, parent: true }
  }
  return { ok: false, path: clean }
}

const viewFiles = walk(path.join(SRC, 'views'), (p) => p.endsWith('.vue'))
const componentFiles = walk(path.join(SRC, 'components'), (p) => p.endsWith('.vue'))
const allVue = [...viewFiles, ...componentFiles]

const findings = {
  fakeText: [],
  emptyHandlers: [],
  missingHandlersHighConfidence: [],
  deadRouterPush: [],
  actionWithoutApiHint: [],
  stats: {
    views: viewFiles.length,
    components: componentFiles.length,
    elButtons: 0,
    clickBindings: 0,
    staticRouterPushes: 0,
    dynamicRouterPushes: 0,
    routePaths: routePaths.size,
    actionColumns: 0,
    permissionButtons: 0,
  },
}

// API method names used in frontend
const apiFiles = walk(path.join(SRC, 'api'), (p) => p.endsWith('.js'))
const apiMethodHints = new Set()
for (const f of apiFiles) {
  const t = read(f)
  for (const m of t.matchAll(/^\s*([A-Za-z_][\w]*)\s*[:(]/gm)) {
    if (m[1].length > 2) apiMethodHints.add(m[1])
  }
  for (const m of t.matchAll(/([A-Za-z_][\w]*)\s*:\s*(?:async\s*)?\(/g)) {
    apiMethodHints.add(m[1])
  }
}

for (const file of allVue) {
  const src = read(file)
  const r = rel(file)

  findings.stats.elButtons += (src.match(/<el-button\b/g) || []).length
  findings.stats.permissionButtons += (src.match(/v-permission=/g) || []).length
  if (/label=["']操作["']/.test(src)) findings.stats.actionColumns += 1

  // fake text (exclude business status 建设中 for CIP)
  const fakeRe =
    /['"`]([^'"`]*(?:开发中|暂未实现|暂不支持|敬请期待|coming soon|功能待开发|待开发|未实现|即将上线)[^'"`]*)['"`]/gi
  const fakes = [...src.matchAll(fakeRe)].map((m) => m[1])
  if (fakes.length) findings.fakeText.push({ file: r, samples: [...new Set(fakes)].slice(0, 5) })

  // empty handlers (real noop)
  for (const m of src.matchAll(
    /(?:const|let|function|async\s+function)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{\s*\}/g
  )) {
    // allow intentionally empty lifecycle like onRendered
    if (/Rendered|Mounted|Unmounted|Updated|Scroll|Resize|Focus|Blur/i.test(m[1])) {
      findings.emptyHandlers.push({ file: r, name: m[1], severity: 'low', note: '可能是事件占位' })
    } else {
      findings.emptyHandlers.push({ file: r, name: m[1], severity: 'high' })
    }
  }

  // defined names including destructuring from composables
  const defined = new Set()
  for (const m of src.matchAll(/(?:const|let|function|async\s+function)\s+(\w+)\s*[=:(]/g)) {
    defined.add(m[1])
  }
  // const { a, b, c } = useXxx()
  for (const m of src.matchAll(/const\s*\{([^}]+)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(':')[0].trim().replace(/\.\.\./, '')
      if (name && /^[A-Za-z_$]/.test(name)) defined.add(name)
    }
  }
  // methods: { foo() {} }
  for (const m of src.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) {
    defined.add(m[1])
  }

  const clicks = [
    ...src.matchAll(/@(?:click|click\.stop|click\.prevent)(?:\.\w+)*\s*=\s*["']([^"']+)["']/g),
  ]
  findings.stats.clickBindings += clicks.length

  for (const m of clicks) {
    const expr = m[1].trim()
    if (!expr) {
      findings.missingHandlersHighConfidence.push({ file: r, expr: '(empty string)', severity: 'high' })
      continue
    }
    if (
      /^(true|false)$/.test(expr) ||
      expr.includes('=>') ||
      expr.startsWith('()') ||
      expr.includes('?') ||
      expr.includes('&&') ||
      expr.includes('||') ||
      expr.includes('=') ||
      expr.startsWith('$') ||
      expr.startsWith('router.') ||
      expr.startsWith('emit(') ||
      expr.startsWith('console.')
    ) {
      continue
    }
    const name = expr.replace(/\(.*\)$/, '').split('.')[0].trim()
    if (!name) continue
    if (!defined.has(name)) {
      // high confidence only for simple call forms
      if (/^[A-Za-z_$][\w$]*(\([^)]*\))?$/.test(expr)) {
        findings.missingHandlersHighConfidence.push({
          file: r,
          expr,
          name,
          severity: 'medium',
        })
      }
    }
  }

  // router.push static strings only
  for (const m of src.matchAll(/(?:router|\$router)\.push\(\s*['"`]([^'"`$]+)['"`]/g)) {
    const p = m[1]
    if (p.includes('${')) {
      findings.stats.dynamicRouterPushes += 1
      continue
    }
    findings.stats.staticRouterPushes += 1
    const resolved = matchRoute(p)
    if (!resolved.ok) findings.deadRouterPush.push({ file: r, path: p })
  }
  for (const m of src.matchAll(/(?:router|\$router)\.push\(\s*\{\s*path:\s*['"`]([^'"`$]+)['"`]/g)) {
    const p = m[1]
    if (p.includes('${')) {
      findings.stats.dynamicRouterPushes += 1
      continue
    }
    findings.stats.staticRouterPushes += 1
    const resolved = matchRoute(p)
    if (!resolved.ok) findings.deadRouterPush.push({ file: r, path: p })
  }

  // action column buttons that look like they only open dialog without any api.* in file
  // heuristic: file has 操作 column + el-button but almost no api calls
  if (/label=["']操作["']/.test(src)) {
    const apiCalls = (src.match(/\b\w+Api\.\w+\s*\(/g) || []).length
    const axiosCalls = (src.match(/\bapi\.\w+\s*\(/g) || []).length
    const fetchLike = (src.match(/\b(?:get|post|put|patch|delete)\w*\s*\(/gi) || []).length
    if (apiCalls + axiosCalls < 1 && fetchLike < 3 && (src.match(/<el-button/g) || []).length >= 2) {
      // could be pure navigation page
      if (!/router\.push|\$router\.push/.test(src)) {
        findings.actionWithoutApiHint.push({ file: r, buttons: (src.match(/<el-button/g) || []).length })
      }
    }
  }
}

// module stats
const byModule = {}
for (const f of viewFiles) {
  const r = rel(f)
  const parts = r.split('/')
  const mod = parts[0] === 'views' ? parts[1] : parts[0]
  const key = mod || 'root'
  if (!byModule[key]) byModule[key] = { files: 0, buttons: 0, actionCols: 0 }
  byModule[key].files += 1
  const t = read(f)
  byModule[key].buttons += (t.match(/<el-button\b/g) || []).length
  if (/label=["']操作["']/.test(t)) byModule[key].actionCols += 1
}

// Score: only high severity empties + real dead links + fake text
const highEmpty = findings.emptyHandlers.filter((x) => x.severity === 'high')
const issueWeight =
  findings.fakeText.length * 5 +
  highEmpty.length * 4 +
  findings.deadRouterPush.length * 3 +
  Math.min(findings.missingHandlersHighConfidence.length, 15) * 1
const score = Math.max(0, Math.min(100, 95 - issueWeight))

const report = {
  generatedAt: new Date().toISOString(),
  stats: { ...findings.stats, byModule },
  issues: {
    fakeText: findings.fakeText,
    emptyHandlers: findings.emptyHandlers,
    highEmptyHandlers: highEmpty,
    missingHandlersHighConfidence: findings.missingHandlersHighConfidence,
    deadRouterPush: findings.deadRouterPush,
    actionWithoutApiHint: findings.actionWithoutApiHint,
  },
  verdict: {
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B+' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D',
    summary:
      findings.fakeText.length === 0 &&
      highEmpty.length === 0 &&
      findings.deadRouterPush.length === 0
        ? '静态扫描未见成规模假按钮/死链；操作按钮整体有效'
        : '存在需复核的死链或空处理，详见 issues',
  },
  sampleRoutes: [...routePaths].filter((p) => p.includes('finance') || p.includes('purchase')).slice(0, 30),
}

const outJson = path.join(__dirname, 'audit-action-buttons-report.json')
fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8')

console.log('=== Frontend Action Button Audit v2 ===')
console.log(JSON.stringify(report.stats, null, 2))
console.log('\nverdict:', report.verdict)
console.log('fakeText:', report.issues.fakeText.length)
console.log('emptyHandlers total/high:', report.issues.emptyHandlers.length, report.issues.highEmptyHandlers.length)
console.log('missingHandlers (after composable fix):', report.issues.missingHandlersHighConfidence.length)
console.log('deadRouterPush:', report.issues.deadRouterPush.length)
console.log('actionWithoutApiHint:', report.issues.actionWithoutApiHint.length)

if (report.issues.highEmptyHandlers.length) {
  console.log('\n--- high empty handlers ---')
  report.issues.highEmptyHandlers.forEach((x) => console.log(x.file, x.name))
}
if (report.issues.deadRouterPush.length) {
  console.log('\n--- dead router.push ---')
  report.issues.deadRouterPush.forEach((x) => console.log(x.file, '→', x.path))
}
if (report.issues.missingHandlersHighConfidence.length) {
  console.log('\n--- missing handlers ---')
  report.issues.missingHandlersHighConfidence.slice(0, 40).forEach((x) =>
    console.log(x.file, x.expr)
  )
}
if (report.issues.actionWithoutApiHint.length) {
  console.log('\n--- action col w/o api hint ---')
  report.issues.actionWithoutApiHint.forEach((x) => console.log(x.file, 'buttons=', x.buttons))
}

console.log('\nReport:', outJson)
