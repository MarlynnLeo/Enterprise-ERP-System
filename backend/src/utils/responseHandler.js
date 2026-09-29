/**
 * 统一响应处理器
 * @description 提供统一的API响应格式和数据转换功能
 * @author ERP开发团队
 * @date 2025-01-27
 *
 * SSOT：HTTP 出参一律 camelCase。DB/SQL 保持 snake；转换只在此边界发生。
 * 控制器内可继续 mapKeysToCamel（幂等），未包一层的历史接口也会被统一。
 */

const { mapKeysToCamel } = require('./fieldMap');

const RESPONSE_ERROR_CODE_MESSAGES = Object.freeze({
  BAD_REQUEST: '请求参数有误，请检查后重试',
  INVALID_REQUEST: '请求参数有误，请检查后重试',
  INVALID_REQUEST_PATH: '请求路径无效，请检查后重试',
  VALIDATION_ERROR: '提交内容有误，请检查后重试',
  SERVER_ERROR: '服务器暂时不可用，请稍后重试',
  INTERNAL_ERROR: '服务器暂时不可用，请稍后重试',
  NOT_FOUND: '请求的数据不存在或已被删除',
  UNAUTHORIZED: '登录已过期，请重新登录',
  FORBIDDEN: '您没有权限执行此操作',
  CONFLICT: '当前数据已发生变化，请刷新后重试',
  WORKFLOW_CONFIG_ERROR: '审批流程未配置完整，请联系管理员',
  INVALID_CSRF_TOKEN: '安全令牌已过期，请刷新页面后重试',
  OPERATION_ERROR: '操作失败，请稍后重试',
  INVALID_PARAMS: '请求参数有误，请检查后重试',
  DUPLICATE: '数据已存在，请检查后重试',
  BUSINESS_ERROR: '业务操作失败，请检查后重试',
  INVALID_MATERIAL: '所选物料无效，请重新选择',
  INVALID_LOCATION: '所选库位无效，请重新选择',
  INVALID_FILE_TYPE: '文件类型不支持，请选择允许的文件',
  INSUFFICIENT_STOCK: '库存不足，请调整数量后重试',
  EXCESS_ISSUE: '存在超额领料，请确认后重试',
  MISSING_ISSUE_REASON: '请填写超额领料原因',
  PAYMENT_APPROVAL_REQUIRED: '该付款记录需要审批后才能提交',
  RATE_LIMIT_EXCEEDED: '操作过于频繁，请稍后重试',
  REFRESH_TOKEN_BUSY: '登录状态正在更新，请稍后重试',
  INVALID_REFRESH_TOKEN: '登录状态已失效，请重新登录',
  TOKEN_EXPIRED: '登录已过期，请重新登录',
  NETWORK_ERROR: '网络连接失败，请检查网络设置',
  ERR_NETWORK: '网络连接失败，请检查网络设置',
  ECONNABORTED: '请求超时，请稍后重试',
  DUPLICATE_ENTRY: '数据已存在，请检查后重试',
  ER_DUP_ENTRY: '数据已存在，请检查后重试',
  FOREIGN_KEY_ERROR: '存在关联数据，无法完成操作',
});

