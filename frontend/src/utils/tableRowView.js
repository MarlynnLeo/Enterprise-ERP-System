export function isOperationRowClick(column, event) {
  if (column?.className?.includes('operation-column')) return true
  const target = event?.target
  if (!target?.closest) return false
  return Boolean(
    target.closest(
      '.table-actions, .el-button, .el-popper, .el-popconfirm, .el-dropdown, .el-checkbox, .el-switch, .el-link, .el-pagination, .el-tag, a'
    )
  )
}

export function handleTableRowView(row, column, event, action) {
  if (isOperationRowClick(column, event)) return
  if (typeof action === 'function') action(row)
}
