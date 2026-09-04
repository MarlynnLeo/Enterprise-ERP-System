/**
 * 采购接口响应契约归一化。
 *
 * 后端新版本返回 camelCase，旧容器/历史接口仍可能返回 snake_case。
 * 归一化只在 API 边界执行一次，页面组件不再分别猜测字段名，也不会把
 * 订单详情中的 items（订单明细）误判为订单列表。
 */

const DEFAULT_REQUISITION_LABEL = '关联申请'

const hasValue = (value) => value !== undefined && value !== null && value !== ''

const pickValue = (...values) => values.find(hasValue)

const toFiniteNumber = (value, fallback = 0) => {
  if (!hasValue(value)) return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const hasRelationId = (value) => hasValue(value) && String(value) !== '0'

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))

const isPurchaseOrderEntity = (value) => {
  if (!isObject(value)) return false
  return [
    'orderNo',
    'order_no',
    'orderDate',
    'order_date',
    'supplierId',
    'supplier_id',
    'supplierName',
    'supplier_name',
    'expectedDeliveryDate',
    'expected_delivery_date',
    'requisitionId',
    'requisition_id',
    'totalAmount',
    'total_amount'
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key))
}

const isPurchaseRequisitionEntity = (value) => {
  if (!isObject(value)) return false
  return [
    'requisitionNo',
    'requisition_no',
    'requisitionNumber',
    'requisition_number',
    'requestDate',
    'request_date',
    'requester',
    'realName',
    'real_name',
    'status'
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key))
}

/** 订单明细归一化（兼容历史 snake_case 数据）。 */
export const normalizePurchaseOrderItem = (item = {}) => {
  if (!isObject(item)) return item

  const quantity = toFiniteNumber(pickValue(item.quantity, item.order_quantity), 0)
  const unitPrice = toFiniteNumber(
    pickValue(item.unitPrice, item.unit_price, item.price),
    0
  )
  const explicitTotal = pickValue(
    item.totalPrice,
    item.total_price,
    item.total,
    item.amount
  )
  const totalPrice = hasValue(explicitTotal)
    ? toFiniteNumber(explicitTotal, quantity * unitPrice)
    : quantity * unitPrice

  return {
    ...item,
    materialId: pickValue(item.materialId, item.material_id) ?? null,
    materialCode: pickValue(item.materialCode, item.material_code, item.code) ?? '',
    materialName: pickValue(item.materialName, item.material_name, item.name) ?? '',
    specification: pickValue(
      item.specification,
      item.material_specs,
      item.specs
    ) ?? '',
    unit: pickValue(item.unit, item.unitName, item.unit_name) ?? '',
    unitName: pickValue(item.unitName, item.unit_name, item.unit) ?? '',
    unitId: pickValue(item.unitId, item.unit_id) ?? null,
    quantity,
    price: unitPrice,
    unitPrice,
    totalPrice,
    amount: totalPrice,
    total: totalPrice,
    taxRate: hasValue(pickValue(item.taxRate, item.tax_rate))
      ? toFiniteNumber(pickValue(item.taxRate, item.tax_rate), 0)
      : null,
    taxAmount: hasValue(pickValue(item.taxAmount, item.tax_amount))
      ? toFiniteNumber(pickValue(item.taxAmount, item.tax_amount), 0)
      : 0,
    receivedQuantity: toFiniteNumber(
      pickValue(item.receivedQuantity, item.received_quantity),
      0
    ),
    warehousedQuantity: toFiniteNumber(
      pickValue(item.warehousedQuantity, item.warehoused_quantity),
      0
    ),
    pendingQuantity: toFiniteNumber(
      pickValue(item.pendingQuantity, item.pending_quantity),
      Math.max(0, quantity - toFiniteNumber(
        pickValue(item.receivedQuantity, item.received_quantity),
        0
      ))
    )
  }
}

