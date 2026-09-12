// @vitest-environment node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { optimizeDeps, resolveConfig } from 'vite'

const require = createRequire(import.meta.url)
const frontendRoot = fileURLToPath(new URL('..', import.meta.url))

describe('development date-picker dependencies', () => {
  test('prebundles every CommonJS Day.js plugin imported by the installed Element Plus', async () => {
    const elementRoot = path.join(path.dirname(require.resolve('element-plus/package.json')), 'es')
    const requiredPlugins = new Set()
    for (const name of await fs.readdir(elementRoot, { recursive: true })) {
      if (!name.endsWith('.mjs')) continue
      const source = await fs.readFile(path.join(elementRoot, name), 'utf8')
      for (const match of source.matchAll(/from ["'](dayjs\/plugin\/[^"']+)["']/g)) {
        requiredPlugins.add(match[1])
      }
    }
    expect(requiredPlugins.size).toBeGreaterThan(0)

    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'erp-date-deps-'))
    try {
      const config = await resolveConfig({
        root: frontendRoot,
        configFile: path.join(frontendRoot, 'vite.config.mjs'),
        cacheDir,
        logLevel: 'silent',
        optimizeDeps: { noDiscovery: true, entries: [] }
      }, 'serve', 'development')
      // Exercise Vite's actual glob expansion and CommonJS conversion without
      // rebuilding unrelated Excel/chart packages or touching the dev cache.
      config.optimizeDeps.include = config.optimizeDeps.include.filter((id) => id === 'dayjs' || id.startsWith('dayjs/'))
      const metadata = await optimizeDeps(config, true)
      const missing = [...requiredPlugins].filter((id) => !metadata.optimized[id])
      expect(missing, 'These date-picker imports would be served as raw CommonJS and abort route navigation').toEqual([])
      for (const id of requiredPlugins) {
        const optimized = await fs.readFile(metadata.optimized[id].file, 'utf8')
        expect(optimized, id).toMatch(/export\s+(?:default\b|\{[^}]*\bas\s+default\b)/)
      }
    } finally {
      const resolved = path.resolve(cacheDir)
      if (!resolved.startsWith(path.join(path.resolve(os.tmpdir()), 'erp-date-deps-'))) {
        throw new Error('Unexpected dependency test cache directory')
      }
      await fs.rm(resolved, { recursive: true, force: true })
    }
  }, 30000)
})
