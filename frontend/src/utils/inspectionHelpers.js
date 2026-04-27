/**
 * 检验单相关的公共辅助函数
 * 用于减少来料检验、过程检验、成品检验等页面的代码重复
 */

import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import axios from 'axios'
import { api, qualityApi, purchaseApi, baseDataApi } from '@/services/api'
import { parseApiResponse, parseListData } from '@/utils/responseParser'
import logger from '@/utils/logger'
import { tokenManager } from '@/utils/unifiedStorage'

/**
 * 从检验单获取或补全供应商信息
 * @param {Object} inspection - 检验单对象
 * @returns {Promise<Object>} 包含供应商信息的检验单对象
 */
export async function ensureSupplierInfo(inspection) {
  // 如果已有供应商ID,直接返回
  if (inspection.supplier_id) {
    return inspection
  }
  
  // 尝试通过采购订单ID获取供应商信息
  if (inspection.reference_id) {
    try {
      const orderResponse = await purchaseApi.getOrder(inspection.reference_id)
      if (orderResponse.data?.supplier_id) {
        inspection.supplier_id = Number(orderResponse.data.supplier_id)
        inspection.supplier_name = orderResponse.data.supplier_name || inspection.supplier_name
        return inspection
      }
    } catch (err) {
      console.error('通过采购订单ID获取供应商失败:', err)
    }
  }
  
  // 尝试通过采购订单号查询供应商信息
  if (!inspection.supplier_id && inspection.reference_no) {
    try {
      const ordersResponse = await purchaseApi.getOrders({
        orderNo: inspection.reference_no,
        pageSize: 1
      })

      // 使用统一解析器
      const orders = parseListData(ordersResponse, { enableLog: false })
      if (orders.length > 0) {
        const order = orders[0]
        if (order.supplier_id) {
          inspection.supplier_id = Number(order.supplier_id)
          inspection.supplier_name = order.supplier_name || inspection.supplier_name
          return inspection
        }
      }
    } catch (err) {
      console.error('通过订单号查询供应商失败:', err)
    }
  }
  
  // 如果所有尝试都失败,使用默认供应商
  if (!inspection.supplier_id) {
    inspection.supplier_id = 1
    inspection.supplier_name = inspection.supplier_name || '默认供应商'
  }
  
  return inspection
}

/**
 * 从检验单创建采购入库单
 * @param {Object} inspection - 检验单对象
 * @param {Object} authStore - 认证store
 * @param {boolean} isReview - 是否为复检
 * @returns {Promise<Object>} API响应
 */