/** 采购订单实体归一化。 */
export const normalizePurchaseOrder = (order = {}) => {
  if (!isObject(order)) return order

  const requisitionId = pickValue(order.requisitionId, order.requisition_id) ?? null
  const requisitionNumber = pickValue(
    order.requisitionNumber,
    order.requisition_number,
    order.requisitionNo,
    order.requisition_no
  ) ?? (hasRelationId(requisitionId) ? DEFAULT_REQUISITION_LABEL : '')

  const itemSource = Array.isArray(order.items)
    ? order.items
    : Array.isArray(order.orderItems)
      ? order.orderItems
      : Array.isArray(order.materialItems)
        ? order.materialItems
        : null

  return {
    ...order,
    orderNo: pickValue(order.orderNo, order.order_no) ?? '',
    orderDate: pickValue(order.orderDate, order.order_date) ?? '',
    supplierId: pickValue(order.supplierId, order.supplier_id) ?? null,
    supplierName: pickValue(order.supplierName, order.supplier_name) ?? '',
    expectedDeliveryDate: pickValue(
      order.expectedDeliveryDate,
      order.expected_delivery_date
    ) ?? '',
    contactPerson: pickValue(order.contactPerson, order.contact_person) ?? '',
    contactPhone: pickValue(order.contactPhone, order.contact_phone) ?? '',
    contractCode: pickValue(order.contractCode, order.contract_code) ?? '',
    totalAmount: hasValue(pickValue(order.totalAmount, order.total_amount))
      ? toFiniteNumber(pickValue(order.totalAmount, order.total_amount), 0)
      : null,
    subtotal: hasValue(pickValue(order.subtotal, order.sub_total))
      ? toFiniteNumber(pickValue(order.subtotal, order.sub_total), 0)
      : null,
    taxAmount: hasValue(pickValue(order.taxAmount, order.tax_amount))
      ? toFiniteNumber(pickValue(order.taxAmount, order.tax_amount), 0)
      : null,
    taxRate: hasValue(pickValue(order.taxRate, order.tax_rate))
      ? toFiniteNumber(pickValue(order.taxRate, order.tax_rate), 0)
      : null,
    status: pickValue(order.status) ?? '',
    requisitionId,
    requisitionNo: pickValue(order.requisitionNo, order.requisition_no) ?? requisitionNumber,
    requisitionNumber,
    createdAt: pickValue(order.createdAt, order.created_at) ?? '',
    updatedAt: pickValue(order.updatedAt, order.updated_at) ?? '',
    hasRequisition: hasRelationId(requisitionId) && order.status === 'pending',
    ...(itemSource ? { items: itemSource.map(normalizePurchaseOrderItem) } : {})
  }
}

const normalizeCollectionPayload = (response, payload, key, normalize) => {
  const list = payload[key].map(normalize)
  return {
    ...response,
    data: {
      ...payload,
      list: key === 'list' ? list : Array.isArray(payload.list) ? payload.list.map(normalize) : list,
      items: Array.isArray(payload.items) ? payload.items.map(normalize) : list
    }
  }
}

/** 采购订单响应归一化：严格区分列表 envelope 与详情实体。 */
export const normalizePurchaseOrderResponse = (response) => {
  if (Array.isArray(response)) return response.map(normalizePurchaseOrder)
  if (!response || response.data === undefined) return response

  const payload = response.data
  if (Array.isArray(payload)) {
    return { ...response, data: payload.map(normalizePurchaseOrder) }
  }
  if (!isObject(payload)) return response

  if (Array.isArray(payload.list)) {
    return normalizeCollectionPayload(response, payload, 'list', normalizePurchaseOrder)
  }
  if (Array.isArray(payload.rows)) {
    return normalizeCollectionPayload(response, payload, 'rows', normalizePurchaseOrder)
  }
  if (Array.isArray(payload.orders)) {
    return normalizeCollectionPayload(response, payload, 'orders', normalizePurchaseOrder)
  }
  if (Array.isArray(payload.items) && !isPurchaseOrderEntity(payload)) {
    return normalizeCollectionPayload(response, payload, 'items', normalizePurchaseOrder)
  }

  return { ...response, data: normalizePurchaseOrder(payload) }
}

