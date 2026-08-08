import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

describe('axiosInstance shared refresh state', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/services/axiosInstance.js'), 'utf8')

  test('api and fastApi share one isRefreshing lock', () => {
    expect(source).toContain('sharedIsRefreshing')
    expect(source).toContain('sharedFailedQueue')
    // 禁止 setupInterceptors 闭包内各自维护 isRefreshing
    expect(source).not.toMatch(/const setupInterceptors[\s\S]*?let isRefreshing\s*=\s*false/)
    // 刷新统一走 api 实例
    expect(source).toMatch(/await api\.post\('\/auth\/refresh'\)/)
  })
})