export async function createReceiptFromInspection(inspection, authStore, isReview = false) {
  // 确保有供应商信息
  await ensureSupplierInfo(inspection)
  
  if (!inspection.supplier_id) {
    throw new Error('检验单缺少供应商信息，无法创建入库单')
  }
  
  // 获取物料的默认库位
  let warehouseId = 2  // 默认使用零部件仓库ID
  let warehouseName = '零部件仓库'

  if (inspection.material_id) {
    try {
      const materialResponse = await baseDataApi.getMaterial(inspection.material_id)
      if (materialResponse.data?.location_id) {
        warehouseId = Number(materialResponse.data.location_id)
        warehouseName = materialResponse.data.location_name || '零部件仓库'
      }
    } catch (error) {
      logger.error('获取物料库位信息失败:', error)
    }
  }

  // 获取采购订单ID
  let orderId = Number(inspection.reference_id || 0)

  // 如果reference_id为空，尝试通过reference_no查询采购订单ID
  if (!orderId && inspection.reference_no) {
    try {
      const orderResponse = await purchaseApi.getOrder(inspection.reference_no)
      if (orderResponse.data) {
        orderId = Number(orderResponse.data.id || 0)
      }
    } catch (error) {
      logger.error('查询采购订单ID失败:', error)
    }
  }

  // 构造入库单数据
  const receiptData = {
    // 订单信息
    orderId: orderId,
    // 供应商信息
    supplierId: Number(inspection.supplier_id),
    supplierName: inspection.supplier_name,
    // 仓库信息
    warehouseId: warehouseId,
    warehouseName: warehouseName,
    // 日期和备注
    receiptDate: dayjs().format('YYYY-MM-DD'),
    note: isReview 
      ? `来自检验单 ${inspection.inspection_no} 的复检自动入库`
      : `来自检验单 ${inspection.inspection_no} 的自动入库`,
    // 状态信息
    status: 'draft',
    // 来源信息
    fromInspection: true,
    inspectionId: Number(inspection.id),
    // 操作人
    operator: authStore.user?.real_name || '系统',
    receiver: authStore.user?.real_name || '系统',
    // 物料明细
    items: [{
      materialId: Number(inspection.material_id || 0),
      materialCode: inspection.product_code || inspection.material_code || '',
      materialName: inspection.product_name || inspection.material_name || '',
      specification: inspection.specification || inspection.specs || '',
      unitId: Number(inspection.unit_id || 1),
      unit: inspection.unit || '',
      orderedQuantity: parseFloat(inspection.quantity || 0),
      // ✅ 使用合格数量而不是检验数量
      quantity: parseFloat(inspection.qualified_quantity || inspection.quantity || 0),
      receivedQuantity: parseFloat(inspection.qualified_quantity || inspection.quantity || 0),
      qualifiedQuantity: parseFloat(inspection.qualified_quantity || inspection.quantity || 0),
      price: parseFloat(inspection.price || 0),
      remarks: isReview
        ? `复检后自动入库：${inspection.note || ''}`
        : `自动入库：${inspection.note || ''}`,
      locationId: warehouseId,
      warehouseId: warehouseId,
      batchNo: inspection.batch_no || '',
      fromInspection: true
    }]
  }
  
  // 调用采购入库API
  const receiptResponse = await purchaseApi.createReceipt(receiptData)
  return receiptResponse
}

/**
 * 获取完整的检验单详情(包含检验项)
 * @param {number} id - 检验单ID
 * @param {Object} row - 列表行数据(可选,用于补充信息)
 * @param {Function} extractMaterialName - 物料名称提取函数
 * @param {Function} extractMaterialSpecs - 物料型号提取函数
 * @param {Function} extractSupplierName - 供应商名称提取函数
 * @returns {Promise<Object>} 完整的检验单数据
 */