/** 采购申请明细归一化。 */
export const normalizePurchaseRequisitionItem = (item = {}) => {
  if (!isObject(item)) return item

  return {
    ...item,
    materialId: pickValue(item.materialId, item.material_id) ?? null,
    materialCode: pickValue(item.materialCode, item.material_code, item.code) ?? '',
    materialName: pickValue(item.materialName, item.material_name, item.name) ?? '',
    specification: pickValue(
      item.specification,
      item.material_specs,
      item.specs
    ) ?? '',
    unit: pickValue(item.unit, item.unitName, item.unit_name) ?? '',
    unitName: pickValue(item.unitName, item.unit_name, item.unit) ?? '',
    unitId: pickValue(item.unitId, item.unit_id) ?? null,
    quantity: toFiniteNumber(item.quantity, 0),
    orderedQuantity: toFiniteNumber(
      pickValue(item.orderedQuantity, item.ordered_quantity),
      0
    ),
    estimatedPrice: hasValue(pickValue(item.estimatedPrice, item.estimated_price))
      ? toFiniteNumber(pickValue(item.estimatedPrice, item.estimated_price), 0)
      : null
  }
}

/** 采购申请实体归一化。 */
export const normalizePurchaseRequisition = (requisition = {}) => {
  if (!isObject(requisition)) return requisition

  const materialSource = Array.isArray(requisition.materials)
    ? requisition.materials
    : Array.isArray(requisition.items)
      ? requisition.items
      : []
  const materials = materialSource.map(normalizePurchaseRequisitionItem)
  const requisitionNumber = pickValue(
    requisition.requisitionNumber,
    requisition.requisition_number,
    requisition.requisitionNo,
    requisition.requisition_no
  ) ?? ''

  return {
    ...requisition,
    requisitionNo: pickValue(
      requisition.requisitionNo,
      requisition.requisition_no
    ) ?? requisitionNumber,
    requisitionNumber,
    requestDate: pickValue(requisition.requestDate, requisition.request_date) ?? '',
    requester: pickValue(requisition.requester) ?? '',
    realName: pickValue(
      requisition.realName,
      requisition.real_name,
      requisition.user_real_name
    ) ?? '',
    contractCode: pickValue(requisition.contractCode, requisition.contract_code) ?? '',
    sourceType: pickValue(requisition.sourceType, requisition.source_type) ?? null,
    sourceId: pickValue(requisition.sourceId, requisition.source_id) ?? null,
    sourceMaterialId: pickValue(
      requisition.sourceMaterialId,
      requisition.source_material_id
    ) ?? null,
    createdAt: pickValue(requisition.createdAt, requisition.created_at) ?? '',
    updatedAt: pickValue(requisition.updatedAt, requisition.updated_at) ?? '',
    materials,
    items: materials
  }
}

/** 采购申请响应归一化：详情的 items 是明细，列表 envelope 的 items 是申请单列表。 */
export const normalizePurchaseRequisitionResponse = (response) => {
  if (Array.isArray(response)) return response.map(normalizePurchaseRequisition)
  if (!response || response.data === undefined) return response

  const payload = response.data
  if (Array.isArray(payload)) {
    return { ...response, data: payload.map(normalizePurchaseRequisition) }
  }
  if (!isObject(payload)) return response

  if (Array.isArray(payload.list)) {
    return normalizeCollectionPayload(response, payload, 'list', normalizePurchaseRequisition)
  }
  if (Array.isArray(payload.rows)) {
    return normalizeCollectionPayload(response, payload, 'rows', normalizePurchaseRequisition)
  }
  if (Array.isArray(payload.requisitions)) {
    return normalizeCollectionPayload(response, payload, 'requisitions', normalizePurchaseRequisition)
  }
  if (Array.isArray(payload.items) && !isPurchaseRequisitionEntity(payload)) {
    return normalizeCollectionPayload(response, payload, 'items', normalizePurchaseRequisition)
  }

  return { ...response, data: normalizePurchaseRequisition(payload) }
}

