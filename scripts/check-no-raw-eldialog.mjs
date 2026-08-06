#!/usr/bin/env node
/**
 * CI guard: business UI must use AppDialog, not bare <el-dialog>.
 *
 * Allowed:
 *   - frontend/src/components/ui/AppDialog.vue (唯一 el-dialog 壳)
 *
 * Banned:
 *   - frontend/src/views/**
 *   - frontend/src/components/** (except AppDialog.vue)
 *   - mobile/src/views/** (if present)
 *
 * Usage: node scripts/check-no-raw-eldialog.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const SCAN_DIRS = [
  'frontend/src/views',
  'frontend/src/components',
  'mobile/src/views',
  'mobile/src/components',
]

const ALLOW_FILES = new Set([
  path.normalize('frontend/src/components/ui/AppDialog.vue'),
])

const EXT = new Set(['.vue'])

function walk(dir, files = []) {
  const abs = path.join(root, dir)
  if (!fs.existsSync(abs)) return files
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, ent.name)
    const absPath = path.join(root, rel)
    if (ent.isDirectory()) walk(rel, files)
    else if (EXT.has(path.extname(ent.name))) files.push(rel)
  }
  return files
}

const hits = []
for (const dir of SCAN_DIRS) {
  for (const rel of walk(dir)) {
    const norm = path.normalize(rel).replace(/\\/g, '/')
    if (ALLOW_FILES.has(path.normalize(rel)) || ALLOW_FILES.has(norm)) continue
    // also allow by endsWith
    if (norm.endsWith('components/ui/AppDialog.vue')) continue

    const content = fs.readFileSync(path.join(root, rel), 'utf8')
    const re = /<el-dialog\b/g
    let m
    while ((m = re.exec(content))) {
      const line = content.slice(0, m.index).split(/\r?\n/).length
      hits.push({ file: norm, line })
    }
  }
}

if (hits.length) {
  console.error('❌ 发现裸 <el-dialog>（请改用 AppDialog）:\n')
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}`)
  }
  console.error(`\n共 ${hits.length} 处。白名单仅: frontend/src/components/ui/AppDialog.vue`)
  process.exit(1)
}

console.log('✅ check-no-raw-eldialog: 无裸 el-dialog')
