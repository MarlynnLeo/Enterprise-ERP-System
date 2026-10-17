export const SOURCE_TYPE_OPTIONS = [
  { label: '销售出库', value: 'sales_outbound', path: '/sales/outbound' },
  { label: '仓库出库', value: 'outbound', path: '/inventory/outbound' },
  { label: '出库补发', value: 'outbound_supplement', path: '/inventory/outbound' },
  { label: '出库冲销', value: 'outbound_reversal', path: '/inventory/outbound' },
  { label: '仓库入库', value: 'inbound', path: '/inventory/inbound' },
  { label: '采购收货', value: 'purchase_receipt', path: '/purchase/receipts' },
  { label: '采购退货', value: 'purchase_return', path: '/purchase/returns' },
  { label: '销售退货', value: 'sales_return', path: '/sales/returns' },
  { label: '销售换货', value: 'sales_exchange', path: '/sales/exchanges' },
  { label: '库存调拨', value: 'transfer', path: '/inventory/transfer' },
  { label: '库存盘点', value: 'check', path: '/inventory/check' },
  { label: '手工事务', value: 'manual' },
  { label: '手工库存事务', value: 'manual_transaction', path: '/inventory/manual-transaction' },
  { label: '批量创建', value: 'batch_create' },
  { label: '期初/导入调整', value: 'import_adjustment' },
  { label: '库存对账调整', value: 'inventory_reconciliation' },
  { label: '委外加工发料', value: 'outsourced_processing_material', path: '/purchase/processing' },
  {
    label: '委外加工收货',
    value: 'outsourced_processing_receipt',
    path: '/purchase/processing-receipts',
  },
  { label: '委外加工', value: 'outsourced', path: '/purchase/processing' },
  { label: '质量报废', value: 'scrap', path: '/quality/scrap-records' },
  { label: '报废记录', value: 'scrap_record', path: '/quality/scrap-records' },
];

export const STATUS_OPTIONS = [
  { label: '待审核', value: 'pending', tag: 'warning' },
  { label: '已审核', value: 'approved', tag: 'success' },
  { label: '已驳回', value: 'rejected', tag: 'danger' },
  { label: '已冲销', value: 'reversed', tag: 'info' },
];

// Normalize the API boundary once. Templates and actions use camelCase only.
const normalizeRow = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ])
  );

export function normalizePosting(row) {
  if (!row || typeof row !== 'object') return null;
  const posting = normalizeRow(row);
  posting.lines = (posting.lines || []).map((line) => {
    const normalized = normalizeRow(line);
    normalized.materialSpecs = normalized.materialSpecs || normalized.specs || '';
    return normalized;
  });
  posting.events = (posting.events || []).map(normalizeRow);
  posting.relatedPostings = (posting.relatedPostings || []).map(normalizeRow);
  return posting;
}

export const sourceTypeLabel = (type) =>
  SOURCE_TYPE_OPTIONS.find((item) => item.value === type)?.label || type || '-';
export const statusLabel = (status) =>
  STATUS_OPTIONS.find((item) => item.value === status)?.label || status || '-';
export const statusTag = (status) =>
  STATUS_OPTIONS.find((item) => item.value === status)?.tag || 'info';
export const directionLabel = (direction) =>
  ({ in: '入库', inbound: '入库', out: '出库', outbound: '出库', mixed: '混合', reversal: '冲销' })[
    direction
  ] ||
  direction ||
  '-';

export function formatAmount(value, digits = 2) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '-';
  return Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function signedMovementValue(line) {
  if (
    line?.totalValue == null ||
    line.totalValue === '' ||
    line.signedQuantity == null ||
    line.signedQuantity === '' ||
    !Number.isFinite(Number(line.totalValue)) ||
    !Number.isFinite(Number(line.signedQuantity))
  )
    return null;
  // Stored values may be magnitudes or reversal values; quantity owns the direction.
  const magnitude = Math.abs(Number(line.totalValue));
  return magnitude === 0 ? 0 : Math.sign(Number(line.signedQuantity)) * magnitude;
}