const RESPONSE_ENGLISH_MESSAGES = Object.freeze([
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
  [
    /^(?:物料|material)(?:\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+|\s+[\w-]+)?\s*(?:不存在|无效|已删除|已停用|not found).*$/i,
    '所选物料不存在或已停用，请重新选择有效物料',
  ],
  [
    /^(?:产品|成品|product)(?:\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+|\s+[\w-]+)?\s*(?:不存在|无效|已删除|已停用|not found).*$/i,
    '所选产品不存在或已停用，请重新选择有效产品',
  ],
  [
    /^(?:库位|仓库|location|warehouse)(?:\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+|\s+[\w-]+)?\s*(?:不存在|无效|已删除|已停用|not found).*$/i,
    '所选库位不存在或已停用，请重新选择有效库位',
  ],
  [
    /^(?:发票|invoice)(?:\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+|\s+[\w-]+)?\s*(?:不存在|无效|已删除|已停用|not found).*$/i,
    '发票不存在或已被删除',
  ],
  [/^Invalid pagination parameters$/i, '分页参数无效'],
  [/^purchase requisition not found/i, '采购申请不存在或已被删除'],
  [/^purchase requisition .* cannot be linked/i, '当前采购申请状态不允许生成采购订单'],
  [/^purchase requisition .* has no material items/i, '采购申请没有有效的物料明细'],
  [/^purchase order not found$/i, '采购订单不存在或已被删除'],
  [/^purchase order\s+[\w-]+\s+not found$/i, '采购订单不存在或已被删除'],
  [/^sales return not found$/i, '销售退货单不存在或已被删除'],
  [/^exchange order not found$/i, '销售换货单不存在或已被删除'],
  [/^data not found$/i, '请求的数据不存在或已被删除'],
  [/^(?:no permission|unauthorized|forbidden)/i, '您没有权限执行此操作'],
  [/^(?:material|product) not found/i, '所选物料或产品不存在或已停用'],
  [/^(?:warehouse|location|supplier) not found/i, '所选基础资料不存在或已停用'],
  [/^duplicate entry/i, '数据已存在，请检查后重试'],
  [/^Opening balance list cannot be empty$/i, '期初余额明细不能为空'],
  [/^Opening balance list contains duplicate accounts$/i, '期初余额明细中存在重复科目'],
  [/^Opening balances (?:are not balanced|must remain balanced)/i, '期初余额借贷必须保持平衡'],
  [/^余额日期不是有效日期(?:（invalid date）)?$/i, '余额日期不是有效日期'],
  [/^手工期初余额金额必须为非负数(?:（non-negative）)?$/i, '手工期初余额金额必须为非负数'],
  [/^No valid fields to (?:create|update)$/i, '没有可保存的有效内容'],
  [/^Invalid input detected$/i, '请求参数有误，请检查后重试'],
  [/^Invalid request path$/i, '请求路径无效，请检查后重试'],
  [/^File type not allowed$/i, '文件类型不支持，请选择允许的文件'],
  [/^NCP has downstream documents and cannot be deleted$/i, '不合格品单已有下游单据，无法删除'],
  [
    /^Asset impairment is missing required GL accounts/i,
    '资产减值缺少必要的会计科目配置，请联系管理员',
  ],
  [/^Current exchange status cannot be deleted$/i, '当前换货单状态不允许删除'],
  [/^Missing required fields:/i, '提交内容不完整，请补充必填项'],
  [/^Location code .* already exists$/i, '库位编码已存在，请更换后重试'],
  [/^No reservation consumption required$/i, '当前没有需要处理的库存预留'],
]);

// 历史控制器曾把数据库字段名直接拼进错误提示。错误响应统一在这里转成
// 面向用户的业务描述，避免页面看到“xxxID”或英文实现细节。
const RESPONSE_TECHNICAL_MESSAGE_REPLACEMENTS = Object.freeze([
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
  [/^库存估值调整缺少有效台账ID$/i, '库存估值调整缺少有效台账'],
  [/^采购订单ID无效$/i, '请选择有效的采购订单'],
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
  [/^Invalid log path$/i, '日志路径无效'],
]);

