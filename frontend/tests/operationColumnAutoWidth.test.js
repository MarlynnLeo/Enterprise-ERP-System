import { afterEach, describe, expect, test, vi } from 'vitest'
import * as operationColumnAutoWidth from '../src/plugins/operationColumnAutoWidth.js'

const tableMarkup = `
  <div class="el-table">
    <table>
      <colgroup><col name="el-table_1_column_1"></colgroup>
      <tbody><tr>
        <td class="el-table__cell operation-column el-table_1_column_1">
          <div class="cell"><div class="table-actions">
            <button class="el-button">编辑</button>
            <button class="el-button">删除</button>
          </div></div>
        </td>
      </tr></tbody>
    </table>
  </div>
`

describe('operationColumnAutoWidth', () => {
  let originalOffsetWidth
  let originalOffsetHeight
  let originalScrollWidth

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.useRealTimers()
    if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
    if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
    if (originalScrollWidth) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidth)
  })

  test('measures an explicitly supplied root on demand', async () => {
    document.body.innerHTML = tableMarkup
    vi.stubGlobal('requestAnimationFrame', (callback) => setTimeout(callback, 0))
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id))

    originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth')
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 80 })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 24 })
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 80 })

    operationColumnAutoWidth.triggerOperationColumnAutoWidth(document.body)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(document.querySelector('col').getAttribute('width')).toBe('84')
    expect(document.querySelector('[data-erp-operation-measure-probe]')).toBeNull()
  })

  test('coalesces repeated requests without installing observers', async () => {
    document.body.innerHTML = tableMarkup
    vi.stubGlobal('requestAnimationFrame', (callback) => setTimeout(callback, 0))
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id))
    const requestAnimationFrame = vi.fn(window.requestAnimationFrame)
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)

    originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth')
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 50 })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 24 })
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 50 })

    operationColumnAutoWidth.triggerOperationColumnAutoWidth(document.body)
    operationColumnAutoWidth.triggerOperationColumnAutoWidth(document.body)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(document.querySelector('col').getAttribute('width')).toBe('72')
  })
})
