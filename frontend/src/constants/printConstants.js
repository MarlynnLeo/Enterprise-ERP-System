/**
 * 打印中心常量
 * 只保留打印中心的元数据、表单默认值和预览样例；业务打印内容以数据库模板为准。
 */

export const PAPER_SIZE_OPTIONS = [
  { label: 'A4', value: 'A4' },
  { label: 'A5', value: 'A5' },
  { label: 'A3', value: 'A3' },
  { label: 'Letter', value: 'Letter' },
  { label: 'Legal', value: 'Legal' },
  { label: '241mm x 93mm', value: '241mm 93mm' }
]

export const ORIENTATION_OPTIONS = [
  { label: '纵向', value: 'portrait' },
  { label: '横向', value: 'landscape' }
]

export const STATUS_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 }
]

export const PRINT_MODULES = [
  { label: '销售管理', value: 'sales' },
  { label: '采购管理', value: 'purchase' },
  { label: '库存管理', value: 'inventory' },
  { label: '生产管理', value: 'production' },
  { label: '质量管理', value: 'quality' },
  { label: '财务管理', value: 'finance' }
]

export const PRINT_TEMPLATE_TYPES = [
  { label: '销售订单', value: 'sales_order', module: 'sales' },
  { label: '销售出库单', value: 'sales_outbound', module: 'sales' },
  { label: '销售退货单', value: 'sales_return', module: 'sales' },
  { label: '采购订单', value: 'purchase_order', module: 'purchase' },
  { label: '采购申请单', value: 'purchase_requisition', module: 'purchase' },
  { label: '采购退货单', value: 'purchase_return', module: 'purchase' },
  { label: '入库单', value: 'inbound', module: 'inventory' },
  { label: '出库单', value: 'outbound', module: 'inventory' },
  { label: '生产出库单', value: 'production_outbound', module: 'inventory' },
  { label: '库存明细', value: 'inventory_stock', module: 'inventory' },
  { label: '库存调拨单', value: 'transfer', module: 'inventory' },
  { label: '生产任务单', value: 'production_task', module: 'production' },
  { label: '质检单', value: 'quality_inspection', module: 'quality' },
  { label: '来料检验单', value: 'incoming_inspection', module: 'quality' },
  { label: '过程检验单', value: 'process_inspection', module: 'quality' },
  { label: '首件检验单', value: 'first_article_inspection', module: 'quality' },
  { label: '成品检验单', value: 'final_inspection', module: 'quality' },
  { label: '成品合格证', value: 'final_inspection_certificate', module: 'quality' },
  { label: '8D报告', value: 'eight_d_report', module: 'quality' },
  { label: '销售发票', value: 'invoice', module: 'finance' },
  { label: '采购发票', value: 'ap_invoice', module: 'finance' },
  { label: '记账凭证', value: 'gl_voucher', module: 'finance' },
  { label: '利润表', value: 'income_statement', module: 'finance' },
  { label: '资产负债表', value: 'balance_sheet', module: 'finance' },
  { label: '出纳月报表', value: 'cash_flow_statement', module: 'finance' },
  { label: '现金流量表', value: 'standard_cash_flow', module: 'finance' },
  { label: '应收账龄分析表', value: 'ar_aging', module: 'finance' },
  { label: '应付账龄分析表', value: 'ap_aging', module: 'finance' },
  { label: '银行存款日记账', value: 'bank_statement', module: 'finance' },
  { label: '现金日记账', value: 'cash_statement', module: 'finance' },
  { label: '收款凭证', value: 'ar_receipt', module: 'finance' },
  { label: '付款凭证', value: 'ap_payment', module: 'finance' }
]

export const MODULE_OPTIONS = PRINT_MODULES
export const TEMPLATE_TYPE_OPTIONS = PRINT_TEMPLATE_TYPES

export const DEFAULT_MARGINS = {
  top: 10,
  right: 10,
  bottom: 10,
  left: 10
}

