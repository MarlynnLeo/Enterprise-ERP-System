import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { startOperationColumnAutoWidth, destroyOperationColumnAutoWidth } from '../src/plugins/operationColumnAutoWidth.js'

const action = (label, width = 48) => '<button class="el-button" data-size="' + width + '" style="border:0">' + label + '</button>'
const row = (buttons = action('编辑') + action('删除')) => `
  <tr><td class="data-cell">普通数据</td>
  <td class="el-table__cell operation-column el-table_1_column_1">
    <div class="cell" style="padding:0 12px"><div class="table-actions" style="column-gap:6px">${buttons}</div></div>
  </td></tr>`
const table = (rows = row()) => `
  <div class="el-table"><table><colgroup><col name="el-table_1_column_1"></colgroup>
  <tbody>${rows}</tbody></table></div>`

describe('operation column measurement and isolation', () => {
  let resizeCallback
  let observed
  let unobserve
  let sequence

  const flush = async () => {
    await Promise.resolve()
    await vi.runOnlyPendingTimersAsync()
    await Promise.resolve()
    await vi.runOnlyPendingTimersAsync()
  }
  const columnWidth = () => document.querySelector('col').getAttribute('width')

  beforeEach(() => {
    vi.useFakeTimers()
    observed = new Set()
    unobserve = vi.fn((target) => observed.delete(target))
    sequence = []
    vi.stubGlobal('requestAnimationFrame', (callback) => setTimeout(callback, 0))
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id))
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { resizeCallback = callback }
      observe(target) { observed.add(target) }
      unobserve = unobserve
      disconnect() { observed.clear() }
    })
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () {
      let node = this
      while (node) {
        if (node.hidden || node.style?.display === 'none') return []
        node = node.parentElement
      }
      return [{ width: 400, height: 24 }]
    })
    for (const property of ['offsetWidth', 'scrollWidth']) {
      vi.spyOn(HTMLElement.prototype, property, 'get').mockImplementation(function () {
        if (this.matches('.el-button, .el-link, .el-dropdown')) sequence.push('read')
        return Number(this.getAttribute('data-size') || 48)
      })
    }
    const originalSetProperty = CSSStyleDeclaration.prototype.setProperty
    vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty').mockImplementation(function (key, value, priority) {
      if (['width', 'min-width', 'max-width'].includes(key) && priority === 'important') sequence.push('write')
      return originalSetProperty.call(this, key, value, priority)
    })
    // jsdom does not perform layout; supply actual text-width reads only.
    vi.stubGlobal('Range', Range)
    Range.prototype.getBoundingClientRect = function () { return { width: this.toString().trim().length * 14 } }
  })

  afterEach(() => {
    destroyOperationColumnAutoWidth()
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-theme')
    delete Range.prototype.getBoundingClientRect
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  test('reads a dense table before writing widths without inserting measurement probes', async () => {
    document.body.innerHTML = table(Array.from({ length: 100 }, () => row()).join(''))
    const append = vi.spyOn(document.body, 'appendChild')
    startOperationColumnAutoWidth()
    await flush()

    expect(columnWidth()).toBe('130')
    expect(append).not.toHaveBeenCalled()
    expect(sequence.filter((item) => item === 'read')).toHaveLength(400)
    expect(sequence.slice(sequence.indexOf('write'))).not.toContain('read')
  })

  test('updates when row actions are added, hidden, removed or relabelled', async () => {
    document.body.innerHTML = table()
    startOperationColumnAutoWidth()
    await flush()
    const actions = document.querySelector('.table-actions')
    actions.insertAdjacentHTML('beforeend', action('下推', 70))
    await flush()
    expect(columnWidth()).toBe('206')

    actions.lastElementChild.style.display = 'none'
    await flush()
    expect(columnWidth()).toBe('130')

    actions.lastElementChild.remove()
    actions.firstElementChild.dataset.size = '80'
    actions.firstElementChild.firstChild.data = '编辑明细'
    await flush()
    expect(columnWidth()).toBe('162')
  })

  test('ignores navigation, ordinary data cells and no-op width writes', async () => {
    document.body.innerHTML = '<nav></nav>' + table()
    startOperationColumnAutoWidth()
    await flush()
    sequence.length = 0
    document.querySelector('nav').innerHTML = '<button class="el-button">菜单</button>'
    document.querySelector('.data-cell').textContent = '更新数量'
    document.querySelector('.el-button').classList.add('active')
    await flush()
    expect(sequence).toEqual([])
  })

  test('does not subscribe to document-wide attribute changes', async () => {
    const Observer = MutationObserver
    const registrations = []
    vi.stubGlobal('MutationObserver', class extends Observer {
      observe(target, options) {
        registrations.push({ target, options })
        super.observe(target, options)
      }
    })
    document.body.innerHTML = table()
    startOperationColumnAutoWidth()
    await flush()
    expect(registrations.find(({ target }) => target === document.body).options).toEqual({ subtree: true, childList: true })
    expect(registrations.some(({ target, options }) => target === document.documentElement && options.subtree)).toBe(false)
  })

  test('restores Element Plus col widths after sidebar resizing without remeasuring rows', async () => {
    document.body.innerHTML = table()
    startOperationColumnAutoWidth()
    await flush()
    sequence.length = 0
    resizeCallback([{ target: document.querySelector('.el-table'), contentRect: { width: 800, height: 300 } }])
    document.querySelector('col').setAttribute('width', '400')
    await flush()

    expect(columnWidth()).toBe('130')
    expect(sequence).not.toContain('read')
  })

  test('ignores Element Plus scrolling and layout classes but responds to a table style change', async () => {
    document.body.innerHTML = table()
    startOperationColumnAutoWidth()
    await flush()
    sequence.length = 0
    const element = document.querySelector('.el-table')
    element.classList.add('is-scrolling-middle', 'el-table--scrollable-x')
    await flush()
    expect(sequence).toEqual([])
    element.classList.add('compact-actions')
    await flush()
    expect(sequence).toContain('read')
  })

  test('counts a dropdown only once and excludes actions inside hidden wrappers', async () => {
    document.body.innerHTML = table(row(
      '<div class="el-dropdown" data-size="64" style="border:0">' + action('更多') + '</div>' +
      '<span hidden>' + action('隐藏的长操作', 180) + '</span>'
    ))
    startOperationColumnAutoWidth()
    await flush()
    expect(columnWidth()).toBe('92')
  })

  test('registers newly mounted tables and releases observers on unmount', async () => {
    startOperationColumnAutoWidth()
    document.body.innerHTML = table()
    await flush()
    const element = document.querySelector('.el-table')
    expect(observed.has(element)).toBe(true)
    element.remove()
    await flush()
    expect(unobserve).toHaveBeenCalledWith(element)
    expect(observed.size).toBe(0)
  })

  test('measures a previously hidden table and invalidates widths after a theme change', async () => {
    document.body.innerHTML = '<section hidden>' + table() + '</section>'
    startOperationColumnAutoWidth()
    await flush()
    expect(columnWidth()).toBeNull()
    document.querySelector('section').hidden = false
    resizeCallback([{ target: document.querySelector('.el-table'), contentRect: { width: 800, height: 300 } }])
    await flush()
    expect(columnWidth()).toBe('130')

    document.querySelector('.el-button').dataset.size = '60'
    document.documentElement.setAttribute('data-theme', 'dark')
    await flush()
    expect(columnWidth()).toBe('142')
  })

  test('keeps header text visible and caps unusually wide action sets', async () => {
    document.body.innerHTML = table(row(action('很长的操作', 700)))
    startOperationColumnAutoWidth()
    await flush()
    expect(columnWidth()).toBe('500')
  })
})