export function postingReviewIssue(posting) {
  if (!posting?.lines?.length) return '缺少过账明细，无法核验存货数量和成本，不能通过审核';
  const values = [posting.totalValue, ...posting.lines.flatMap(line => [line.unitCost, line.totalValue])];
  if (values.some(value => value === '***')) {
    return '当前账号无权查看完整存货成本，无法核验金额，不能通过审核';
  }
  const validNumber = value =>
    (typeof value === 'number' || typeof value === 'string') &&
    String(value).trim() !== '' && Number.isFinite(Number(value));
  if (values.some(value => !validNumber(value)) || posting.lines.some(line =>
    !validNumber(line.signedQuantity) || Number(line.signedQuantity) === 0
  )) {
    return '过账数量或成本数据不完整，无法核验，不能通过审核';
  }
  return '';
}

export function lastReview(posting) {
  if (posting.financeStatus === 'reversed')
    return { label: posting.reversedLabel, time: posting.reversedAt };
  if (posting.financeStatus === 'rejected')
    return { label: posting.rejectedLabel, time: posting.rejectedAt };
  if (posting.financeStatus === 'approved')
    return { label: posting.financeApprovedLabel, time: posting.financeApprovedAt };
  return { label: '', time: '' };
}

export function separationReason(
  posting,
  user,
  { reversal = posting?.postingKind === 'reversal' } = {}
) {
  if (!posting || !user) return '用户身份尚未加载';
  const ids = [posting.businessApprovedById];
  const labels = [posting.businessApprovedBy];
  if (reversal) {
    ids.push(posting.originalBusinessApprovedById, posting.originalFinanceApprovedBy);
    labels.push(posting.originalBusinessApprovedLabel, posting.originalFinanceApprovedLabel);
  }
  const actorLabels = [user.realName, user.name, user.username]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const matchesId =
    Number(user.id) > 0 && ids.some((id) => Number(id) > 0 && Number(id) === Number(user.id));
  const matchesLabel = labels.some((label) => label && actorLabels.includes(String(label).trim()));
  if (!matchesId && !matchesLabel) return '';
  return reversal
    ? '冲销审核人须与申请人、原业务审核人及原财务审核人分离'
    : '制单/业务审核人与财务审核人必须分离';
}

export function sourceTarget(posting) {
  if (!posting) return null;
  const source =
    posting.postingKind === 'reversal'
      ? posting.relatedPostings?.find(
          (item) => String(item.id) === String(posting.originalPostingDocumentId)
        )
      : posting;
  if (!source) return null;
  const path = SOURCE_TYPE_OPTIONS.find((item) => item.value === source.sourceType)?.path;
  if (!path || (!source.sourceId && !source.sourceNo)) return null;
  return {
    path,
    query: {
      sourceType: source.sourceType,
      ...(source.sourceId ? { sourceId: String(source.sourceId) } : {}),
      ...(source.sourceNo ? { sourceNo: source.sourceNo } : {}),
    },
  };
}

export function auditCsv(postings) {
  const escapeCell = (value) => {
    let text = String(value ?? '');
    // Preserve numeric signs but keep document numbers and actor labels as text in spreadsheets.
    if (typeof value !== 'number' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const numberOrBlank = (value) =>
    value == null || value === '' || !Number.isFinite(Number(value)) ? '' : Number(value);
  const headers = [
    '过账单号',
    '过账类型',
    '来源业务',
    '来源单号',
    '流转方向',
    '明细行数',
    '过账金额合计(元)',
    '业务完成人',
    '审核状态',
    '最后审核人',
    '最后审核时间',
  ];
  const rows = postings.map((item) => [
    item.postingNo,
    item.postingKind === 'reversal' ? '冲销' : '正常过账',
    sourceTypeLabel(item.sourceType),
    item.sourceNo,
    directionLabel(item.movementDirection),
    numberOrBlank(item.lineCount),
    numberOrBlank(item.totalValue),
    item.businessApprovedBy,
    statusLabel(item.financeStatus),
    lastReview(item).label,
    lastReview(item).time,
  ]);
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}
