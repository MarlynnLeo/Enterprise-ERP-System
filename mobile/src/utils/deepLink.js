/**
 * 移动端业务实体深链解析（全局搜索 / 通知 / 审批共用）
 * 仅映射移动端已有路由；PC-only 能力回落到模块首页
 */

/**
 * @param {string|null|undefined} type sourceType / relatedType / 搜索 type
 * @param {string|number|null|undefined} id
 * @param {object} [extra] link / linkParams / meta
 * @returns {{ path: string|null, reason?: string }}
 */
export function resolveMobileDeepLink(type, id, extra = {}) {
  const raw = String(type || '').trim()
  if (!raw && !extra.link) {
    return { path: null, reason: 'missing_type' }
  }

  // 后端若直接下发 link 路径，优先使用（仅允许站内相对路径）
  if (extra.link && typeof extra.link === 'string') {
    const link = extra.link.trim()
    if (link.startsWith('/') && !link.startsWith('//')) {
      return { path: link }
    }
  }

  const key = raw
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_')

  const nid = id != null && id !== '' ? String(id) : null
  const withId = (base, pathId = nid) => (pathId ? `${base}/${pathId}` : base)

  /** @type {Record<string, string|((id:string|null)=>string)>} */
  const map = {
    // 主数据
    material: (i) => withId('/basedata/materials', i),
    materials: (i) => withId('/basedata/materials', i),
    customer: (i) => withId('/basedata/customers', i),
    customers: (i) => withId('/basedata/customers', i),
    supplier: (i) => withId('/basedata/suppliers', i),
    suppliers: (i) => withId('/basedata/suppliers', i),
    location: (i) => withId('/basedata/locations', i),
    locations: (i) => withId('/basedata/locations', i),
    bom: (i) => withId('/basedata/boms', i),
    boms: (i) => withId('/basedata/boms', i),
    category: (i) => withId('/basedata/categories', i),
    unit: (i) => withId('/basedata/units', i),
    process_template: (i) => withId('/basedata/process-templates', i),

    // 销售
    order: (i) => withId('/sales/orders', i),
    sales_order: (i) => withId('/sales/orders', i),
    sales_orders: (i) => withId('/sales/orders', i),
    quotation: (i) => withId('/sales/quotations', i),
    sales_quotation: (i) => withId('/sales/quotations', i),
    sales_outbound: (i) => withId('/sales/outbound', i),
    sales_return: (i) => withId('/sales/returns', i),
    sales_exchange: (i) => withId('/sales/exchanges', i),

    // 采购
    purchase_order: (i) => withId('/purchase/orders', i),
    purchase_orders: (i) => withId('/purchase/orders', i),
    purchase_requisition: (i) => withId('/purchase/requisitions', i),
    purchase_receipt: (i) => withId('/purchase/receipts', i),
    purchase_return: (i) => withId('/purchase/returns', i),
    outsourced_processing: (i) => withId('/purchase/processing', i),

    // 库存
    inventory_inbound: (i) => withId('/inventory/inbound', i),
    inventory_outbound: (i) => withId('/inventory/outbound', i),
    inventory_transfer: (i) => withId('/inventory/transfer', i),
    inventory_check: (i) => withId('/inventory/check', i),
    stock: () => '/inventory/stock',

    // 生产
    task: (i) => withId('/production/tasks', i),
    production_task: (i) => withId('/production/tasks', i),
    production_plan: (i) => withId('/production/plans', i),
    plan: (i) => withId('/production/plans', i),
    anomaly: () => '/production/anomaly',
    anomaly_report: () => '/production/anomaly',

    // 品质
    inspection: (i) => withId('/quality/incoming', i),
    quality_inspection: (i) => withId('/quality/incoming', i),
    incoming_inspection: (i) => withId('/quality/incoming', i),
    process_inspection: (i) => withId('/quality/process', i),
    final_inspection: (i) => withId('/quality/final', i),
    nonconforming_product: (i) => withId('/quality/nonconformance', i),
    nonconformance: (i) => withId('/quality/nonconformance', i),

    // 财务
    ar_invoice: (i) => withId('/finance/ar/invoices', i),
    ar_receipt: (i) => withId('/finance/ar/receipts', i),
    ap_invoice: (i) => withId('/finance/ap/invoices', i),
    ap_payment: (i) => withId('/finance/ap/payments', i),
    cash_transaction: () => '/finance/cash/cash-transactions',
    bank_transaction: () => '/finance/cash/bank-transactions',
    gl_entry: (i) => withId('/finance/gl/entries', i),
    asset: (i) => withId('/finance/assets', i),

    // 设备 / 人事
    equipment: (i) => withId('/equipment/detail', i),
    employee: () => '/hr/employees',
    leave: () => '/hr/leave',
    hr_leave: () => '/hr/leave',
    overtime: () => '/hr/overtime',
    hr_overtime: () => '/hr/overtime',
    attendance: () => '/hr/attendance',

    // 审批 / 通知
    approval: () => '/workflow/approvals',
    workflow: () => '/workflow/approvals',
    workflow_instance: () => '/workflow/approvals',
    notification: (i) => withId('/system/notifications', i),
  }

  // 兼容 camelCase 类型名
  const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  const resolver = map[key] || map[camelKey]
  if (!resolver) {
    // 事件名映射：PRODUCTION_TASK_COMPLETED → production_task
    const eventKey = key
      .replace(/_completed$/, '')
      .replace(/_created$/, '')
      .replace(/_updated$/, '')
      .replace(/_failed$/, '')
      .replace(/^finance_/, '')
    const eventResolver = map[eventKey]
    if (eventResolver) {
      const path = typeof eventResolver === 'function' ? eventResolver(nid) : eventResolver
      return { path }
    }
    return { path: null, reason: `unsupported_type:${raw}` }
  }

  const path = typeof resolver === 'function' ? resolver(nid) : resolver
  return { path }
}

/**
 * 跳转；失败时 toast
 * @param {import('vue-router').Router} router
 * @param {(msg:string)=>void} toast
 */
export function navigateMobileDeepLink(router, toast, type, id, extra = {}) {
  const { path, reason } = resolveMobileDeepLink(type, id, extra)
  if (path) {
    router.push(path)
    return true
  }
  if (toast) {
    const tip =
      reason === 'missing_type'
        ? '该消息未关联业务单据'
        : '移动端暂无对应页面，请在 PC 端查看'
    toast(tip)
  }
  return false
}