export const DEFAULT_PRINT_SETTING = {
  name: '',
  default_paper_size: 'A4',
  default_orientation: 'portrait',
  default_margin_top: DEFAULT_MARGINS.top,
  default_margin_right: DEFAULT_MARGINS.right,
  default_margin_bottom: DEFAULT_MARGINS.bottom,
  default_margin_left: DEFAULT_MARGINS.left,
  header_content: '',
  footer_content: '',
  company_logo: '',
  status: 1
}

export const DEFAULT_TEMPLATE = {
  name: '',
  module: '',
  template_type: '',
  content: '',
  paper_size: 'A4',
  orientation: 'portrait',
  margin_top: DEFAULT_MARGINS.top,
  margin_right: DEFAULT_MARGINS.right,
  margin_bottom: DEFAULT_MARGINS.bottom,
  margin_left: DEFAULT_MARGINS.left,
  is_default: 0,
  status: 1
}

export const UPLOAD_LIMITS = {
  logo: {
    maxSize: 5 * 1024 * 1024,
    allowedTypes: ['jpg', 'jpeg', 'png', 'gif'],
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif']
  }
}

export const VALIDATION_RULES = {
  printSetting: {
    name: [{ required: true, message: '请输入设置名称', trigger: 'blur' }],
    default_paper_size: [{ required: true, message: '请选择默认纸张大小', trigger: 'change' }],
    default_orientation: [{ required: true, message: '请选择默认打印方向', trigger: 'change' }]
  },
  template: {
    name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
    module: [{ required: true, message: '请选择所属模块', trigger: 'change' }],
    template_type: [{ required: true, message: '请选择模板类型', trigger: 'change' }],
    content: [{ required: true, message: '请输入模板内容', trigger: 'blur' }]
  }
}

export const PAGINATION_CONFIG = {
  defaultPage: 1,
  defaultPageSize: 10,
  pageSizes: [10, 20, 50, 100],
  layout: 'total, sizes, prev, pager, next, jumper'
}

export const API_PATHS = {
  settings: '/print/settings',
  templates: '/print/templates',
  uploadLogo: '/print/upload/logo'
}

