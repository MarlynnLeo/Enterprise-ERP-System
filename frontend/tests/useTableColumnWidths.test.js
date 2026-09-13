import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { useTableColumnWidths } from '@/composables/useTableColumnWidths'

const register = vi.hoisted(() => vi.fn())
vi.mock('@/plugins/operationColumnAutoWidth', () => ({ registerTableWidthController: register }))

let scope
let tableRef
let widths
let releases

const makeTable = () => {
  const element = document.createElement('div')
  element.className = 'el-table'
  return {
    $el: element,
    columns: [
      { id: 'status-column', columnKey: 'status' },
      { id: 'type-column', columnKey: 'type' },
      { id: 'actions-column', columnKey: 'operations' },
      { id: 'date-column', columnKey: 'date' },
    ],
  }
}

beforeEach(() => {
  register.mockReset()
  releases = []
  register.mockImplementation(() => {
    const release = vi.fn()
    releases.push(release)
    return release
  })
  tableRef = shallowRef(null)
  scope = effectScope()
  scope.run(() => {
    widths = useTableColumnWidths(tableRef, { status: undefined, type: undefined, operations: 420 })
  })
})

afterEach(() => scope.stop())

describe('Vue-owned table column widths', () => {
  test('maps measured widths to declared column keys without modifying rendered elements', async () => {
    tableRef.value = makeTable()
    await nextTick()
    const measure = register.mock.lastCall[1]
    measure(new Map([['status-column', 91], ['type-column', 95], ['actions-column', 286], ['date-column', 100]]))

    expect({ ...widths }).toEqual({ status: 91, type: 95, operations: 286 })
    expect(tableRef.value.$el.getAttribute('style')).toBeNull()
    expect(tableRef.value.$el.getAttributeNames()).toEqual(['class'])

    measure(new Map([['status-column', NaN], ['type-column', -1]]))
    expect({ ...widths }).toEqual({ status: 91, type: 95, operations: 286 })
  })

  test('releases the previous owner when the table is replaced and when the scope ends', async () => {
    tableRef.value = makeTable()
    await nextTick()
    tableRef.value = makeTable()
    await nextTick()
    expect(releases[0]).toHaveBeenCalledTimes(1)
    expect(releases[1]).not.toHaveBeenCalled()

    scope.stop()
    expect(releases[1]).toHaveBeenCalledTimes(1)
  })
})
