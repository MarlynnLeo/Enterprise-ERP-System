/**
 * 错误处理工具
 * @description 统一处理API错误和异常
 */

import { ElMessage } from 'element-plus/es/components/message/index'

const API_ERROR_CODE_MESSAGES = Object.freeze({
  INVALID_REQUEST: '请求参数有误，请检查后重试',
  INVALID_REQUEST_PATH: '请求路径无效，请检查后重试',
  BAD_REQUEST: '请求参数有误，请检查后重试',
  VALIDATION_ERROR: '提交内容有误，请检查后重试',
  CONFLICT: '当前数据已发生变化，请刷新后重试',
  SERVER_ERROR: '服务器暂时不可用，请稍后重试',
  INTERNAL_ERROR: '服务器暂时不可用，请稍后重试',
  WORKFLOW_CONFIG_ERROR: '审批流程未配置完整，请联系管理员',
  INVALID_CSRF_TOKEN: '安全令牌已过期，请刷新页面后重试',
  NOT_FOUND: '请求的数据不存在或已被删除',
  UNAUTHORIZED: '登录已过期，请重新登录',
  FORBIDDEN: '您没有权限执行此操作',
  INVALID_REFRESH_TOKEN: '登录状态已失效，请重新登录',
  TOKEN_EXPIRED: '登录已过期，请重新登录',
  DUPLICATE: '数据已存在，请检查后重试',
  RATE_LIMIT_EXCEEDED: '操作过于频繁，请稍后重试',
  EXCESS_ISSUE: '存在超额领料，请确认后重试',
  MISSING_ISSUE_REASON: '请填写超额领料原因',
  PAYMENT_APPROVAL_REQUIRED: '该付款记录需要审批后才能提交',
  OPERATION_ERROR: '操作失败，请稍后重试',
  BUSINESS_ERROR: '业务操作失败，请检查后重试',
  INVALID_MATERIAL: '所选物料无效，请重新选择',
  INVALID_LOCATION: '所选库位无效，请重新选择',
  INVALID_FILE_TYPE: '文件类型不支持，请选择允许的文件',
  INSUFFICIENT_STOCK: '库存不足，请调整数量后重试',
  ER_DUP_ENTRY: '数据已存在，请检查后重试',
  DUPLICATE_ENTRY: '数据已存在，请检查后重试',
  FOREIGN_KEY_ERROR: '存在关联数据，无法完成操作',
  REFRESH_TOKEN_BUSY: '登录状态正在更新，请稍后重试',
  NETWORK_ERROR: '网络连接失败，请检查网络设置',
  ERR_NETWORK: '网络连接失败，请检查网络设置',
  ECONNABORTED: '请求超时，请稍后重试'
})

