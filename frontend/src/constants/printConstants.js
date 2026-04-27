/**
 * printConstants.js
 * @description 常量定义文件
  * @date 2025-08-27
 * @version 1.0.0
 */

// 打印模块相关常量定义

// 纸张大小选项
export const PAPER_SIZE_OPTIONS = [
  { label: 'A4', value: 'A4' },
  { label: 'A5', value: 'A5' },
  { label: 'A3', value: 'A3' },
  { label: 'Letter', value: 'Letter' },
  { label: 'Legal', value: 'Legal' }
];

// 打印方向选项
export const ORIENTATION_OPTIONS = [
  { label: '纵向', value: 'portrait' },
  { label: '横向', value: 'landscape' }
];

// 状态选项
export const STATUS_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 }
];

// 模块选项
export const MODULE_OPTIONS = [
  { label: '销售管理', value: 'sales' },
  { label: '采购管理', value: 'purchase' },
  { label: '库存管理', value: 'inventory' },
  { label: '生产管理', value: 'production' },
  { label: '质量管理', value: 'quality' },
  { label: '财务管理', value: 'finance' }
];

// 模板类型选项
export const TEMPLATE_TYPE_OPTIONS = [
  { label: '销售订单', value: 'sales_order' },
  { label: '采购订单', value: 'purchase_order' },
  { label: '入库单', value: 'inbound' },
  { label: '出库单', value: 'outbound' },
  { label: '销售出库单', value: 'sales_outbound' },
  { label: '生产出库单', value: 'production_outbound' },
  { label: '生产任务单', value: 'production_task' },
  { label: '质检单', value: 'quality_inspection' },
  { label: '来料检验单', value: 'incoming_inspection' },
  { label: '过程检验单', value: 'process_inspection' },
  { label: '首件检验单', value: 'first_article_inspection' },
  { label: '成品检验单', value: 'final_inspection' },
  { label: '销售发票', value: 'invoice' },
  { label: '采购发票', value: 'ap_invoice' },
  { label: '银行存款日记账', value: 'bank_statement' },
  { label: '现金日记账', value: 'cash_statement' },
  { label: '收款凭证', value: 'ar_receipt' },
  { label: '付款凭证', value: 'ap_payment' },
  { label: '库存明细', value: 'inventory_stock' },
  { label: '库存调拨单', value: 'transfer' },
  { label: '销售退货单', value: 'sales_return' },
  { label: '采购申请单', value: 'purchase_requisition' }
];

// 默认边距设置
export const DEFAULT_MARGINS = {
  top: 10,
  right: 10,
  bottom: 10,
  left: 10
};

// 默认打印设置
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
};

// 默认模板设置
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
};

// 文件上传限制
export const UPLOAD_LIMITS = {
  logo: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['jpg', 'jpeg', 'png', 'gif'],
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif']
  }
};

// 表单验证规则
export const VALIDATION_RULES = {
  printSetting: {
    name: [
      { required: true, message: '请输入设置名称', trigger: 'blur' }
    ],
    default_paper_size: [
      { required: true, message: '请选择默认纸张大小', trigger: 'change' }
    ],
    default_orientation: [
      { required: true, message: '请选择默认打印方向', trigger: 'change' }
    ]
  },
  template: {
    name: [
      { required: true, message: '请输入模板名称', trigger: 'blur' }
    ],
    module: [
      { required: true, message: '请选择所属模块', trigger: 'change' }
    ],
    template_type: [
      { required: true, message: '请选择模板类型', trigger: 'change' }
    ],
    content: [
      { required: true, message: '请输入模板内容', trigger: 'blur' }
    ]
  }
};

// 分页配置
export const PAGINATION_CONFIG = {
  defaultPage: 1,
  defaultPageSize: 10,
  pageSizes: [10, 20, 50, 100],
  layout: 'total, sizes, prev, pager, next, jumper'
};

// API路径
export const API_PATHS = {
  settings: '/print/settings',
  templates: '/print/templates',
  uploadLogo: '/print/upload/logo'
};