const RESPONSE_ERROR_CODE_PATTERN = new RegExp(
  `\\b(?:${Object.keys(RESPONSE_ERROR_CODE_MESSAGES)
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'g'
);

const replaceTechnicalErrorFragments = (message) => {
  let normalized = String(message || '')
    .replace(/^AxiosError:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/\bRequest failed with status code \d+\b/gi, '请求失败，请稍后重试')
    .replace(/\b(?:Internal Server Error|Server Error)\b/gi, '服务器暂时不可用，请稍后重试')
    .replace(/\bNetwork Error\b/gi, '网络连接失败，请检查网络设置')
    .replace(/\b(?:Unauthorized|Forbidden|Not Found)\b/gi, (value) => {
      const messages = {
        Unauthorized: RESPONSE_ERROR_CODE_MESSAGES.UNAUTHORIZED,
        Forbidden: RESPONSE_ERROR_CODE_MESSAGES.FORBIDDEN,
        'Not Found': RESPONSE_ERROR_CODE_MESSAGES.NOT_FOUND,
      };
      return messages[value] || value;
    });

  for (const [pattern, replacement] of RESPONSE_TECHNICAL_MESSAGE_REPLACEMENTS) {
    if (pattern.test(normalized)) {
      normalized = normalized.replace(pattern, replacement);
      break;
    }
  }

  const idMessageMatch = normalized.match(
    /^(?:缺少|未提供|无效的|请选择有效的|请提供有效的)?\s*(.+?)\s*ID(?:参数|数组)?\s*(?:(?:为|是)?(?:必填项|必需的|不能为空|无效|缺失))?$/i
  );
  if (idMessageMatch) {
    const entity = idMessageMatch[1].replace(/^有效的/, '').trim();
    const entityLabels = {
      用户: '用户信息',
      资产: '资产',
      类别: '资产类别',
      工程: '在建工程',
      盘点单: '盘点单',
      发票: '发票',
      付款记录: '付款记录',
      收款记录: '收款记录',
      交易: '交易记录',
      银行账户: '银行账户',
      对账: '对账单',
      银行对账单明细: '银行对账单明细',
      期间: '会计期间',
      会计期间: '会计期间',
      标准成本: '标准成本版本',
      凭证: '凭证',
      产品: '产品',
      客户: '客户',
      物料: '物料',
      任务: '生产任务',
      生产任务: '生产任务',
      工序: '工序',
      调拨单: '调拨单',
      入库单: '入库单',
      出库单: '出库单',
      委外入库单: '委外入库单',
      采购订单: '采购订单',
      采购申请: '采购申请',
      费用: '费用记录',
      配置: '配置',
      台账: '库存台账',
    };
    const label = entityLabels[entity] || entity;
    normalized = `请选择有效的${label}`;
  } else if (/^生产任务ID无效或超过批量上限/i.test(normalized)) {
    normalized = '请选择有效的生产任务，且一次最多处理100条';
  }

  normalized = normalized.replace(RESPONSE_ERROR_CODE_PATTERN, (code) => {
    return RESPONSE_ERROR_CODE_MESSAGES[code] || code;
  });

  // 历史接口可能把基础资料的内部标识拼在“无效/不存在”后面。
  // 采购申请的物料编码有专门格式并在调用方保留，这里只处理通用异常。
  normalized = normalized
    .replace(
      /(物料|产品|成品|库位|仓库|供应商|客户|发票|检验单|生产任务|订单|BOM)\s*(?:ID|id|_id)?\s*(不存在|无效|已删除|已停用)\s*[：:]\s*[\w-]+/gi,
      '$1$2'
    )
    .replace(
      /(所选物料不存在或已停用|所选产品不存在或已停用|所选库位不存在或已停用|发票不存在或已被删除)\s*[：:]\s*[\w-]+/gi,
      '$1'
    );

  return normalized;
};

const INTERNAL_ID_PATTERNS = [
  [/(?:material|product|location|warehouse|supplier)_id\s*[:=]?\s*[\w-]+/gi, '相关基础资料'],
  [
    /(?:material|product|location|warehouse|supplier|customer|asset|order|receipt|outbound|return|invoice|inspection|task|plan|bom|bank_account|account)(?:Id|ID)\s*[:=]?\s*[\w-]+/g,
    '相关业务数据',
  ],
  [
    /(?:material|product|location|warehouse|supplier|customer|asset|order|receipt|outbound|return|invoice|inspection|task|plan)\s+(?:with\s+)?id\s*[:=]?\s*[\w-]+/gi,
    '相关业务数据',
  ],
  [
    /(?:material|product|location|warehouse|supplier|customer|asset|order|receipt|outbound|return|invoice|inspection|task|plan)\s*[:=]\s*[\w-]+/gi,
    '相关业务数据',
  ],
  [
    /(?:物料|产品|成品|库位|仓库|供应商|客户|资产|订单|采购申请|采购订单|采购入库单|收货单|入库单|生产入库单|出库单|销售出库单|退货单|换货单|发票|检验单|生产任务|任务|工序|BOM)\s*[：:]?\s*\d+(?=\s|[，。,:：；;]|$)/gi,
    '相关业务数据',
  ],
  [/(?:物料|material)\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+/gi, '所选物料'],
  [/(?:物料|material)\s*(?:ID|id|_id)\b/gi, '物料'],
  [/(?:物料|material)\s*#\s*[\w-]+/gi, '所选物料'],
  [/(?:产品|成品|product)\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+/gi, '所选产品'],
  [/(?:产品|成品|product)\s*#\s*[\w-]+/gi, '所选产品'],
  [/(?:库位|仓库|location|warehouse)\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+/gi, '所选库位'],
  [/(?:供应商|supplier)\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+/gi, '所选供应商'],
  [
    /(?:资产|盘点单|工程|项目|客户|订单|采购申请|采购订单|收货单|入库单|出库单|退货单|换货单|发票|银行账户|科目|检验单|BOM|用户|菜单)\s*(?:ID|id|_id)\s*(?:为|是)?\s*[:：=#]?\s*[\w-]+/gi,
    '相关业务数据',
  ],
  [/\(\s*(?:ID|id|_id)\s*[:：=#]?\s*[\w-]+\s*\)/gi, ''],
  [/(?:ID|id|_id)\s*[:：=#]\s*[\w-]+/gi, '相关业务数据'],
  [/ID\s*为\s*[\w-]+\s*的(?:资产|盘点单|在建工程|项目|订单|发票|科目)/gi, '相关业务数据'],
  [
    /(?:物料|产品|成品|库位|仓库|供应商|客户|资产|订单|采购申请|采购订单|收货单|入库单|出库单|退货单|换货单|发票|检验单|生产任务|任务|工序|BOM)\s*(?:ID|id|_id)\b/gi,
    '相关业务数据',
  ],
  [/(?:ID|id|_id)\s*列表/gi, '标识列表'],
];

function extractResponseErrorMessage(message) {
  if (typeof message === 'string') return message.trim();
  if (Array.isArray(message)) {
    for (const item of message) {
      const extracted = extractResponseErrorMessage(item);
      if (extracted) return extracted;
    }
    return '';
  }
  if (message && typeof message === 'object') {
    return extractResponseErrorMessage(message.message || message.msg || message.error);
  }
  return '';
}

function normalizeResponseErrorMessage(message, errorCode, statusCode, options = {}) {
  const { preserveEnglish = false } = options;
  let normalized = extractResponseErrorMessage(message);
  if (!normalized || normalized === '[object Object]' || /^(?:undefined|null)$/.test(normalized)) {
    return (
      RESPONSE_ERROR_CODE_MESSAGES[errorCode] ||
      (Number(statusCode) >= 500 ? '服务器暂时不可用，请稍后重试' : '操作失败，请稍后重试')
    );
  }

  const directTechnicalMessage = RESPONSE_TECHNICAL_MESSAGE_REPLACEMENTS.find(([pattern]) =>
    pattern.test(normalized)
  );
  if (directTechnicalMessage) return directTechnicalMessage[1];
  if (/^生产任务ID无效或超过批量上限/i.test(normalized)) {
    return '请选择有效的生产任务，且一次最多处理100条';
  }

  // 兼容旧控制器把操作上下文和采购申请物料错误拼在一起的情况。
  // 纯数字通常是数据库 ID，不能返回给用户；非数字值按物料编码展示。
  const legacyRequisitionMaterialWithContext = normalized.match(
    /请购物料不存在或已停用[：:]\s*([^。；;，,\s]+)/
  );
  if (legacyRequisitionMaterialWithContext) {
    const materialCode = legacyRequisitionMaterialWithContext[1].trim();
    const detail = /^\d+$/.test(materialCode)
      ? '申请单中的失效物料已不存在或已停用，请编辑申请单后重新选择有效物料。'
      : `申请单中的物料编码“${materialCode}”已不存在或已停用，请编辑申请单后重新选择有效物料。`;
    const prefix = normalized
      .slice(0, legacyRequisitionMaterialWithContext.index)
      .trim()
      .replace(/[：:]\s*$/, '');
    return prefix ? `${prefix}：${detail}` : detail;
  }

  const requisitionMaterialWithContext = normalized.match(
    /申请单中的物料编码“([^”]+)”已不存在或已停用，请编辑申请单后重新选择有效物料。?/
  );
  if (requisitionMaterialWithContext) {
    const prefix = normalized
      .slice(0, requisitionMaterialWithContext.index)
      .trim()
      .replace(/[：:]\s*$/, '');
    const detail = `申请单中的物料编码“${requisitionMaterialWithContext[1]}”已不存在或已停用，请编辑申请单后重新选择有效物料。`;
    return prefix ? `${prefix}：${detail}` : detail;
  }

  const requisitionMaterialMatch = normalized.match(
    /^(?:请购物料不存在或已停用：[^。]+。)?申请单中的物料编码“([^”]+)”已不存在或已停用，请编辑申请单后重新选择有效物料。?$/
  );
  if (requisitionMaterialMatch) {
    return `申请单中的物料编码“${requisitionMaterialMatch[1]}”已不存在或已停用，请编辑申请单后重新选择有效物料。`;
  }

  // 兼容历史调用方只返回“请购物料不存在或已停用：编码”的情况，
  // 统一补齐用户可执行的处理建议；这里的值是物料编码，不是数据库 ID。
  const legacyRequisitionMaterialMatch = normalized.match(
    /^请购物料不存在或已停用[：:]\s*(.+?)\s*[。.]?$/
  );
  if (legacyRequisitionMaterialMatch) {
    const materialCode = legacyRequisitionMaterialMatch[1].trim();
    if (/^\d+$/.test(materialCode)) {
      return '申请单中的失效物料已不存在或已停用，请编辑申请单后重新选择有效物料。';
    }
    return `申请单中的物料编码“${materialCode}”已不存在或已停用，请编辑申请单后重新选择有效物料。`;
  }

  const candidates = [normalized];
  const separatorIndex = Math.max(normalized.lastIndexOf('：'), normalized.lastIndexOf(':'));
  if (separatorIndex >= 0) candidates.push(normalized.slice(separatorIndex + 1).trim());
  const known = RESPONSE_ENGLISH_MESSAGES.find(([pattern]) =>
    candidates.some((candidate) => pattern.test(candidate))
  );
  if (known) return known[1];

  // 历史服务曾把单据/任务的数据库 ID 拼进业务错误。保留单据类型和原因，
  // 去除不可供用户识别的内部标识；可识别的业务单号由调用方直接传入。
  normalized = normalized
    .replace(
      /(采购入库单|生产入库单|销售出库单|采购订单|采购申请|销售订单|入库单|出库单|检验单|生产任务|库存台账|银行账户|资产|发票|BOM)\s*(?:ID\s*)?(不存在|已被删除|已删除|无效)\s*[：:]\s*[\w-]+/gi,
      '$1$2'
    )
    .replace(
      /(采购入库单|生产入库单|销售出库单|采购订单|采购申请|销售订单|入库单|出库单|检验单|生产任务|库存台账|银行账户|资产|发票|BOM)\s*(?:ID\s*)?[\w-]+(?=\s*(?:的|中|没有|无|缺少|已|状态|不存在|未|不能|无法))/gi,
      '$1'
    )
    .replace(/(关联销售订单|销售订单)\s*[\w-]+(?=\s*(?:不存在|已删除|缺少))/gi, '$1')
    .replace(/\s+(?=的|中|没有|无|缺少|不存在|已|未|不能|无法)/g, '');

  normalized = replaceTechnicalErrorFragments(normalized);

  // 兼容“中文上下文 + 英文异常”的历史接口文案。已知英文业务错误在上面
  // 已映射；其余实现细节统一回退为中文，避免页面显示 SQL/Axios/Node 异常。
  if (
    /\b(?:invalid|not found|failed|failure|error|exception|unauthorized|forbidden|missing|required|cannot|unable|must be|only|already exists)\b/i.test(
      normalized
    )
  ) {
    return (
      RESPONSE_ERROR_CODE_MESSAGES[errorCode] ||
      (Number(statusCode) >= 500 ? '服务器暂时不可用，请稍后重试' : '操作失败，请稍后重试')
    );
  }

  INTERNAL_ID_PATTERNS.forEach(([pattern, label]) => {
    normalized = normalized.replace(pattern, label);
  });
  normalized = normalized
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([，。,:：；;])/g, '$1')
    .trim();

  // 错误码、Axios 技术异常和纯英文内部异常不适合直接展示给用户。
  if (
    !preserveEnglish &&
    (/^([A-Z][A-Z0-9_]+|ERR_[A-Z0-9_]+)$/.test(normalized) ||
      /^Request failed with status code \d+$/i.test(normalized) ||
      /^(?:Network Error|Unauthorized|Forbidden|Not Found)$/i.test(normalized) ||
      (!/[\u3400-\u9fff]/.test(normalized) && /^\p{ASCII}+$/u.test(normalized)))
  ) {
    return (
      RESPONSE_ERROR_CODE_MESSAGES[errorCode] ||
      (Number(statusCode) >= 500 ? '服务器暂时不可用，请稍后重试' : '操作失败，请稍后重试')
    );
  }
  return normalized;
}

function normalizeResponseErrorDetails(details, errorCode, statusCode) {
  if (Array.isArray(details)) {
    return details.map((item) => normalizeResponseErrorDetails(item, errorCode, statusCode));
  }
  if (details && typeof details === 'object') {
    return Object.fromEntries(
      Object.entries(details).map(([key, value]) => [
        key,
        typeof value === 'string'
          ? normalizeResponseErrorMessage(value, errorCode, statusCode)
          : normalizeResponseErrorDetails(value, errorCode, statusCode),
      ])
    );
  }
  return details;
}

const RESPONSE_ERROR_CONTAINER_KEYS = new Set(['failures', 'errors', 'errorList', 'error_list']);

const RESPONSE_ERROR_FIELD_KEYS = new Set([
  'error',
  'errorMessage',
  'error_message',
  'failureMessage',
  'failure_message',
]);

// 成功响应中的批量结果也可能包含逐行失败信息。只处理明确的错误字段和
// failures/errorList/results 容器，避免改写业务正文、聊天内容或备注。
function normalizeNestedResponseErrors(value, parentKey = '') {
  if (Array.isArray(value)) {
    return value.map((item) => {
      // 批量导入接口历史上直接返回 string[]，不能让英文异常、错误码或
      // 数据库 ID 通过成功响应中的 errors/failures 数组绕过统一脱敏。
      if (typeof item === 'string' && RESPONSE_ERROR_CONTAINER_KEYS.has(parentKey)) {
        return normalizeResponseErrorMessage(item, 'OPERATION_ERROR', 400);
      }
      return normalizeNestedResponseErrors(item, parentKey);
    });
  }
  if (!value || typeof value !== 'object' || value.constructor !== Object) return value;

  const isErrorObject = value.success === false || RESPONSE_ERROR_CONTAINER_KEYS.has(parentKey);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      const shouldNormalize =
        typeof child === 'string' &&
        (RESPONSE_ERROR_FIELD_KEYS.has(key) || (key === 'message' && isErrorObject));
      return [
        key,
        shouldNormalize
          ? normalizeResponseErrorMessage(child, 'OPERATION_ERROR', 400)
          : normalizeNestedResponseErrors(child, key),
      ];
    })
  );
}

/**
 * 响应处理器
 */
class ResponseHandler {
  /**
   * 成功响应
   * @param {Object} res - Express响应对象
   * @param {*} data - 响应数据
   * @param {String} message - 成功消息
   * @param {Number} code - HTTP状态码
   */
  static success(res, data = null, message = '操作成功', code = 200) {
    return res.status(code).json({
      success: true,
      message,
      data: mapKeysToCamel(normalizeNestedResponseErrors(data)),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 分页响应
   * @param {Object} res - Express响应对象
   * @param {Array} list - 数据列表
   * @param {Number} total - 总记录数
   * @param {Number} page - 当前页码
   * @param {Number} pageSize - 每页大小
   * @param {String} message - 成功消息
   */
  static paginated(
    res,
    list = [],
    total = 0,
    page = 1,
    pageSize = 20,
    message = '查询成功',
    extra = {}
  ) {
    return res.status(200).json({
      success: true,
      message,
      data: mapKeysToCamel(
        normalizeNestedResponseErrors({
          list,
          total,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(total / pageSize),
          ...(extra && typeof extra === 'object' ? extra : {}),
        })
      ),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 错误响应
   * @param {Object} res - Express响应对象
   * @param {String} message - 错误消息
   * @param {String} errorCode - 错误代码
   * @param {Number} statusCode - HTTP状态码
   * @param {Error} error - 错误对象（可选）
   */
  static error(res, message = '操作失败', errorCode = 'ERROR', statusCode = 500, error = null) {
    const isProduction = process.env.NODE_ENV === 'production';
    const isServerError = Number(statusCode) >= 500;
    const normalizedMessage = normalizeResponseErrorMessage(message, errorCode, statusCode);
    const safeMessage =
      isProduction && isServerError ? '服务器内部错误，请稍后重试' : normalizedMessage;

    const response = {
      success: false,
      message: safeMessage,
      errorCode,
      // 兼容前端历史判断字段（如 error.response.data.code === 'EXCESS_ISSUE'）
      code: errorCode,
      timestamp: new Date().toISOString(),
    };

    // [New] 业务报错可能需要前端页面跳页指引
    if (error && error.action) {
      response.action = error.action;
    }

    if (error && error.details && (!isProduction || !isServerError)) {
      response.details = normalizeResponseErrorDetails(error.details, errorCode, statusCode);
    }

    // 开发环境下包含详细错误信息
    if (!isProduction && error) {
      response.error = {
        message: normalizedMessage,
        stack: error.stack,
      };
    }

    return res.status(statusCode).json(response);
  }

  /**
   * 验证错误响应
   * @param {Object} res - Express响应对象
   * @param {String} message - 错误消息
   * @param {Object} errors - 验证错误详情
   */
  static validationError(res, message = '验证失败', errors = {}) {
    const normalizedMessage = normalizeResponseErrorMessage(message, 'VALIDATION_ERROR', 400);
    return res.status(400).json({
      success: false,
      message: normalizedMessage,
      errorCode: 'VALIDATION_ERROR',
      errors: normalizeResponseErrorDetails(errors, 'VALIDATION_ERROR', 400),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 未授权响应
   * @param {Object} res - Express响应对象
   * @param {String} message - 错误消息
   */
  static unauthorized(res, message = '未授权访问') {
    return res.status(401).json({
      success: false,
      message: normalizeResponseErrorMessage(message, 'UNAUTHORIZED', 401),
      errorCode: 'UNAUTHORIZED',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 禁止访问响应
   * @param {Object} res - Express响应对象
   * @param {String} message - 错误消息
   */
  static forbidden(res, message = '禁止访问') {
    return res.status(403).json({
      success: false,
      message: normalizeResponseErrorMessage(message, 'FORBIDDEN', 403),
      errorCode: 'FORBIDDEN',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 未找到响应
   * @param {Object} res - Express响应对象
   * @param {String} message - 错误消息
   */
  static notFound(res, message = '资源未找到') {
    return res.status(404).json({
      success: false,
      message: normalizeResponseErrorMessage(message, 'NOT_FOUND', 404),
      errorCode: 'NOT_FOUND',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * 数据转换器
 */
class DataTransformer {
  /**
   * 将snake_case转换为camelCase
   * @param {*} data - 要转换的数据
   * @returns {*} 转换后的数据
   */
  static toCamelCase(data) {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.toCamelCase(item));
    }

    if (typeof data === 'object' && data.constructor === Object) {
      const result = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          const camelKey = key.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
          result[camelKey] = this.toCamelCase(data[key]);
        }
      }
      return result;
    }

    return data;
  }

  /**
   * 将camelCase转换为snake_case
   * @param {*} data - 要转换的数据
   * @returns {*} 转换后的数据
   */
  static toSnakeCase(data) {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.toSnakeCase(item));
    }

    if (typeof data === 'object' && data.constructor === Object) {
      const result = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          result[snakeKey] = this.toSnakeCase(data[key]);
        }
      }
      return result;
    }

    return data;
  }

  /**
   * 过滤空值
   * @param {Object} obj - 要过滤的对象
   * @returns {Object} 过滤后的对象
   */
  static filterEmpty(obj) {
    const result = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (value !== null && value !== undefined && value !== '') {
          result[key] = value;
        }
      }
    }
    return result;
  }

  /**
   * 提取分页参数
   * @param {Object} query - 查询参数
   * @returns {Object} 分页参数 { page, pageSize, offset, limit }
   */
  static extractPagination(query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(query.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;

    return {
      page,
      pageSize,
      offset,
      limit: pageSize,
    };
  }
}

module.exports = {
  ResponseHandler,
  DataTransformer,
  normalizeResponseErrorMessage,
  normalizeResponseErrorDetails,
};