export const PREVIEW_DATA = {
  sales_order: {
    company_name: '示例制造有限公司',
    order_no: 'SO-20260511001',
    order_date: '2026-05-11',
    delivery_date: '2026-05-20',
    customer_name: '示例客户有限公司',
    contact_phone: '13800000000',
    delivery_address: '上海市浦东新区示例路 88 号',
    total_amount: '12,800.00',
    remark: '标准销售订单打印预览',
    operator: '张三',
    items: [
      { index: 1, product_code: 'P-1001', product_name: '控制器组件', specification: 'K-100', quantity: '10.00', unit_name: '件', unit_price: '680.00', amount: '6,800.00' },
      { index: 2, product_code: 'P-1002', product_name: '传感器组件', specification: 'S-20', quantity: '20.00', unit_name: '件', unit_price: '300.00', amount: '6,000.00' }
    ]
  },
  inbound: {
    inbound_no: 'IN-20260511001',
    inbound_date: '2026-05-11',
    inbound_type: '采购入库',
    supplier_name: '示例供应商有限公司',
    location_name: '原材料仓',
    remark: '来料已检验合格',
    operator: '李四',
    items: [
      { index: 1, material_code: 'M-1001', material_name: '铜端子', specification: 'T2', quantity: '500.00', unit_name: '件', remark: '' },
      { index: 2, material_code: 'M-1002', material_name: '塑胶壳体', specification: '黑色', quantity: '300.00', unit_name: '件', remark: '' }
    ]
  },
  outbound: {
    outbound_no: 'OUT-20260511001',
    outbound_date: '2026-05-11',
    outbound_type: '生产领料',
    department: '装配车间',
    location_name: '原材料仓',
    remark: '按出库单明细发料',
    operator: '王五',
    items: [
      { index: 1, material_code: 'M-1001', material_name: '铜端子', specification: 'T2', quantity: '200.00', unit_name: '件' },
      { index: 2, material_code: 'M-1002', material_name: '塑胶壳体', specification: '黑色', quantity: '120.00', unit_name: '件' }
    ]
  },
  sales_outbound: {
    outbound_no: 'SOUT-20260511001',
    order_no: 'SO-20260501001',
    delivery_date: '2026-05-11',
    customer_name: '示例客户有限公司',
    contact: '张三',
    phone: '13800000000',
    address: '上海市浦东新区示例路 88 号',
    location_name: '成品仓',
    remarks: '按销售订单发货',
    items: [
      { index: 1, product_code: 'P-1001', product_name: '控制器组件', specification: 'K-100', quantity: '10.00', unit_name: '件', batch_no: 'B20260511001' }
    ]
  },
  production_outbound: {
    outbound_no: 'POUT-20260511001',
    outbound_date: '2026-05-11',
    outbound_type_text: '生产出库',
    operator: '王五',
    production_plan_code: 'PP-20260511001',
    status: '已完成',
    remark: '来源于净需求结果或已落表生产计划用料',
    print_time: '2026-05-11 16:30:00',
    items: [
      { index: 1, material_code: 'L2-1001', material_name: '半成品组件', specification: 'A 型', planned_quantity: '10.00', actual_quantity: '10.00', shortage_quantity: '0.00', quantity: '10.00', unit_name: '件', location_name: '半成品仓' },
      { index: 2, material_code: 'M-2001', material_name: '标准螺丝', specification: 'M3', planned_quantity: '40.00', actual_quantity: '38.00', shortage_quantity: '2.00', quantity: '38.00', unit_name: '件', location_name: '零件仓' }
    ]
  },
  inventory_stock: {
    stock_no: 'STOCK-20260511',
    stock_date: '2026-05-11',
    location_name: '原材料仓',
    filter_summary: '全部物料',
    operator: '仓管一',
    items: [
      { index: 1, material_code: 'M-1001', material_name: '铜端子', specification: 'T2', quantity: '1200.00', available_quantity: '1180.00', unit_name: '件', location_name: '原材料仓' },
      { index: 2, material_code: 'M-1002', material_name: '塑胶壳体', specification: '黑色', quantity: '800.00', available_quantity: '800.00', unit_name: '件', location_name: '原材料仓' }
    ]
  },
  transfer: {
    transfer_no: 'TRF-20260511001',
    transfer_date: '2026-05-11',
    from_location_name: '原材料仓',
    to_location_name: '生产线边仓',
    status: '已完成',
    operator: '仓管一',
    remark: '生产备料调拨',
    items: [
      { index: 1, material_code: 'M-1001', material_name: '铜端子', specification: 'T2', quantity: '200.00', unit_name: '件', remark: '' }
    ]
  },
  sales_return: {
    return_no: 'RT-20260511001',
    return_date: '2026-05-11',
    customer_name: '示例客户有限公司',
    order_no: 'SO-20260501001',
    reason: '规格不符',
    operator: '赵六',
    items: [
      { index: 1, material_code: 'P-1001', material_name: '控制器组件', specification: 'K-100', quantity: '2.00', unit_name: '件', remark: '待质检' }
    ]
  },
  purchase_order: {
    company_name: '示例制造有限公司',
    company_phone: '021-00000000',
    company_fax: '021-00000001',
    company_address: '上海市浦东新区示例路 88 号',
    order_number: 'PO-20260511001',
    order_no: 'PO-20260511001',
    order_date: '2026-05-11',
    expected_delivery_date: '2026-05-18',
    delivery_date: '2026-05-18',
    supplier_name: '示例供应商有限公司',
    contact_person: '供应商联系人',
    contact_phone: '13900000000',
    status: '已审核',
    notes: '标准采购订单预览',
    remark: '标准采购订单预览',
    subtotal: '8,000.00',
    tax_amount: '1,040.00',
    total_amount: '9,040.00',
    total_quantity: '300.00',
    print_time: '2026-05-11 16:30:00',
    items: [
      { index: 1, material_code: 'M-1001', material_name: '铜端子', specification: 'T2', unit: '件', unit_name: '件', quantity: '200.00', price: '10.00', unit_price: '10.00', total_price: '2,000.00', amount: '2,000.00', delivery_date: '2026-05-18' },
      { index: 2, material_code: 'M-1002', material_name: '塑胶壳体', specification: '黑色', unit: '件', unit_name: '件', quantity: '100.00', price: '60.00', unit_price: '60.00', total_price: '6,000.00', amount: '6,000.00', delivery_date: '2026-05-18' }
    ]
  },
  purchase_requisition: {
    requisition_number: 'PR-20260511001',
    request_date: '2026-05-11',
    requester: '李四',
    status: '已提交',
    remarks: '生产计划触发采购申请',
    items: [
      { index: 1, material_code: 'M-1001', material_name: '铜端子', specification: 'T2', quantity: '500.00', unit_name: '件', remark: '' }
    ]
  },
  purchase_return: {
    return_no: 'PRT-20260511001',
    return_date: '2026-05-11',
    receipt_no: 'RCV-20260510001',
    supplier_name: '示例供应商有限公司',
    warehouse_name: '原材料仓',
    operator: '采购一',
    status: '已确认',
    reason: '来料质量异常退货',
    total_amount: '2,260.00',
    print_time: '2026-05-11 16:30:00',
    items: [
      { index: 1, material_code: 'M-1001', material_name: '铜端子', specification: 'T2', received_quantity: '200.00', return_quantity: '20.00', unit_name: '件', unit_price: '10.00', amount: '200.00', return_reason: '尺寸超差' }
    ]
  },
  production_task: {
    task_no: 'TASK-20260511001',
    document_no: 'TASK-20260511001',
    date: '2026-05-11',
    status: '进行中',
    product_code: 'P-1001',
    product_name: '控制器组件',
    plan_quantity: '100.00',
    due_date: '2026-05-20',
    workshop: '装配车间',
    remark: '标准生产任务',
    items: [
      { index: 1, material_code: 'M-1001', material_name: '铜端子', specification: 'T2', quantity: '200.00', unit_name: '件', remark: '' }
    ]
  },
  quality_inspection: {
    qi_no: 'QI-20260511001',
    document_no: 'QI-20260511001',
    date: '2026-05-11',
    status: '合格',
    material_code: 'M-1001',
    material_name: '铜端子',
    supplier_name: '示例供应商有限公司',
    inspector: '质检一',
    remark: '抽检合格',
    items: [
      { index: 1, item_name: '外观', specification: '无毛刺/变形', quantity: '抽样 20', unit_name: '件', result: '合格', remark: '' }
    ]
  },
  incoming_inspection: {
    iqc_no: 'IQC-20260511001',
    document_no: 'IQC-20260511001',
    date: '2026-05-11',
    status: '合格',
    material_code: 'M-1001',
    material_name: '铜端子',
    supplier_name: '示例供应商有限公司',
    inspector: '质检一',
    remark: '来料检验合格',
    items: [
      { index: 1, item_name: '尺寸', specification: '图纸要求', quantity: '5', unit_name: '点', result: '合格', remark: '' }
    ]
  },
  process_inspection: {
    pqc_no: 'PQC-20260511001',
    document_no: 'PQC-20260511001',
    date: '2026-05-11',
    status: '合格',
    product_code: 'P-1001',
    product_name: '控制器组件',
    process_name: '装配',
    inspector: '质检二',
    remark: '过程巡检合格',
    items: [
      { index: 1, item_name: '装配扭矩', specification: '标准范围', quantity: '3', unit_name: '点', result: '合格', remark: '' }
    ]
  },
  first_article_inspection: {
    fai_no: 'FAI-20260511001',
    document_no: 'FAI-20260511001',
    date: '2026-05-11',
    status: '通过',
    product_code: 'P-1001',
    product_name: '控制器组件',
    inspector: '质检三',
    remark: '首件确认通过',
    items: [
      { index: 1, item_name: '关键尺寸', specification: '图纸要求', quantity: '1', unit_name: '件', result: '通过', remark: '' }
    ]
  },
  final_inspection: {
    fqc_no: 'FQC-20260511001',
    document_no: 'FQC-20260511001',
    date: '2026-05-11',
    status: '合格',
    product_code: 'P-1001',
    product_name: '控制器组件',
    inspector: '质检四',
    remark: '成品检验合格',
    items: [
      { index: 1, item_name: '功能测试', specification: '全部功能正常', quantity: '10', unit_name: '件', result: '合格', remark: '' }
    ]
  },
  final_inspection_certificate: {
    certificate_no: 'COC-20260511001',
    inspection_no: 'FQC-20260511001',
    product_code: 'P-1001',
    product_name: '控制器组件',
    batch_no: 'B20260511001',
    production_date: '2026-05-10',
    inspection_date: '2026-05-11',
    standard_type_text: '工厂标准',
    standard_no: 'Q/FQC-001',
    inspector: '质检四',
    issue_date: '2026-05-11',
    remark: '产品经成品检验合格，准予出货。'
  },
  eight_d_report: {
    report_no: '8D-20260511001',
    title: '客户反馈功能异常改善报告',
    ncp_no: 'NCP-20260511001',
    occurrence_date: '2026-05-10',
    defect_type: '功能异常',
    status: '进行中',
    current_phase: 'D4-D7整改',
    material_name: '控制器组件',
    customer_name: '示例客户有限公司',
    target_close_date: '2026-05-20',
    team_leader: '质量经理',
    team_members: '生产主管、工艺工程师、检验员',
    problem_description: '客户抽检发现控制器功能偶发异常。',
    quantity_affected: '12',
    containment_actions: '隔离同批次库存；追加全检；暂停发货。',
    root_cause: '测试治具触点磨损导致测试覆盖不足。',
    corrective_actions: '更换测试治具触点；增加治具点检频次；补充末检记录。',
    verification_method: '连续三批全检验证',
    verification_result: '通过',
    preventive_actions: '纳入设备点检计划并每周复核。',
    standardization: '更新检验作业指导书与点检表。',
    summary: '改善措施已执行并验证有效。',
    lessons_learned: '关键测试治具需要纳入预防性维护。',
    items: [
      { index: 1, phase: 'D1 团队', owner: '质量经理', action: '成立跨部门小组', result: '完成' },
      { index: 2, phase: 'D3 遏制', owner: '仓储/质量', action: '隔离库存并追加全检', result: '完成' }
    ]
  },
  gl_voucher: {
    entry_number: '记-202605-0001',
    entry_date: '2026-05-11',
    posting_date: '2026-05-11',
    document_type: '转账凭证',
    document_number: 'SO-20260511001',
    period_name: '2026-05',
    status: '已过账',
    description: '销售收入结转',
    total_debit: '11,300.00',
    total_credit: '11,300.00',
    created_by: '会计一',
    items: [
      { index: 1, account_code: '1122', account_name: '应收账款', description: '确认应收', debit_amount: '11,300.00', credit_amount: '-' },
      { index: 2, account_code: '6001', account_name: '主营业务收入', description: '销售收入', debit_amount: '-', credit_amount: '10,000.00' },
      { index: 3, account_code: '2221', account_name: '应交税费', description: '销项税额', debit_amount: '-', credit_amount: '1,300.00' }
    ]
  },
  income_statement: {
    report_period: '2026-05-01 至 2026-05-31',
    unit_text: '元',
    compare_period: '2026-04-01 至 2026-04-30',
    print_time: '2026-05-31 18:00:00',
    items: [
      { index: 1, name: '一、营业收入', row_num: '1', amount: '120,000.00', compare_amount: '100,000.00', change_amount: '20,000.00', change_rate: '20.00%' },
      { index: 2, name: '二、营业成本', row_num: '2', amount: '78,000.00', compare_amount: '66,000.00', change_amount: '12,000.00', change_rate: '18.18%' },
      { index: 3, name: '三、净利润', row_num: '3', amount: '26,000.00', compare_amount: '22,000.00', change_amount: '4,000.00', change_rate: '18.18%' }
    ]
  },
  balance_sheet: {
    report_date: '2026-05-31',
    compare_date: '2026-04-30',
    unit_text: '元',
    total_assets: '580,000.00',
    total_liabilities_equity: '580,000.00',
    print_time: '2026-05-31 18:00:00',
    items: [
      { index: 1, side: '资产', name: '货币资金', row_num: '1', amount: '180,000.00', compare_amount: '150,000.00', change_amount: '30,000.00' },
      { index: 2, side: '资产', name: '应收账款', row_num: '2', amount: '120,000.00', compare_amount: '110,000.00', change_amount: '10,000.00' },
      { index: 3, side: '负债和所有者权益', name: '应付账款', row_num: '30', amount: '90,000.00', compare_amount: '80,000.00', change_amount: '10,000.00' }
    ]
  },
  cash_flow_statement: {
    report_period: '2026年05月',
    unit_text: '元',
    total_income: '80,000.00',
    total_expense: '52,000.00',
    net_amount: '28,000.00',
    total_balance: '128,000.00',
    account_count: '2',
    print_time: '2026-05-31 18:00:00',
    items: [
      { index: 1, name: '现金', last_month_balance: '20,000.00', current_month_income: '10,000.00', current_month_expense: '5,000.00', current_month_balance: '25,000.00' },
      { index: 2, name: '银行存款', last_month_balance: '80,000.00', current_month_income: '70,000.00', current_month_expense: '47,000.00', current_month_balance: '103,000.00' }
    ]
  },
  standard_cash_flow: {
    report_period: '2026-05-01 至 2026-05-31',
    unit_text: '元',
    operating_cash_flow: '36,000.00',
    investing_cash_flow: '-8,000.00',
    financing_cash_flow: '0.00',
    net_cash_increase: '28,000.00',
    ending_cash: '128,000.00',
    print_time: '2026-05-31 18:00:00',
    items: [
      { index: 1, row_num: '1', name: '经营活动产生的现金流量净额', amount: '36,000.00', compare_amount: '30,000.00' },
      { index: 2, row_num: '2', name: '投资活动产生的现金流量净额', amount: '-8,000.00', compare_amount: '-5,000.00' },
      { index: 3, row_num: '3', name: '现金及现金等价物净增加额', amount: '28,000.00', compare_amount: '25,000.00' }
    ]
  },
  ar_aging: {
    report_date: '2026-05-31',
    entity_label: '客户',
    total_amount: '128,000.00',
    current_amount: '80,000.00',
    within_30_days: '26,000.00',
    days_31_to_60: '12,000.00',
    days_61_to_90: '6,000.00',
    over_90_days: '4,000.00',
    print_time: '2026-05-31 18:00:00',
    items: [
      { index: 1, entity_name: '示例客户有限公司', entity_type: '直销客户', total_amount: '80,000.00', current_amount: '50,000.00', within_30_days: '20,000.00', days_31_to_60: '6,000.00', days_61_to_90: '3,000.00', over_90_days: '1,000.00', overdue_ratio: '37.50%', contact_person: '张三', contact_phone: '13800000000' }
    ]
  },
  ap_aging: {
    report_date: '2026-05-31',
    entity_label: '供应商',
    total_amount: '96,000.00',
    current_amount: '',
    within_30_days: '60,000.00',
    days_31_to_60: '22,000.00',
    days_61_to_90: '9,000.00',
    over_90_days: '5,000.00',
    print_time: '2026-05-31 18:00:00',
    items: [
      { index: 1, entity_name: '示例供应商有限公司', entity_type: '生产物料', total_amount: '60,000.00', current_amount: '', within_30_days: '40,000.00', days_31_to_60: '12,000.00', days_61_to_90: '5,000.00', over_90_days: '3,000.00', overdue_ratio: '33.33%', contact_person: '李四', contact_phone: '13900000000' }
    ]
  },
  invoice: {
    invoice_number: 'INV-20260511001',
    invoice_date: '2026-05-11',
    customer_name: '示例客户有限公司',
    order_no: 'SO-20260501001',
    tax_rate: '13%',
    status: '已开票',
    subtotal: '10,000.00',
    tax_amount: '1,300.00',
    total_amount: '11,300.00',
    items: [
      { index: 1, item_code: 'P-1001', item_name: '控制器组件', specification: 'K-100', quantity: '10.00', unit_price: '1,000.00', tax_amount: '1,300.00', amount: '11,300.00' }
    ]
  },
  ap_invoice: {
    invoice_number: 'APINV-20260511001',
    invoice_date: '2026-05-11',
    supplier_name: '示例供应商有限公司',
    order_no: 'PO-20260501001',
    tax_rate: '13%',
    status: '已登记',
    subtotal: '8,000.00',
    tax_amount: '1,040.00',
    total_amount: '9,040.00',
    items: [
      { index: 1, material_code: 'M-1001', material_name: '铜端子', specification: 'T2', quantity: '200.00', unit_price: '10.00', tax_amount: '260.00', amount: '2,260.00' }
    ]
  },
  bank_statement: {
    company_name: '示例制造有限公司',
    accountName: '基本户',
    accountNumber: '****7890',
    printDate: '2026-05-11',
    totalIncome: '10,000.00',
    totalExpense: '0.00',
    finalBalance: '10,000.00',
    items: [
      { index: 1, transaction_date: '2026-05-11', counterparty: '示例客户', reference_number: 'REC-001', description: '销售收款', income_amount: '10,000.00', expense_amount: '-', balance: '10,000.00' }
    ]
  },
  cash_statement: {
    company_name: '示例制造有限公司',
    printDate: '2026-05-11',
    totalIncome: '0.00',
    totalExpense: '500.00',
    finalBalance: '-500.00',
    items: [
      { index: 1, transaction_date: '2026-05-11', reference_number: 'PAY-001', counterparty: '示例供应商', description: '现金付款', income_amount: '-', expense_amount: '500.00', balance: '-500.00' }
    ]
  },
  ar_receipt: {
    receipt_number: 'REC-20260511001',
    receipt_date: '2026-05-11',
    customer_name: '示例客户有限公司',
    payment_method: '银行转账',
    bank_account_name: '基本账户',
    bank_account_number: '**** **** **** 7890',
    amount: '56,000.00',
    amount_upper: '伍万陆仟元整',
    invoice_number: 'INV-20260501001',
    notes: '收款凭证打印预览',
    operator: '财务一',
    print_time: '2026-05-11 16:30:00'
  },
  ap_payment: {
    payment_number: 'PAY-20260511001',
    payment_date: '2026-05-11',
    supplier_name: '示例供应商有限公司',
    payment_method: '银行转账',
    bank_account_name: '一般账户',
    bank_account_number: '**** **** **** 7890',
    amount: '32,500.00',
    amount_upper: '叁万贰仟伍佰元整',
    invoice_number: 'PINV-20260501001',
    notes: '支付货款',
    operator: '财务二',
    print_time: '2026-05-11 16:30:00'
  }
}

export const STATUS_MAP = {
  1: { text: '启用', type: 'success' },
  0: { text: '禁用', type: 'danger' }
}

export const ORIENTATION_MAP = {
  portrait: '纵向',
  landscape: '横向'
}

export const DEFAULT_MAP = {
  1: { text: '是', type: 'success' },
  0: { text: '否', type: 'info' }
}