// 预览数据模板
export const PREVIEW_DATA = {
  ar_receipt: {
    receipt_number: 'REC-20260117001',
    receipt_date: '2026-01-17',
    customer_name: '测试客户科技发展有限公司',
    payment_method: '银行转账',
    bank_account_name: '工商银行基本户',
    bank_account_number: '6222081234567890',
    amount: '56,000.00',
    amount_upper: '伍万陆仟元整',
    invoice_number: 'INV-20251230005',
    notes: '测试收款凭证打印功能',
    operator: '张财务',
    print_time: '2026-01-17 11:30:00'
  },
  ap_payment: {
    payment_number: 'PAY-20260117001',
    payment_date: '2026-01-17',
    supplier_name: '测试供应商物资有限公司',
    payment_method: '银行转账',
    bank_account_name: '招商银行一般户',
    bank_account_number: '6225881234567890',
    amount: '32,500.00',
    amount_upper: '叁万贰仟伍佰元整',
    invoice_number: 'INV-20251215008',
    notes: '支付货款',
    operator: '李出纳',
    print_time: '2026-01-17 14:20:00'
  },
  sales_outbound: {
    outbound_no: 'SO-2023120001',
    order_no: 'SO-2023110001',
    customer_name: '示例客户公司',
    delivery_date: '2023-12-01',
    contact: '张三',
    phone: '13812345678',
    address: '上海市浦东新区张江高科技园区博云路123号',
    remarks: '样品测试，请小心处理',
    items: [
      {
        index: 1,
        product_code: 'P001',
        product_name: '电子元件A',
        specification: '型号XYZ-123',
        quantity: 10,
        unit_name: '个'
      },
      {
        index: 2,
        product_code: 'P002',
        product_name: '电子元件B',
        specification: '型号ABC-456',
        quantity: 5,
        unit_name: '套'
      }
    ]
  },
  production_outbound: {
    outbound_no: 'OUT-SAMPLE-001',
    outbound_date: '2025-01-01',
    outbound_type_text: '生产出库',
    operator: '示例操作员',
    production_plan_code: 'PP-SAMPLE-001',
    status: '已完成',
    remark: '打印预览示例数据',
    items: [
      {
        index: 1,
        material_code: 'MAT-SAMPLE-001',
        material_name: '示例成品A',
        specification: '标准规格',
        quantity: 10,
        unit_name: '只',
        location_name: '成品仓库',
        isSubstitute: false
      },
      {
        index: '└',
        material_code: 'MAT-SAMPLE-002',
        material_name: '示例零件B',
        specification: '通用规格',
        quantity: 20,
        unit_name: '件',
        location_name: '零配件仓库',
        isSubstitute: true
      },
      {
        index: '└',
        material_code: 'MAT-SAMPLE-003',
        material_name: '示例零件C',
        specification: '通用规格',
        quantity: 5,
        unit_name: '件',
        location_name: '零配件仓库',
        isSubstitute: true
      },
      {
        index: 2,
        material_code: 'MAT-SAMPLE-004',
        material_name: '示例原材料D',
        specification: '标准规格',
        quantity: 100,
        unit_name: '只',
        location_name: '原材料仓库',
        isSubstitute: false
      }
    ]
  },
  sales_return: {
    return_no: 'RT-20260424001',
    return_date: '2026-04-24',
    customer_name: '示例客户公司',
    order_no: 'SO-20260420001',
    reason: '产品规格不符',
    operator: '张三',
    items: [
      { index: 1, material_code: 'M001', material_name: '示例产品A', specification: '型号XYZ', quantity: 5, unit_name: '个', remark: '外观缺陷' },
      { index: 2, material_code: 'M002', material_name: '示例产品B', specification: '型号ABC', quantity: 3, unit_name: '套', remark: '' }
    ]
  },
  purchase_requisition: {
    requisition_number: 'PR-20260424001',
    request_date: '2026-04-24',
    requester: '李四',
    status: '已提交',
    remarks: '紧急采购',
    items: [
      { index: 1, material_code: 'M001', material_name: '原材料A', specification: 'Ø30mm', quantity: 100, unit_name: '件', remark: '' },
      { index: 2, material_code: 'M002', material_name: '原材料B', specification: 'Ø50mm', quantity: 50, unit_name: '件', remark: '' }
    ]
  }
};

// 状态映射
export const STATUS_MAP = {
  1: { text: '启用', type: 'success' },
  0: { text: '禁用', type: 'danger' }
};

// 方向映射
export const ORIENTATION_MAP = {
  portrait: '纵向',
  landscape: '横向'
};

// 默认值映射
export const DEFAULT_MAP = {
  1: { text: '是', type: 'success' },
  0: { text: '否', type: 'info' }
};