export async function fetchInspectionDetailWithItems(
  id, 
  row = {}, 
  extractMaterialName, 
  extractMaterialSpecs, 
  extractSupplierName
) {
  // 获取检验单基本信息
  const response = await qualityApi.getIncomingInspection(id, {
    params: {
      with_details: true,
      include_supplier: true
    }
  })

  // 支持多种响应格式
  const respData = response?.data
  let inspectionData = null

  // ResponseHandler 格式: { success: true, data: {...} }
  if (respData?.data && typeof respData.data === 'object' && !Array.isArray(respData.data)) {
    inspectionData = respData.data
  }
  // 直接对象格式: { id: ..., inspection_no: ... }
  else if (respData?.id || respData?.inspection_no) {
    inspectionData = respData
  }

  if (!inspectionData) {
    throw new Error('获取检验单详情失败')
  }
  
  // 统一字段映射
  inspectionData = {
    ...inspectionData,
    inspectionNo: inspectionData.inspection_no || inspectionData.inspectionNo || row.inspectionNo || '',
    purchaseOrderNo: inspectionData.reference_no || inspectionData.purchaseOrderNo || row.purchaseOrderNo || '',
    batchNo: inspectionData.batch_no || inspectionData.batchNo || row.batchNo || '默认批次号',
    materialName: inspectionData.material_name || inspectionData.materialName || extractMaterialName(inspectionData),
    product_name: inspectionData.product_name || inspectionData.materialName || extractMaterialName(inspectionData),
    product_code: inspectionData.product_code || inspectionData.specs || extractMaterialSpecs(inspectionData),
    quantity: inspectionData.quantity || inspectionData.total_quantity || 0,
    unit: inspectionData.unit || '个',
    inspectionDate: inspectionData.actual_date || inspectionData.planned_date || inspectionData.inspectionDate,
    inspector: inspectionData.inspector_name || inspectionData.inspector
  }
  
  // 获取供应商信息
  let supplierName = inspectionData.supplier_name || inspectionData.supplierName || ''
  if ((!supplierName || supplierName === '-') && inspectionData.reference_id) {
    try {
      const poResponse = await purchaseApi.getOrder(inspectionData.reference_id)
      if (poResponse.data) {
        supplierName = poResponse.data.supplier_name || (poResponse.data.supplier?.name) || ''
      }
    } catch (error) {
      console.error('获取采购单信息失败:', error)
    }
  }
  inspectionData.supplierName = supplierName || extractSupplierName(inspectionData)
  
  // 获取检验项
  if (!inspectionData.items || inspectionData.items.length === 0) {
    try {
      const itemsResponse = await axios.get(
        `${api.defaults.baseURL}/quality/inspections/${id}/items`,
        {
          headers: { 'Authorization': `Bearer ${tokenManager.getToken()}` }
        }
      )
      const itemsResult = parseApiResponse(itemsResponse)

      if (itemsResult.success && itemsResult.data) {
        inspectionData.items = itemsResult.data
      }
    } catch (error) {
      console.error('获取检验项目失败:', error)
      // 创建默认检验项目
      inspectionData.items = [
        { 
          item_name: '外观检查', 
          standard: '无明显缺陷', 
          type: 'visual', 
          is_critical: true, 
          actual_value: '合格', 
          result: 'passed', 
          remarks: '检验合格' 
        },
        { 
          item_name: '数量检查', 
          standard: '与订单一致', 
          type: 'quantity', 
          is_critical: true, 
          actual_value: `${inspectionData.quantity || 0}${inspectionData.unit || ''}`, 
          result: 'passed', 
          remarks: '数量正确' 
        }
      ]
    }
  }
  
  // 标准化检验项数据
  if (inspectionData.items && inspectionData.items.length > 0) {
    inspectionData.items = inspectionData.items.map(item => ({
      ...item,
      item_name: item.item_name || item.name || '未命名检验项',
      standard: item.standard || item.criteria || '无标准',
      actual_value: item.actual_value || item.value || '-',
      result: item.result || 'passed',
      remarks: item.remarks || item.comment || ''
    }))
  }
  
  return inspectionData
}

/**
 * 计算检验状态
 * @param {Array} items - 检验项数组
 * @returns {string} 检验状态 (passed/partial/failed)
 */
export function calculateInspectionStatus(items) {
  if (!items || items.length === 0) {
    return 'pending'
  }
  
  const criticalItemFailed = items.some(item => item.is_critical && item.result === 'failed')
  const anyFailed = items.some(item => item.result === 'failed')
  
  if (criticalItemFailed) {
    return 'failed'
  } else if (anyFailed) {
    return 'partial'
  }
  return 'passed'
}

/**
 * 验证检验项是否都已填写
 * @param {Array} items - 检验项数组
 * @returns {Object} 验证结果 { valid: boolean, message: string, unfilledCount: number }
 */
export function validateInspectionItems(items) {
  if (!items || items.length === 0) {
    return {
      valid: false,
      message: '请添加检验项'
    }
  }
  
  const unfilledItems = items.filter(item => !item.actual_value || !item.result)
  
  if (unfilledItems.length === items.length) {
    return {
      valid: false,
      message: '请填写检验项的实际值和结果'
    }
  }
  
  if (unfilledItems.length > 0) {
    return {
      valid: false,
      message: `还有 ${unfilledItems.length} 个检验项未填写实际值或结果，请完成后再提交`,
      unfilledCount: unfilledItems.length
    }
  }
  
  return { valid: true }
}

/**
 * 简化的物料名称提取
 * @param {Object} item - 数据项
 * @returns {string} 物料名称
 */
