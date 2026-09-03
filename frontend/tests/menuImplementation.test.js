import { describe, expect, test } from 'vitest'
import { validateMenuBuild, validateMenuSource } from '../scripts/validate-menu-implementation.mjs'

describe('menu implementation guard', () => {
  test('accepts the native recursive menu', () => {
    const result = validateMenuSource({
      sidebarMenu: '<ul class="app-menu-list"><li>Menu</li></ul>',
      layout: '<sidebar-menu />'
    })

    expect(result).toEqual({ valid: true, errors: [] })
  })

  test('rejects the legacy Element Plus menu implementation', () => {
    const result = validateMenuSource({
      sidebarMenu: '<el-sub-menu :index="index"><el-menu-item /></el-sub-menu>',
      layout: '<el-menu :default-openeds="open" :collapse-transition="false" />'
    })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(5)
  })

  test('rejects a missing build directory', () => {
    const result = validateMenuBuild('missing-menu-build-for-test')

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('Build directory does not exist')
  })
})
