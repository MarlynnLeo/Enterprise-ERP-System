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
  let plugin
  let appendCount
  let originalAppendChild
  let originalOffsetWidth
  let originalOffsetHeight
  let originalScrollWidth

  afterEach(() => {
    plugin?.destroyOperationColumnAutoWidth()
    plugin = null
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.useRealTimers()
    if (originalAppendChild) Node.prototype.appendChild = originalAppendChild
    if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
    if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
    if (originalScrollWidth) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidth)
  })

  test('ignores its own measurement probe mutations', async () => {
    document.body.innerHTML = tableMarkup
    vi.stubGlobal('requestAnimationFrame', (callback) => setTimeout(callback, 0))
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id))

    originalAppendChild = Node.prototype.appendChild
    appendCount = 0
    Node.prototype.appendChild = function patchedAppendChild(node) {
      if (node?.getAttribute?.('data-erp-operation-measure-probe') === 'true') {
        appendCount += 1
      }
      return originalAppendChild.call(this, node)
    }

    originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth')
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 80 })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 24 })
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 80 })

    plugin = operationColumnAutoWidth
    plugin.initOperationColumnAutoWidth(document.body)

    await new Promise((resolve) => setTimeout(resolve, 180))

    expect(appendCount).toBe(1)
    expect(document.querySelector('[data-erp-operation-measure-probe]')).toBeNull()
  })
})