export function extractMaterialNameSimple(item) {
  if (!item) return '未知物料'
  
  // 定义检查优先级
  const nameFields = [
    item.product_name,
    item.material?.name,
    item.materialName,
    item.material_name,
    item.item_name,
    item.reference_data?.items?.[0]?.material_name,
    item.reference_data?.material_name,
    item.material_code
  ]
  
  // 查找第一个有效值
  for (const field of nameFields) {
    if (field && 
        field !== '-' && 
        !field.includes('来自采购单') && 
        !field.includes('物料(PO')) {
      return field
    }
  }
  
  return '未知物料'
}

/**
 * 简化的物料型号提取
 * @param {Object} item - 数据项
 * @returns {string} 物料型号
 */
export function extractMaterialSpecsSimple(item) {
  if (!item) return '-'
  
  const specsFields = [
    item.product_code,
    item.specs,
    item.item_specs,
    item.material?.specs,
    item.reference_data?.items?.[0]?.specs,
    item.reference_data?.specs
  ]
  
  for (const field of specsFields) {
    if (field && field !== '-') {
      return field
    }
  }
  
  return '-'
}

/**
 * 简化的供应商名称提取
 * @param {Object} item - 数据项
 * @returns {string} 供应商名称
 */
export function extractSupplierNameSimple(item) {
  if (!item) return '-'
  
  const supplierFields = [
    item.supplier_name,
    item.supplierName,
    item.supplier?.name,
    item.reference_data?.supplier_name,
    item.reference_data?.supplier?.name,
    item.po_data?.supplier_name,
    item.po_data?.supplier?.name
  ]
  
  for (const field of supplierFields) {
    if (field && field.trim() !== '') {
      return field
    }
  }
  
  return '-'
}

/**
 * 异步加载物料信息并更新列表
 * @param {number} materialId - 物料ID
 * @param {Object} materialCache - 物料缓存对象
 * @param {Array} inspectionList - 检验单列表
 * @param {Function} getMaterialInfo - 获取物料信息的函数
 */
export async function loadMaterialInfoAsync(materialId, materialCache, inspectionList, getMaterialInfo) {
  if (!materialId || materialCache[materialId]) {
    return
  }
  
  try {
    const materialInfo = await getMaterialInfo(materialId)
    if (!materialInfo) return
    
    // 更新缓存
    materialCache[materialId] = materialInfo
    
    // 更新列表中使用该物料的所有记录
    inspectionList.forEach(item => {
      if ((item.materialId === materialId || item.material_id === materialId)) {
        if (materialInfo.name && (!item.materialName || item.materialName === '-')) {
          item.materialName = materialInfo.name
          item.product_name = materialInfo.name
        }
        if (materialInfo.specs && (!item.specs || item.specs === '-')) {
          item.specs = materialInfo.specs
          item.product_code = materialInfo.specs
        }
      }
    })
  } catch (error) {
    console.error(`异步加载物料 ${materialId} 失败:`, error)
  }
}

/**
 * 格式化尺寸公差显示
 * @param {Object} item - 检验项对象
 * @returns {string} 格式化后的尺寸公差字符串
 */
export function formatDimensionTolerance(item) {
  if (!item.dimension_value) {
    return '-'
  }
  
  const upper = item.tolerance_upper || 0
  const lower = Math.abs(item.tolerance_lower) || 0
  
  if (upper === 0 && lower === 0) {
    return String(item.dimension_value)
  }
  
  return `${item.dimension_value} (+${upper}/-${lower})`
}

/**
 * 检查尺寸公差并自动判定合格/不合格
 * @param {Object} item - 检验项对象
 * @param {boolean} showMessage - 是否显示消息提示
 */