const KNOWN_ERROR_MESSAGES = Object.freeze([
  [/^NCP not found$/i, '不合格品单不存在或已被删除'],
  [/^NCP already completed or closed$/i, '该不合格品单已完结，无法继续操作'],
  [/^Handled quantity must be greater than 0$/i, '处理数量必须大于0'],
  [/^Handled quantity exceeds NCP quantity/i, '处理数量不能超过不合格品数量'],
  [/^Invalid concession approval status$/i, '特采审批状态无效'],
  [/^Inspection not found$/i, '检验单不存在或已被删除'],
  [/^Inventory check not found$/i, '盘点单不存在或已被删除'],
  [/^Material not found$/i, '所选物料不存在或已停用'],
  [/^Production process not found$/i, '生产工序不存在或已被删除'],
  [/^Production task not found$/i, '生产任务不存在或已被删除'],
  [/^Sales order not found$/i, '销售订单不存在或已被删除'],
  [/^(?:sales quotation|quotation) not found$/i, '销售报价单不存在或已被删除'],
  [/^8D report not found$/i, '8D报告不存在或已被删除'],
  [/^Customer not found$/i, '客户不存在或已被删除'],
  [/^AQL Standard not found$/i, 'AQL抽样标准不存在或已被删除'],
  [/^Version not found$/i, '成本版本不存在或已被删除'],
  [/^Accounting period not found$/i, '会计期间不存在或已被删除'],
  [/^Tax return does not exist$/i, '税务申报不存在或已被删除'],
  [/^(?:Cash transaction|Bank transaction) does not exist$/i, '资金交易不存在或已被删除'],
  [/^Workflow template not found$/i, '审批流程模板不存在或已被删除'],
  [/^Business document not found(?:\s*\[[^\]]+\])?$/i, '业务单据不存在或已被删除'],
  [/^Invalid outbound item quantity$/i, '出库明细数量无效，请检查后重试'],
  [/^以下产品ID在物料表中不存在.*$/i, '所选产品不存在或已停用，请重新选择有效产品'],
  [/^以下物料(?:ID)?在物料表中不存在.*$/i, '所选物料不存在或已停用，请重新选择有效物料'],
  [/^(?:物料|material)(?:\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+|\s+[\w-]+)?\s*(?:不存在|无效|已删除|已停用|not found).*$/i, '所选物料不存在或已停用，请重新选择有效物料'],
  [/^(?:产品|成品|product)(?:\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+|\s+[\w-]+)?\s*(?:不存在|无效|已删除|已停用|not found).*$/i, '所选产品不存在或已停用，请重新选择有效产品'],
  [/^(?:库位|仓库|location|warehouse)(?:\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+|\s+[\w-]+)?\s*(?:不存在|无效|已删除|已停用|not found).*$/i, '所选库位不存在或已停用，请重新选择有效库位'],
  [/^(?:发票|invoice)(?:\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+|\s+[\w-]+)?\s*(?:不存在|无效|已删除|已停用|not found).*$/i, '发票不存在或已被删除'],
  [/^purchase requisition not found/i, '采购申请不存在或已被删除'],
  [/^purchase requisition .* cannot be linked/i, '当前采购申请状态不允许生成采购订单'],
  [/^purchase requisition .* has no material items/i, '采购申请没有有效的物料明细'],
  [/^purchase order not found$/i, '采购订单不存在或已被删除'],
  [/^purchase order\s+[\w-]+\s+not found$/i, '采购订单不存在或已被删除'],
  [/^Opening balance list cannot be empty$/i, '期初余额明细不能为空'],
  [/^Opening balance list contains duplicate accounts$/i, '期初余额明细中存在重复科目'],
  [/^Opening balances must remain balanced/i, '期初余额借贷必须保持平衡'],
  [/^Opening balances are not balanced/i, '期初余额借贷不平衡'],
  [/^余额日期不是有效日期(?:（invalid date）)?$/i, '余额日期不是有效日期'],
  [/^手工期初余额金额必须为非负数(?:（non-negative）)?$/i, '手工期初余额金额必须为非负数'],
  [/^Invalid pagination parameters$/i, '分页参数无效'],
  [/^Invalid input detected$/i, '请求参数有误，请检查后重试'],
  [/^Invalid request path$/i, '请求路径无效，请检查后重试'],
  [/^File type not allowed$/i, '文件类型不支持，请选择允许的文件'],
  [/^NCP has downstream documents and cannot be deleted$/i, '不合格品单已有下游单据，无法删除'],
  [/^Asset impairment is missing required GL accounts/i, '资产减值缺少必要的会计科目配置，请联系管理员'],
  [/^Current exchange status cannot be deleted$/i, '当前换货单状态不允许删除'],
  [/^Missing required fields:/i, '提交内容不完整，请补充必填项'],
  [/^Location code .* already exists$/i, '库位编码已存在，请更换后重试'],
  [/^No reservation consumption required$/i, '当前没有需要处理的库存预留'],
  [/^Request failed with status code \d+$/i, '请求失败，请稍后重试'],
  [/^Network Error$/i, '网络连接失败，请检查网络设置'],
  [/^timeout of .* exceeded$/i, '请求超时，请稍后重试'],
  [/^(?:socket hang up|ECONNRESET|ETIMEDOUT)$/i, '网络连接异常，请稍后重试']
])

