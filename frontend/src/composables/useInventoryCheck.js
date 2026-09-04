/**
 * useInventoryCheck.js
 * @description 库存检查公共组合式函数
 * 从 useOrderForm.js 和 useOrderActions.js 中抽取的重复逻辑
 */
import { ElMessage } from 'element-plus/es/components/message/index'
import { inventoryApi } from '@/api'

/**
 * 库存充足性检查
 * @param {Array} items - 物料项数组，每项需包含 materialId, quantity（HTTP camel SSOT）
 * @returns {Array} 库存不足的物料列表
 */
export async function checkInventory(items) {
  if (!Array.isArray(items) || items.length === 0) return []

  const materialItems = items.filter(item => {
    const materialId = parseInt(item.materialId, 10)
    if (!Number.isInteger(materialId) || materialId <= 0) return false
    const quantity = parseFloat(item.quantity)
    if (isNaN(quantity) || quantity <= 0) return false
    return true
  })

  if (materialItems.length === 0) return []

  try {
    const requirements = materialItems.map(item => ({
      materialId: parseInt(item.materialId, 10),
      quantity: parseFloat(item.quantity),
      materialCode: item.materialCode || item.code || '',
      materialName: item.materialName || item.name || '未知物料'
    }))
    const response = await inventoryApi.checkStockSufficiency(requirements)
    return response.data || []
  } catch (error) {
    console.error('❌ 检查库存时出错:', error)
    ElMessage.error(`检查库存失败: ${error.message || '网络错误'}`)
    return []
  }
}

export function useInventoryCheck() {
  return { checkInventory }
}
