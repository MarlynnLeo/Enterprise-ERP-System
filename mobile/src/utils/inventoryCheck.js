export function checkQuantity(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null
  const quantity = Number(value)
  return Number.isFinite(quantity) ? quantity : null
}

export function checkItemDifference(item) {
  const actual = checkQuantity(item.actualQuantity)
  const book = checkQuantity(item.bookQuantity)
  return actual === null || actual < 0 || book === null ? null : actual - book
}

export function buildCheckResultItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('请先添加盘点物料并录入实盘数量')
  return items.map((item, index) => {
    const actualQuantity = checkQuantity(item.actualQuantity)
    if (actualQuantity === null || actualQuantity < 0) {
      throw new Error(`第${index + 1}项实盘数量必须为有效的非负数，请先编辑盘点单`)
    }
    if (checkQuantity(item.bookQuantity) === null) {
      throw new Error(`第${index + 1}项账面数量无效，请重新加载盘点单`)
    }
    return {
      id: item.id,
      materialId: item.materialId,
      actualQuantity,
      remarks: item.remarks || ''
    }
  })
}