const TECHNICAL_MESSAGE_REPLACEMENTS = Object.freeze([
  [/^无效的资产ID$/i, '请选择有效的资产'],
  [/^无效的类别ID$/i, '请选择有效的资产类别'],
  [/^无效的工程ID$/i, '请选择有效的在建工程'],
  [/^无效的盘点单ID$/i, '请选择有效的盘点单'],
  [/^无效的发票ID$/i, '请选择有效的发票'],
  [/^无效的付款记录ID$/i, '请选择有效的付款记录'],
  [/^无效的收款记录ID$/i, '请选择有效的收款记录'],
  [/^无效的交易ID$/i, '请选择有效的交易记录'],
  [/^无效的入库单ID$/i, '请选择有效的入库单'],
  [/^无效的出库单ID$/i, '请选择有效的出库单'],
  [/^无效的位置ID$/i, '请选择有效的库位'],
  [/^调拨单ID无效$/i, '请提供有效的调拨单'],
  [/^委外入库单ID无效$/i, '请选择有效的委外入库单'],
  [/^无效的对账ID$/i, '请选择有效的对账单'],
  [/^期间ID无效$/i, '请选择有效的会计期间'],
  [/^期间ID不能为空$/i, '请选择会计期间'],
  [/^标准成本ID不能为空$/i, '请选择标准成本版本'],
  [/^生产任务ID不能为空$/i, '请选择生产任务'],
  [/^生产任务ID和物料列表不能为空$/i, '请选择生产任务并填写物料明细'],
  [/^任务ID不能为空$/i, '请选择生产任务'],
  [/^客户ID不能为空$/i, '请选择客户'],
  [/^设备ID不能为空$/i, '请选择设备'],
  [/^报警ID不能为空$/i, '请选择报警记录'],
  [/^产品ID为必填项$/i, '请选择产品'],
  [/^BOM\s*ID是必需的$/i, '请选择BOM'],
  [/^业务类型和业务\s*ID\s*必须成对提供$/i, '请同时提供业务类型和业务单据'],
  [/^business_type and business_id are required$/i, '请同时提供业务类型和业务单据'],
  [/^Unsupported business_type$/i, '业务类型不受支持'],
  [/^status is required$/i, '请选择状态'],
  [/^invalid status(?: format)?$/i, '状态参数无效'],
  [/^Only draft ECN can be edited$/i, '只有草稿状态的ECN可以编辑'],
  [/^ECN not found$/i, 'ECN不存在或已被删除'],
  [/^Version number already exists$/i, '版本号已存在'],
  [/^Only draft versions can be submitted$/i, '只有草稿状态的成本版本可以提交'],
  [/^Only draft versions can generate cost rows$/i, '只有草稿状态的成本版本可以生成成本明细'],
  [/^No valid fields to (?:create|update)$/i, '没有可保存的有效内容'],
  [/^No permission to .+$/i, '您没有权限执行此操作'],
  [/^Document link permission check failed$/i, '单据关联权限校验失败'],
  [/^purchase order not found$/i, '采购订单不存在或已被删除'],
  [/^failed to load latest prices?$/i, '获取最新采购价格失败，请稍后重试'],
  [/^Dingtalk deptId must be configured or provided$/i, '钉钉部门信息未配置，请联系管理员'],
  [/^Invalid log path$/i, '日志路径无效']
])

