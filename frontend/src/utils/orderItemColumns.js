export const restoreOrderItemColumns = (defaultColumns, savedKeys) => {
  const defaultsByKey = new Map(defaultColumns.map((column) => [column.key, column]))
  if (!Array.isArray(savedKeys)) return [...defaultColumns]
  const validKeys = [...new Set(savedKeys)].filter((key) => defaultsByKey.has(key) && key !== 'operations')
  const missingColumns = defaultColumns.filter((column) => !validKeys.includes(column.key) && column.key !== 'operations')
  return [...validKeys.map((key) => defaultsByKey.get(key)), ...missingColumns, defaultsByKey.get('operations')]
}

export const moveOrderItemColumn = (columns, sourceKey, targetKey) => {
  if (!sourceKey || sourceKey === targetKey || sourceKey === 'operations' || targetKey === 'operations') return columns
  const sourceIndex = columns.findIndex((column) => column.key === sourceKey)
  const targetIndex = columns.findIndex((column) => column.key === targetKey)
  if (sourceIndex < 0 || targetIndex < 0) return columns
  const nextColumns = [...columns]
  const [movedColumn] = nextColumns.splice(sourceIndex, 1)
  // Dropping on a neighbor must move in either direction. Keep the original
  // target position when inserting after removing the source column.
  nextColumns.splice(targetIndex, 0, movedColumn)
  return nextColumns
}