export function checkDimensionTolerance(item, showMessage = false) {
  if (!item.dimension_value || !item.actual_value) {
    return
  }
  
  const actualValue = parseFloat(item.actual_value)
  const dimensionValue = parseFloat(item.dimension_value)
  const toleranceUpper = parseFloat(item.tolerance_upper) || 0
  const toleranceLower = parseFloat(item.tolerance_lower) || 0
  
  if (isNaN(actualValue) || isNaN(dimensionValue)) {
    return
  }
  
  const maxAllowed = dimensionValue + toleranceUpper
  const minAllowed = dimensionValue - Math.abs(toleranceLower)
  const deviation = actualValue - dimensionValue
  const deviationStr = deviation >= 0 ? `+${deviation.toFixed(3)}` : deviation.toFixed(3)
  
  if (actualValue >= minAllowed && actualValue <= maxAllowed) {
    item.result = 'passed'
    if (showMessage) {
      ElMessage.success({
        message: `✓ 检验合格 | 实际: ${actualValue.toFixed(3)} | 偏差: ${deviationStr} | 范围: [${minAllowed.toFixed(3)} ~ ${maxAllowed.toFixed(3)}]`,
        duration: 3000
      })
    }
  } else {
    item.result = 'failed'
    if (showMessage) {
      const exceeds = actualValue > maxAllowed 
        ? `超出上限 ${(actualValue - maxAllowed).toFixed(3)}` 
        : `超出下限 ${(minAllowed - actualValue).toFixed(3)}`
      ElMessage.warning({
        message: `✗ 检验不合格 | 实际: ${actualValue.toFixed(3)} | ${exceeds} | 范围: [${minAllowed.toFixed(3)} ~ ${maxAllowed.toFixed(3)}]`,
        duration: 4000
      })
    }
  }
}

/**
 * 生成批次号
 * @param {number} quantity - 数量
 * @returns {string} 批次号
 */
/**
 * 生成批次号 (新规则: PUR-{供应商编码}-{日期YYMMDD}-{序号})
 * @param {string} supplierCode - 供应商编码
 * @param {number} supplierId - 供应商ID（用于查询当天检验单数量）
 * @param {Object} qualityApi - 质检API对象（如果不传则使用简单序号）
 * @returns {Promise<string>} 批次号
 */
export async function generateBatchNumber(supplierCode = '', supplierId = null, qualityApi = null) {
  try {
    // 1. 生成日期部分 (YYMMDD)
    const date = new Date()
    const year = String(date.getFullYear()).slice(-2)  // 取后两位年份
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateStr = `${year}${month}${day}`
    
    // 2. 如果没有供应商编码，使用默认值
    if (!supplierCode) {
      supplierCode = 'UNKNOWN'
    }
    
    // 3. 获取今天该供应商的检验单数量，生成递增序号
    let serialNo = '001'
    if (supplierId && qualityApi) {
      try {
        // 动态导入 dayjs（如果环境支持）
        let dayjs
        try {
          dayjs = (await import('dayjs')).default
        } catch {
          // 如果导入失败，使用原生Date格式化
          const today = new Date()
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
          
          const response = await qualityApi.getIncomingInspections({
            supplier_id: supplierId,
            start_date: todayStr,
            end_date: todayStr,
            page: 1,
            limit: 1000
          })

          // 拦截器已解包，response.data 就是业务数据
          if (response.data) {
            const data = response.data
            const count = data.total || (Array.isArray(data.list) ? data.list.length : 0) || 0
            serialNo = String(count + 1).padStart(3, '0')
          }

          return `PUR-${supplierCode}-${dateStr}-${serialNo}`
        }

        const today = dayjs().format('YYYY-MM-DD')
        const response = await qualityApi.getIncomingInspections({
          supplier_id: supplierId,
          start_date: today,
          end_date: today,
          page: 1,
          limit: 1000
        })

        // 拦截器已解包，response.data 就是业务数据
        if (response.data) {
          const data = response.data
          const count = data.total || (Array.isArray(data.list) ? data.list.length : 0) || 0
          serialNo = String(count + 1).padStart(3, '0')
        }
      } catch (error) {
        console.error('获取检验单数量失败:', error)
        // 失败时使用随机序号避免冲突
        serialNo = String(Math.floor(Math.random() * 100) + 1).padStart(3, '0')
      }
    }
    
    // 4. 组合批次号
    return `PUR-${supplierCode}-${dateStr}-${serialNo}`
  } catch (error) {
    console.error('生成批次号失败:', error)
    // 降级方案：使用时间戳
    return `PUR-${Date.now()}`
  }
}

