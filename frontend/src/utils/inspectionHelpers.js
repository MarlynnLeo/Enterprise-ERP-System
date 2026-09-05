/**
 * 检验单相关的公共辅助函数
 * 用于减少来料检验、过程检验、成品检验等页面的代码重复
 */

import { ElMessage } from 'element-plus/es/components/message/index'
import dayjs from 'dayjs'
import { qualityApi, purchaseApi, baseDataApi } from '@/api'
import { parseListData } from '@/utils/responseParser'
import logger from '@/utils/logger'

export const MAX_INSPECTION_MEASUREMENT_COLUMNS = 6

const firstUsableMaterialName = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (!text || text === '-' || text === '未知物料' || text.toLowerCase() === 'unknown') continue
    if (text.includes('来自采购单') || text.includes('物料(PO') || text.includes('物料 PO')) continue
    return text
  }
  return ''
}

const readField = (object, ...keys) => {
  if (!object || typeof object !== 'object') return undefined
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) return object[key]
  }
  return undefined
}

/** Normalize fixed measurement fields and dynamic measurement rows. */
export function normalizeInspectionMeasurements(item = {}) {
  if (Array.isArray(item.measurements) && item.measurements.length > 0) {
    const rows = item.measurements.slice()
    const maxSampleNo = rows.reduce((max, measurement, index) => {
      const sampleNo = Number(measurement?.sample_no ?? measurement?.sampleNo)
      return Math.max(max, Number.isFinite(sampleNo) && sampleNo > 0 ? sampleNo : index + 1)
    }, 0)
    const normalized = Array.from({
      length: Math.min(MAX_INSPECTION_MEASUREMENT_COLUMNS, Math.max(rows.length, maxSampleNo))
    }, () => '')
    rows.forEach((measurement, index) => {
      const sampleNo = Number(measurement?.sample_no ?? measurement?.sampleNo)
      const targetIndex = Number.isFinite(sampleNo) && sampleNo > 0 ? sampleNo - 1 : index
      if (targetIndex >= MAX_INSPECTION_MEASUREMENT_COLUMNS) return
      normalized[targetIndex] = measurement && typeof measurement === 'object'
        ? (measurement.measured_value ?? measurement.measuredValue ?? measurement.value ?? '')
        : (measurement ?? '')
    })
    if (normalized.some((value) => value !== null && value !== undefined && value !== '')) return normalized
  }

  const fixedValues = Array.from(
    { length: MAX_INSPECTION_MEASUREMENT_COLUMNS },
    (_, index) => item[`measure${index + 1}`] ?? item[`measure_${index + 1}`] ?? ''
  )
  const lastValueIndex = fixedValues.reduce(
    (last, value, index) => value !== null && value !== undefined && value !== '' ? index : last,
    -1
  )
  return lastValueIndex >= 0 ? fixedValues.slice(0, lastValueIndex + 1) : []
}

export function getInspectionMeasurementColumnCount(items = [], fallback = MAX_INSPECTION_MEASUREMENT_COLUMNS) {
  let count = 0
  for (const item of items || []) {
    if (Array.isArray(item?.measurements)) {
      item.measurements.forEach((measurement, index) => {
        const value = measurement && typeof measurement === 'object'
          ? (measurement.measured_value ?? measurement.measuredValue ?? measurement.value)
          : measurement
        if (value === null || value === undefined || value === '') return
        const sampleNo = Number(measurement?.sample_no ?? measurement?.sampleNo)
        const position = Number.isFinite(sampleNo) && sampleNo > 0 ? sampleNo : index + 1
        count = Math.max(count, Math.min(MAX_INSPECTION_MEASUREMENT_COLUMNS, position))
      })
    }
    for (let index = 1; index <= MAX_INSPECTION_MEASUREMENT_COLUMNS; index += 1) {
      const value = item?.[`measure${index}`] ?? item?.[`measure_${index}`]
      if (value !== null && value !== undefined && value !== '') count = Math.max(count, index)
    }
  }
  if (count > 0) return count
  if (Number(fallback) === 0) return 0
  return Math.min(
    MAX_INSPECTION_MEASUREMENT_COLUMNS,
    Math.max(1, Number(fallback) || MAX_INSPECTION_MEASUREMENT_COLUMNS)
  )
}

