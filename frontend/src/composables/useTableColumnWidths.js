import { shallowReactive, watch } from 'vue'
import { registerTableWidthController } from '@/plugins/operationColumnAutoWidth'

/** Bind measured columns to Element Plus width props using their stable column keys. */
export function useTableColumnWidths(tableRef, initialWidths) {
  const widths = shallowReactive({ ...initialWidths })

  watch(tableRef, (table, _previous, onCleanup) => {
    if (!table?.$el?.matches?.('.el-table')) return

    onCleanup(registerTableWidthController(table.$el, (measured) => {
      for (const column of table.columns) {
        const key = column.columnKey
        const width = measured.get(column.id)
        if (Object.hasOwn(widths, key) && Number.isFinite(width) && width > 0 && widths[key] !== width) {
          widths[key] = width
        }
      }
    }))
  }, { flush: 'post' })

  return widths
}