const ERROR_CODE_PATTERN = new RegExp(
  `\\b(?:${Object.keys(API_ERROR_CODE_MESSAGES)
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'g'
)

const replaceTechnicalErrorFragments = (message) => {
  let normalized = String(message || '')
    .replace(/^AxiosError:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/\bRequest failed with status code \d+\b/gi, '请求失败，请稍后重试')
    .replace(/\b(?:Internal Server Error|Server Error)\b/gi, '服务器暂时不可用，请稍后重试')
    .replace(/\bNetwork Error\b/gi, '网络连接失败，请检查网络设置')
    .replace(/\b(?:Unauthorized|Forbidden|Not Found)\b/gi, (value) => {
      const messages = {
        Unauthorized: API_ERROR_CODE_MESSAGES.UNAUTHORIZED,
        Forbidden: API_ERROR_CODE_MESSAGES.FORBIDDEN,
        'Not Found': API_ERROR_CODE_MESSAGES.NOT_FOUND
      }
      return messages[value] || value
    })

  for (const [pattern, replacement] of TECHNICAL_MESSAGE_REPLACEMENTS) {
    if (pattern.test(normalized)) {
      normalized = normalized.replace(pattern, replacement)
      break
    }
  }

  const idMessageMatch = normalized.match(
    /^(?:缺少|未提供|无效的|请选择有效的|请提供有效的)?\s*(.+?)\s*ID(?:参数|数组)?\s*(?:(?:为|是)?(?:必填项|必需的|不能为空|无效|缺失))?$/i
  )
  if (idMessageMatch) {
    const entity = idMessageMatch[1].replace(/^有效的/, '').trim()
    const entityLabels = {
      用户: '用户信息', 资产: '资产', 类别: '资产类别', 工程: '在建工程', 盘点单: '盘点单',
      发票: '发票', 付款记录: '付款记录', 收款记录: '收款记录', 交易: '交易记录', 银行账户: '银行账户',
      对账: '对账单', 银行对账单明细: '银行对账单明细', 期间: '会计期间', 会计期间: '会计期间',
      标准成本: '标准成本版本', 凭证: '凭证', 产品: '产品', 客户: '客户', 物料: '物料',
      任务: '生产任务', 生产任务: '生产任务', 工序: '工序', 调拨单: '调拨单', 入库单: '入库单',
      出库单: '出库单', 委外入库单: '委外入库单', 采购订单: '采购订单', 采购申请: '采购申请',
      费用: '费用记录', 配置: '配置', 台账: '库存台账'
    }
    normalized = `请选择有效的${entityLabels[entity] || entity}`
  } else if (/^生产任务ID无效或超过批量上限/i.test(normalized)) {
    normalized = '请选择有效的生产任务，且一次最多处理100条'
  }

  normalized = normalized.replace(ERROR_CODE_PATTERN, (code) => API_ERROR_CODE_MESSAGES[code] || code)

  // 统一去掉历史文案中的内部 ID 字样；可识别的物料编码不在这些模式中。
  normalized = normalized.replace(
    /(物料|产品|成品|库位|仓库|供应商|客户|订单|采购申请|采购订单|入库单|出库单|检验单|生产任务|BOM|附件|用户|角色|部门|方案|账户|银行账户)\s*(?:ID|id|_id)\b/gi,
    '$1'
  )
  normalized = normalized.replace(/\b(?:ERR_[A-Z0-9_]+|[A-Z][A-Z0-9_]*_ERROR)\b/g, '操作失败')

  return normalized
}

const INTERNAL_ID_MESSAGE_PATTERNS = [
  { pattern: /(?:material|product|location|warehouse|supplier)_(?:id)\s*[:=]?\s*[\w-]+/gi, label: '相关基础资料' },
  { pattern: /(?:material|product|location|warehouse|supplier|customer|asset|order|receipt|outbound|return|invoice|inspection|task|plan|bom|bank_account|account)(?:Id|ID)\s*[:=]?\s*[\w-]+/g, label: '相关业务数据' },
  { pattern: /(?:material|product|location|warehouse|supplier|customer|asset|order|receipt|outbound|return|invoice|inspection|task|plan)\s+(?:with\s+)?id\s*[:=]?\s*[\w-]+/gi, label: '相关业务数据' },
  { pattern: /(?:material|product|location|warehouse|supplier|customer|asset|order|receipt|outbound|return|invoice|inspection|task|plan)\s*[:=]\s*[\w-]+/gi, label: '相关业务数据' },
  { pattern: /(?:物料|产品|成品|库位|仓库|供应商|客户|资产|订单|采购申请|采购订单|采购入库单|收货单|入库单|生产入库单|出库单|销售出库单|退货单|换货单|发票|检验单|生产任务|任务|工序|BOM)\s*[：:]?\s*\d+(?=\s|[，。,:：；;]|$)/gi, label: '相关业务数据' },
  { pattern: /(?:物料|material)\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+/gi, label: '所选物料' },
  { pattern: /(?:物料|material)\s*(?:ID|id|_id)\b/gi, label: '物料' },
  { pattern: /(?:物料|material)\s*#\s*[\w-]+/gi, label: '所选物料' },
  { pattern: /(?:产品|成品|product)\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+/gi, label: '所选产品' },
  { pattern: /(?:产品|成品|product)\s*#\s*[\w-]+/gi, label: '所选产品' },
  { pattern: /(?:库位|仓库|location|warehouse)\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+/gi, label: '所选库位' },
  { pattern: /(?:库位|仓库|location|warehouse)\s*#\s*[\w-]+/gi, label: '所选库位' },
  { pattern: /(?:供应商|supplier)\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+/gi, label: '所选供应商' },
  { pattern: /(?:资产|盘点单|工程|项目|客户|订单|采购申请|采购订单|收货单|入库单|出库单|退货单|换货单|发票|银行账户|科目|检验单|BOM|用户|菜单)\s*(?:ID|id|_id)\s*(?:为|是)?\s*[:：=#]?\s*[\w-]+/gi, label: '相关业务数据' },
  { pattern: /\(\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+\s*\)/gi, label: '' },
  { pattern: /(?:ID|id|_id)\s*[:：=#]\s*[\w-]+/gi, label: '相关业务数据' },
  { pattern: /ID\s*为\s*[\w-]+\s*的(?:资产|盘点单|在建工程|项目|订单|发票|科目)/gi, label: '相关业务数据' },
  { pattern: /(?:物料|产品|成品|库位|仓库|供应商|客户|资产|订单|采购申请|采购订单|收货单|入库单|出库单|退货单|换货单|发票|检验单|生产任务|任务|工序|BOM)\s*(?:ID|id|_id)\b/gi, label: '相关业务数据' },
  { pattern: /(?:ID|id|_id)\s*列表/gi, label: '标识列表' }
]

const asErrorMessage = (value) => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!value || typeof value !== 'object') return ''
  return asErrorMessage(value.message || value.msg || value.error)
}

const isTechnicalMessage = (message) => (
  !message ||
  message === '[object Object]' ||
  message === 'undefined' ||
  message === 'null' ||
  /^\d+$/.test(message) ||
  /^([A-Z][A-Z0-9_]+|ERR_[A-Z0-9_]+)$/.test(message) ||
  /^Request failed with status code \d+$/.test(message) ||
  /^(?:Error:\s*)?(Network Error|Unauthorized|Forbidden|Not Found)$/i.test(message)
)

const normalizeUserMessage = (message, fallback) => {
  const trimmed = String(message || '').trim()
  if (isTechnicalMessage(trimmed)) return ''

  // 兼容旧页面把操作上下文和后端采购申请错误拼成一条字符串的情况。
  // 物料编码可以展示，纯数字通常是数据库 ID，不能直接回显。
  const legacyRequisitionMaterialWithContext = trimmed.match(
    /请购物料不存在或已停用[：:]\s*([^。；;，,\s]+)/
  )
  if (legacyRequisitionMaterialWithContext) {
    const materialCode = legacyRequisitionMaterialWithContext[1].trim()
    const detail = /^\d+$/.test(materialCode)
      ? '申请单中的失效物料已不存在或已停用，请编辑申请单后重新选择有效物料。'
      : `申请单中的物料编码“${materialCode}”已不存在或已停用，请编辑申请单后重新选择有效物料。`
    const prefix = trimmed.slice(0, legacyRequisitionMaterialWithContext.index).trim().replace(/[：:]\s*$/, '')
    return prefix ? `${prefix}：${detail}` : detail
  }

  const requisitionMaterialWithContext = trimmed.match(
    /申请单中的物料编码“([^”]+)”已不存在或已停用，请编辑申请单后重新选择有效物料。?/
  )
  if (requisitionMaterialWithContext) {
    const prefix = trimmed.slice(0, requisitionMaterialWithContext.index).trim().replace(/[：:]\s*$/, '')
    const detail = `申请单中的物料编码“${requisitionMaterialWithContext[1]}”已不存在或已停用，请编辑申请单后重新选择有效物料。`
    return prefix ? `${prefix}：${detail}` : detail
  }

  const requisitionMaterialMatch = trimmed.match(
    /^(?:请购物料不存在或已停用：[^。]+。)?申请单中的物料编码“([^”]+)”已不存在或已停用，请编辑申请单后重新选择有效物料。?$/
  )
  if (requisitionMaterialMatch) {
    return `申请单中的物料编码“${requisitionMaterialMatch[1]}”已不存在或已停用，请编辑申请单后重新选择有效物料。`
  }

  const legacyRequisitionMaterialMatch = trimmed.match(
    /^请购物料不存在或已停用[：:]\s*(.+?)\s*[。.]?$/
  )
  if (legacyRequisitionMaterialMatch) {
    const materialCode = legacyRequisitionMaterialMatch[1].trim()
    // 旧接口只返回数字时，这个值通常是数据库 ID；无法反查编码时也不能
    // 把内部标识再次展示给用户。新接口会优先返回真实物料编码。
    if (/^\d+$/.test(materialCode)) {
      return '申请单中的失效物料已不存在或已停用，请编辑申请单后重新选择有效物料。'
    }
    return `申请单中的物料编码“${materialCode}”已不存在或已停用，请编辑申请单后重新选择有效物料。`
  }

  const candidates = [trimmed]
  const separatorIndex = Math.max(trimmed.lastIndexOf('：'), trimmed.lastIndexOf(':'))
  if (separatorIndex >= 0) candidates.push(trimmed.slice(separatorIndex + 1).trim())
  const knownMessage = KNOWN_ERROR_MESSAGES.find(([pattern]) => candidates.some((candidate) => pattern.test(candidate)))
  if (knownMessage) return knownMessage[1]

  let normalized = replaceTechnicalErrorFragments(trimmed)
  normalized = normalized
    .replace(/(采购入库单|生产入库单|销售出库单|采购订单|采购申请|销售订单|入库单|出库单|检验单|生产任务|库存台账|银行账户|资产|发票|BOM)\s*(?:ID\s*)?(不存在|已被删除|已删除|无效)\s*[：:]\s*[\w-]+/gi, '$1$2')
    .replace(/(采购入库单|生产入库单|销售出库单|采购订单|采购申请|销售订单|入库单|出库单|检验单|生产任务|库存台账|银行账户|资产|发票|BOM)\s*(?:ID\s*)?[\w-]+(?=\s*(?:的|中|没有|无|缺少|已|状态|不存在|未|不能|无法))/gi, '$1')
    .replace(/(关联销售订单|销售订单)\s*[\w-]+(?=\s*(?:不存在|已删除|缺少))/gi, '$1')
    .replace(/\s+(?=的|中|没有|无|缺少|不存在|已|未|不能|无法)/g, '')
  INTERNAL_ID_MESSAGE_PATTERNS.forEach(({ pattern, label }) => {
    normalized = normalized.replace(pattern, label)
  })
  normalized = normalized
    .replace(/^Error:\s*/i, '')
    .replace(/\bNetwork Error\b/gi, '网络连接失败，请检查网络设置')
    .replace(/\b(?:ECONNABORTED|ETIMEDOUT)\b/gi, '网络连接异常，请稍后重试')
    .replace(/\bERR_NETWORK\b/gi, '网络连接失败，请检查网络设置')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([，。,:：；;])/g, '$1')
    .trim()

  // 混合了中文前缀和英文内部异常时，不能把英文实现细节原样展示给用户。
  if (/\b(?:invalid|not found|failed|failure|error|exception|unauthorized|forbidden|missing|required|cannot|unable|must be)\b/i.test(normalized)) {
    return ''
  }

  // 英文内部异常只适合写入日志，不应直接出现在中文用户界面。
  if (!/[\u3400-\u9fff]/.test(normalized) && /^[\x00-\x7F]+$/.test(normalized)) {
    return ''
  }
  return normalized || fallback
}

/**
 * 提取接口返回给用户看的错误信息。
 * 后端在开发环境可能同时返回 errorCode、error 对象和 message，
 * 页面不能直接把 error 对象或错误代码拼接到提示中。
 */
export const getApiErrorMessage = (error, fallback = '未知错误') => {
  if (typeof error === 'string') {
    const message = error.trim()
    return API_ERROR_CODE_MESSAGES[message] || normalizeUserMessage(message, fallback) || fallback
  }

  const responseData = error?.response?.data
  const code = responseData?.errorCode || responseData?.code || error?.code
  const normalizedCode = code == null ? '' : String(code)
  const backendMessage = [
    responseData?.message,
    responseData?.error,
    responseData?.msg,
    error?.message,
    error?.error,
    error?.msg
  ].map(asErrorMessage).map((message) => normalizeUserMessage(message, '')).find(Boolean)

  if (backendMessage) return backendMessage
  if (normalizedCode && API_ERROR_CODE_MESSAGES[normalizedCode]) {
    return API_ERROR_CODE_MESSAGES[normalizedCode]
  }

  const status = error?.response?.status
  if (status === 400) return '请求参数有误，请检查后重试'
  if (status === 401) return '登录已过期，请重新登录'
  if (status === 403) return '您没有权限执行此操作'
  if (status === 404) return '请求的数据不存在或已被删除'
  if (status >= 500) return '服务器暂时不可用，请稍后重试'
  if (error?.code === 'NETWORK_ERROR' || error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
    return '网络连接失败，请检查网络设置'
  }

  return fallback
}

/**
 * 解析错误信息
 * @param {Error} error - 错误对象
 * @returns {string} 解析后的错误信息
 */
const parseErrorMessage = (error) => {
  const errorMsg = getApiErrorMessage(error)

  // 识别特定错误类型并提供友好提示
  if (errorMsg.includes('Duplicate entry') || errorMsg.includes('unique violation')) {
    return '数据重复，请检查输入内容'
  }

  if (errorMsg.includes('foreign key constraint') || errorMsg.includes('violates foreign key')) {
    return '存在关联数据，无法删除'
  }

  if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
    return '请求超时，请检查网络连接后重试'
  }

  if (errorMsg.includes('Network Error') || errorMsg.includes('ERR_NETWORK')) {
    return '网络连接失败，请检查网络设置'
  }

  if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
    return '登录已过期，请重新登录'
  }

  if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
    return '没有权限执行此操作'
  }

  if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
    return '请求的资源不存在'
  }

  if (errorMsg.includes('500') || errorMsg.includes('Internal Server Error')) {
    return '服务器内部错误，请稍后重试'
  }

  return errorMsg
}

/**
 * 统一的错误处理函数
 * @param {Error} error - 错误对象
 * @param {string} context - 错误上下文（如 "创建模板"、"删除记录" 等）
 * @param {Object} options - 配置选项
 * @param {boolean} options.showMessage - 是否显示消息提示，默认 true
 * @param {boolean} options.logError - 是否在控制台记录错误，默认 true
 * @param {number} options.duration - 消息显示时长（毫秒），默认 3000
 * @returns {string} 错误信息
 */
export const handleApiError = (error, context = '操作', options = {}) => {
  const {
    showMessage = true,
    logError = true,
    duration = 3000
  } = options

  // 控制台记录完整错误信息（开发排障用）
  if (logError) {
    console.error(`${context}失败:`, error)
    if (error.response) {
      console.error('错误详情:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers
      })
    }
  }

  // 解析错误信息
  const errorMsg = parseErrorMessage(error)

  // 显示用户友好的错误提示
  if (showMessage) {
    ElMessage.error({
      message: `${context}失败: ${errorMsg}`,
      duration,
      showClose: true
    })
  }

  return errorMsg
}

/**
 * 处理成功消息
 * @param {string} message - 成功消息
 * @param {number} duration - 显示时长（毫秒）
 */
export const handleSuccess = (message, duration = 2000) => {
  ElMessage.success({
    message,
    duration
  })
}

/**
 * 处理警告消息
 * @param {string} message - 警告消息
 * @param {number} duration - 显示时长（毫秒）
 */
export const handleWarning = (message, duration = 3000) => {
  ElMessage.warning({
    message,
    duration,
    showClose: true
  })
}

/**
 * 处理信息消息
 * @param {string} message - 信息消息
 * @param {number} duration - 显示时长（毫秒）
 */
export const handleInfo = (message, duration = 2000) => {
  ElMessage.info({
    message,
    duration
  })
}