/**
 * 从检验单获取或补全供应商信息
 * @param {Object} inspection - 检验单对象
 * @returns {Promise<Object>} 包含供应商信息的检验单对象
 */
export async function ensureSupplierInfo(inspection) {
  // 如果已有供应商ID,直接返回
  if (inspection.supplierId) {
    return inspection
  }

  // 尝试通过采购订单ID获取供应商信息
  if (inspection.referenceId) {
    try {
      const orderResponse = await purchaseApi.getOrder(inspection.referenceId)
      if (orderResponse.data?.supplierId) {
        inspection.supplierId = Number(orderResponse.data.supplierId)
        inspection.supplierName = orderResponse.data.supplierName || inspection.supplierName
        return inspection
      }
    } catch (err) {
      console.error('通过采购订单ID获取供应商失败:', err)
    }
  }

  // 尝试通过采购订单号查询供应商信息
  if (!inspection.supplierId && inspection.referenceNo) {
    try {
      const ordersResponse = await purchaseApi.getOrders({
        orderNo: inspection.referenceNo,
        pageSize: 1
      })

      // 使用统一解析器
      const orders = parseListData(ordersResponse, { enableLog: false })
      if (orders.length > 0) {
        const order = orders[0]
        if (order.supplierId) {
          inspection.supplierId = Number(order.supplierId)
          inspection.supplierName = order.supplierName || inspection.supplierName
          return inspection
        }
      }
    } catch (err) {
      console.error('通过订单号查询供应商失败:', err)
    }
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

  if (!inspection.supplierId) {
    throw new Error('检验单缺少供应商信息，无法创建入库单')
  }

  // 获取物料的默认库位
  let warehouseId = null
  let warehouseName = ''

  if (inspection.materialId) {
    try {
      const materialResponse = await baseDataApi.getMaterial(inspection.materialId)
      if (materialResponse.data?.locationId) {
        warehouseId = Number(materialResponse.data.locationId)
        warehouseName = materialResponse.data.locationName || ''
      }
    } catch (error) {
      logger.error('获取物料库位信息失败:', error)
    }
  }

  // 获取采购订单ID
  let orderId = Number(inspection.referenceId || 0)

  // 如果reference_id为空，尝试通过reference_no查询采购订单ID
  if (!orderId && inspection.referenceNo) {
    try {
      const orderResponse = await purchaseApi.getOrder(inspection.referenceNo)
      if (orderResponse.data) {
        orderId = Number(orderResponse.data.id || 0)
      }
    } catch (error) {
      logger.error('查询采购订单ID失败:', error)
    }
  }

  // 防御性校验：没有关联采购订单时，不发起注定失败的请求
  if (!orderId) {
    throw new Error('检验单缺少关联的采购订单信息（reference_id），无法创建入库单。请检查检验单数据完整性。')
  }
  if (!warehouseId) {
    throw new Error('检验单物料未维护默认库位，无法创建入库单')
  }

  const unitId = Number(inspection.unitId)
  if (!Number.isInteger(unitId) || unitId <= 0) {
    throw new Error('检验单缺少有效单位信息，无法创建入库单')
  }

  const operatorName = authStore.user?.realName || authStore.user?.username
  if (!operatorName) {
    throw new Error('缺少当前用户信息，无法创建入库单')
  }

  // 构造入库单数据
  const receiptData = {
    // 订单信息
    orderId: orderId,
    // 供应商信息
    supplierId: Number(inspection.supplierId),
    supplierName: inspection.supplierName,
    // 仓库信息
    warehouseId: warehouseId,
    warehouseName: warehouseName,
    // 日期和备注
    receiptDate: dayjs().format('YYYY-MM-DD'),
    note: isReview
      ? `来自检验单 ${inspection.inspectionNo} 的复检自动入库`
      : `来自检验单 ${inspection.inspectionNo} 的自动入库`,
    // 状态信息
    status: 'draft',
    // 来源信息
    fromInspection: true,
    inspectionId: Number(inspection.id),
    // 操作人
    operator: operatorName,
    receiver: operatorName,
    // 物料明细（检验单 API camel）
    items: [{
      materialId: Number(inspection.materialId || 0),
      materialCode: inspection.productCode || inspection.materialCode || '',
      materialName: inspection.productName || inspection.materialName || '',
      specification: inspection.specification || inspection.specs || '',
      unitId,
      unit: inspection.unit || '',
      orderedQuantity: parseFloat(inspection.quantity || 0),
      // 使用合格数量而不是检验数量
      quantity: parseFloat(inspection.qualifiedQuantity || inspection.quantity || 0),
      receivedQuantity: parseFloat(inspection.qualifiedQuantity || inspection.quantity || 0),
      qualifiedQuantity: parseFloat(inspection.qualifiedQuantity || inspection.quantity || 0),
      price: parseFloat(inspection.price || 0),
      remarks: isReview
        ? `复检后自动入库：${inspection.note || ''}`
        : `自动入库：${inspection.note || ''}`,
      locationId: warehouseId,
      batchNo: inspection.batchNo || '',
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
  // 直接对象格式: { id: ..., inspectionNo: ... }
  else if (respData?.id || respData?.inspectionNo) {
    inspectionData = respData
  }

  if (!inspectionData) {
    throw new Error('获取检验单详情失败')
  }

  // 详情接口在不同版本中可能返回 itemName、materialName 或 productName。
  // 先把列表行合并进来，再统一取值，避免新生成的来料检验单显示“未知物料”。
  const fallbackRow = row || {}
  const materialSource = { ...fallbackRow, ...inspectionData }
  const extractedMaterialName = typeof extractMaterialName === 'function'
    ? extractMaterialName(materialSource)
    : extractMaterialNameSimple(materialSource)
  const materialCodeCandidates = [
    readField(inspectionData, 'itemCode', 'item_code'),
    readField(inspectionData, 'materialCode', 'material_code'),
    readField(fallbackRow, 'itemCode', 'item_code'),
    readField(fallbackRow, 'materialCode', 'material_code')
  ].filter(value => value !== null && value !== undefined).map(value => String(value).trim())
  const extractedNameCandidate = materialCodeCandidates.includes(String(extractedMaterialName).trim())
    ? ''
    : extractedMaterialName
  let materialName = firstUsableMaterialName(
    readField(inspectionData, 'itemName', 'item_name'),
    readField(inspectionData, 'materialName', 'material_name'),
    readField(inspectionData, 'productName', 'product_name'),
    readField(fallbackRow, 'itemName', 'item_name'),
    readField(fallbackRow, 'materialName', 'material_name'),
    extractedNameCandidate
  )

  // 少数旧接口只返回 materialId；在名称仍缺失时读取一次物料主数据，
  // 让详情和打印也能显示真实名称，而不是“未知物料”。
  if (!materialName) {
    const materialId = readField(inspectionData, 'materialId', 'material_id') ||
      readField(fallbackRow, 'materialId', 'material_id')
    if (materialId && typeof baseDataApi.getMaterialsByIds === 'function') {
      try {
        const materialResponse = await baseDataApi.getMaterialsByIds([materialId])
        const material = parseListData(materialResponse, { enableLog: false })[0]
        materialName = firstUsableMaterialName(
          readField(material, 'name', 'materialName', 'itemName', 'item_name')
        )
      } catch (error) {
        console.warn('获取详情物料主数据失败:', error)
      }
    }
  }
  materialName = materialName || firstUsableMaterialName(extractedMaterialName) || '未知物料'

  // 统一字段映射（API 只认 camel）
  inspectionData = {
    ...inspectionData,
    inspectionNo: inspectionData.inspectionNo || fallbackRow.inspectionNo || '',
    templateCode: inspectionData.templateCode || fallbackRow.templateCode || '',
    templateName: inspectionData.templateName || fallbackRow.templateName || '',
    purchaseOrderNo:
      inspectionData.referenceNo ||
      inspectionData.purchaseOrderNo ||
      fallbackRow.purchaseOrderNo ||
      '',
    batchNo: inspectionData.batchNo || fallbackRow.batchNo || '',
    itemName: materialName,
    materialName,
    productName:
      firstUsableMaterialName(
        inspectionData.productName,
        inspectionData.product_name,
        materialName
      ) || materialName,
    productCode: inspectionData.productCode || inspectionData.specs || extractMaterialSpecs(inspectionData),
    quantity: inspectionData.quantity || inspectionData.totalQuantity || 0,
    unit: inspectionData.unit || '个',
    inspectionDate:
      inspectionData.actualDate ||
      inspectionData.plannedDate ||
      inspectionData.inspectionDate,
    inspector: inspectionData.inspectorName || inspectionData.inspector
  }

  // 获取供应商信息
  let supplierName = inspectionData.supplierName || ''
  if ((!supplierName || supplierName === '-') && inspectionData.referenceId) {
    try {
      const poResponse = await purchaseApi.getOrder(inspectionData.referenceId)
      if (poResponse.data) {
        supplierName = poResponse.data.supplierName || (poResponse.data.supplier?.name) || ''
      }
    } catch (error) {
      console.error('获取采购单信息失败:', error)
    }
  }
  inspectionData.supplierName = supplierName || extractSupplierName(inspectionData)

  // 获取检验项（使用统一 api 实例，确保经过拦截器和代理）
  if (!inspectionData.items || inspectionData.items.length === 0) {
    try {
      const itemsResponse = await qualityApi.getInspectionItems(id)
      const itemsData = itemsResponse.data

      if (itemsData) {
        // 兼容多种响应格式：直接数组 / { list: [] } / { data: [] }
        inspectionData.items = Array.isArray(itemsData)
          ? itemsData
          : (itemsData.list || itemsData.data || [])
      }
    } catch (error) {
      console.error('获取检验项目失败:', error)
      inspectionData.items = []
    }
  }

  // 标准化检验项数据
  if (inspectionData.items && inspectionData.items.length > 0) {
    inspectionData.items = inspectionData.items.map(item => ({
      ...item,
      itemName: readField(item, 'itemName', 'item_name', 'name') || '未命名检验项',
      standard: readField(item, 'standard', 'item_standard', 'criteria') || '无标准',
      method: readField(item, 'method', 'inspectionMethod', 'inspection_method') || '',
      actualValue: item.actualValue ?? '-',
      result: item.result || '',
      remarks: item.remarks || item.remark || item.comment || '',
      // API 的标准字段是 camelCase；保留 snake_case 仅用于兼容旧数据。
      measure1: item.measure1 ?? null,
      measure2: item.measure2 ?? null,
      measure3: item.measure3 ?? null,
      measure4: item.measure4 ?? null,
      measure5: item.measure5 ?? null,
      measure6: item.measure6 ?? null,
      measurements: Array.isArray(item.measurements) ? item.measurements : []
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

  const criticalItemFailed = items.some(item => {
    const isCritical = item.isCritical ?? item.is_critical
    const result = String(item.result ?? '').trim().toLowerCase()
    const critical = isCritical === true || isCritical === 1 || isCritical === '1'
    return critical && ['failed', 'fail', '不合格'].includes(result)
  })
  const anyFailed = items.some(item => {
    const result = String(item.result ?? '').trim().toLowerCase()
    return ['failed', 'fail', '不合格'].includes(result)
  })

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

  const unfilledItems = items.filter(item => {
    const actualValue = item.actual_value ?? item.actualValue
    const result = String(item.result ?? '').trim().toLowerCase()
    const hasActualValue = actualValue !== null && actualValue !== undefined &&
      String(actualValue).trim() !== '' && String(actualValue).trim() !== '-'
    const hasResult = ['passed', 'pass', 'ok', 'qualified', '合格', 'failed', 'fail', 'ng', '不合格'].includes(result)
    return !hasActualValue || !hasResult
  })

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
    // 来料检验接口通过 SQL 别名返回 item_name，边界转换后即为 itemName。
    readField(item, 'itemName', 'item_name'),
    readField(item, 'materialName', 'material_name'),
    readField(item, 'productName', 'product_name'),
    item.material?.name,
    readField(item.material, 'itemName', 'item_name'),
    readField(item.reference_data?.items?.[0], 'materialName', 'itemName', 'item_name'),
    readField(item.reference_data, 'materialName', 'itemName', 'item_name'),
    // 没有名称时保留编码作为最后兜底，至少不会把有物料的单据误判为空。
    readField(item, 'itemCode', 'item_code'),
    readField(item, 'materialCode', 'material_code')
  ]

  return firstUsableMaterialName(...nameFields) || '未知物料'
}

/**
 * 简化的物料型号提取
 * @param {Object} item - 数据项
 * @returns {string} 物料型号
 */
export function extractMaterialSpecsSimple(item) {
  if (!item) return '-'

  const specsFields = [
    readField(item, 'itemSpecs', 'item_specs'),
    readField(item, 'productCode', 'product_code'),
    item.specs,
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
    item.supplierName,
    item.supplierName,
    item.supplier?.name,
    item.reference_data?.supplierName,
    item.reference_data?.supplier?.name,
    item.po_data?.supplierName,
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
      if ((item.materialId === materialId || item.materialId === materialId)) {
        if (materialInfo.name && (!item.materialName || item.materialName === '-')) {
          item.materialName = materialInfo.name
          item.productName = materialInfo.name
        }
        if (materialInfo.specs && (!item.specs || item.specs === '-')) {
          item.specs = materialInfo.specs
          item.productCode = materialInfo.specs
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
 * 生成批次号 (规则: PUR-{供应商编码}-{日期YYMMDD}-{序号})
 * @param {string} supplierCode - 供应商编码
 * @param {number} supplierId - 供应商ID（用于查询当天检验单数量）
 * @param {Object} qualityApiInstance - 质检API对象
 * @returns {Promise<string>} 批次号
 */
export async function generateBatchNumber(supplierCode = '', supplierId = null, qualityApiInstance = null) {
  try {
    // 1. 生成日期部分 (YYMMDD)
    const date = new Date()
    const year = String(date.getFullYear()).slice(-2)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateStr = `${year}${month}${day}`

    if (!supplierCode) {
      throw new Error('供应商编码不能为空，无法生成采购检验批次号')
    }

    // 3. 获取今天该供应商的检验单数量，生成递增序号
    let serialNo = '001'
    if (supplierId && qualityApiInstance) {
      try {
        // 直接使用顶层已导入的 dayjs
        const today = dayjs().format('YYYY-MM-DD')
        const response = await qualityApiInstance.getIncomingInspections({
          supplier_id: supplierId,
          start_date: today,
          end_date: today,
          page: 1,
          limit: 1
        })

        // 拦截器已解包，response.data 就是业务数据
        if (response.data) {
          const data = response.data
          const count = data.total || (Array.isArray(data.list) ? data.list.length : 0) || 0
          serialNo = String(count + 1).padStart(3, '0')
        }
      } catch (error) {
        console.error('获取检验单数量失败:', error)
        throw new Error('无法获取当天检验单序号，请稍后重试')
      }
    }

    // 4. 组合批次号
    return `PUR-${supplierCode}-${dateStr}-${serialNo}`
  } catch (error) {
    console.error('生成批次号失败:', error)
    throw error
  }
}
