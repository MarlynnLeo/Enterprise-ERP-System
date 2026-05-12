/**
 * 检验项验证工具
 * @description 验证检验项的重复性和完整性
 */

/**
 * 验证检验项是否重复
 * @param {Array} items - 检验项数组
 * @returns {Object} 验证结果 { valid: boolean, type: string, items: Array }
 */
export const validateDuplicateItems = (items) => {
  if (!items || items.length === 0) {
    return { valid: true }
  }

  const itemNameMap = new Map()
  const duplicateItems = []
  const similarItems = []

  // 第一轮：检查检验项目名称是否完全重复
  for (const item of items) {
    const itemName = item.item_name.trim()
    if (itemNameMap.has(itemName)) {
      duplicateItems.push(itemName)
    } else {
      itemNameMap.set(itemName, item)
    }
  }

  // 如果发现完全重复的项目名称，直接返回
  if (duplicateItems.length > 0) {
    return {
      valid: false,
      type: 'duplicate',
      items: [...new Set(duplicateItems)],
      message: '模板中存在重复的检验项目名称'
    }
  }

  // 第二轮：检查相似项（基础名称相同，仅数字后缀不同）
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const item1 = items[i]
      const item2 = items[j]

      // 移除数字后缀后的基础名称
      const baseName1 = item1.item_name.replace(/\d+$/, '').trim()
      const baseName2 = item2.item_name.replace(/\d+$/, '').trim()

      // 如果基础名称相同，且检验标准和类型也相同
      // 这种情况可能是用户复制了同一个项目只修改了数字后缀
      if (baseName1 && baseName2 &&
          baseName1 === baseName2 &&
          item1.standard === item2.standard &&
          item1.type === item2.type &&
          item1.item_name !== item2.item_name) {
        if (!similarItems.includes(item1.item_name)) {
          similarItems.push(item1.item_name)
        }
        if (!similarItems.includes(item2.item_name)) {
          similarItems.push(item2.item_name)
        }
      }
    }
  }

  // 如果存在相似项（可能是复制粘贴后只改了数字）
  if (similarItems.length > 0) {
    return {
      valid: false,
      type: 'similar',
      items: similarItems,
      message: '模板中存在相似的检验项，建议修改为更具描述性的名称'
    }
  }

  return { valid: true }
}

/**
 * 验证检验项是否完整
 * @param {Array} items - 检验项数组
 * @returns {Object} 验证结果 { valid: boolean, message: string }
 */
export const validateItemsCompleteness = (items) => {
  if (!items || items.length === 0) {
    return {
      valid: false,
      message: '请至少添加一个检验项目'
    }
  }

  // 检查是否所有项都填写了基本信息
  const incompleteItems = items.filter(item =>
    !item.item_name || !item.standard || !item.type
  )

  if (incompleteItems.length > 0) {
    return {
      valid: false,
      message: '请完整填写所有检验项目信息（项目名称、检验标准、检验类型）'
    }
  }

  // 检查尺寸类型的检验项是否填写了标准尺寸
  const dimensionItems = items.filter(item => item.type === 'dimension')
  const invalidDimensionItems = dimensionItems.filter(item =>
    item.dimension_value === undefined ||
    item.dimension_value === null ||
    item.dimension_value === ''
  )

  if (invalidDimensionItems.length > 0) {
    return {
      valid: false,
      message: '尺寸类型的检验项必须填写标准尺寸值'
    }
  }

  return { valid: true }
}

/**
 * 综合验证检验项
 * @param {Array} items - 检验项数组
 * @returns {Object} 验证结果 { valid: boolean, type: string, message: string, items: Array }
 */
export const validateInspectionItems = (items) => {
  // 先检查完整性
  const completenessResult = validateItemsCompleteness(items)
  if (!completenessResult.valid) {
    return {
      ...completenessResult,
      type: 'incomplete'
    }
  }

  // 再检查重复性
  const duplicateResult = validateDuplicateItems(items)
  if (!duplicateResult.valid) {
    return duplicateResult
  }

  return { valid: true }
}

/**
 * 规范化布尔值
 * @param {any} value - 需要规范化的值
 * @returns {boolean} 规范化后的布尔值
 */
export const normalizeBoolean = (value) => {
  return value === true || value === 1 || value === '1' || value === 'true'
}

/**
 * 判断是否为通用模板
 * @param {Object} template - 模板对象
 * @returns {boolean} 是否为通用模板
 */
export const isGeneralTemplate = (template) => {
  if (!template) return false

  // 显式设置为通用
  if (normalizeBoolean(template.is_general)) {
    return true
  }

  // 没有关联物料也视为通用
  if (!template.material_type &&
      (!template.material_types || template.material_types.length === 0)) {
    return true
  }

  return false
}

