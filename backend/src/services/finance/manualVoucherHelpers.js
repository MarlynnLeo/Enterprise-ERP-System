/**
 * ManualVoucher 纯函数辅助：
 * - 统一字段命名（camelCase）
 * - 分录角色 → 科目覆盖
 * - 覆盖项规范化
 * - 草稿合并
 */

const { normalizeTaxRate, roundMoney } = require('../../utils/money');

/** 分录角色（唯一约定，前后端共用语义） */
const ENTRY_ROLES = Object.freeze({
  COST: 'cost',
  TAX: 'tax',
  PAYABLE: 'payable',
  RECEIVABLE: 'receivable',
  INCOME: 'income',
});

/** 角色 → 覆盖 accounts 字段 */
const ROLE_TO_ACCOUNT_KEY = Object.freeze({
  [ENTRY_ROLES.COST]: 'costAccountId',
  [ENTRY_ROLES.TAX]: 'taxAccountId',
  [ENTRY_ROLES.PAYABLE]: 'payableAccountId',
  [ENTRY_ROLES.RECEIVABLE]: 'receivableAccountId',
  [ENTRY_ROLES.INCOME]: 'incomeAccountId',
});

const AP_ROLE_ORDER = Object.freeze([
  ENTRY_ROLES.COST,
  ENTRY_ROLES.TAX,
  ENTRY_ROLES.PAYABLE,
]);

const AR_ROLE_ORDER = Object.freeze([
  ENTRY_ROLES.RECEIVABLE,
  ENTRY_ROLES.INCOME,
  ENTRY_ROLES.TAX,
]);

function money(n) {
  return roundMoney(n);
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function toPositiveInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 合并标志：契约仅认 options.merge（boolean）。
 * 不再接受 mergeMode 等历史别名。
 */
function parseMergeFlag(options = {}, defaultMerge = true) {
  if (options.merge === false) return false;
  if (options.merge === true) return true;
  return defaultMerge;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (Array.isArray(value.vouchers)) return value.vouchers;
    // 单张合并草稿对象
    if (
      value.id != null ||
      Array.isArray(value.sourceIds) ||
      Array.isArray(value.entryLines) ||
      Array.isArray(value.items)
    ) {
      return [value];
    }
  }
  return [];
}

/**
 * 将合并税额按各单未税金额比例分摊（最后一单吃尾差，保证合计精确）
 * @param {Array<{id:number, subtotal:number}>} docs
 * @param {number} totalTax
 * @returns {Map<number, number>} id → taxAmount
 */
function allocateTaxBySubtotal(docs, totalTax) {
  const map = new Map();
  const list = (docs || []).filter((d) => d && d.id != null);
  if (!list.length) return map;

  const targetTax = money(totalTax);
  const weights = list.map((d) => Math.max(0, money(d.subtotal || 0)));
  const weightSum = money(weights.reduce((s, w) => s + w, 0));

  if (weightSum <= 0 || targetTax === 0) {
    // 均分或全 0
    const each = list.length ? money(targetTax / list.length) : 0;
    let allocated = 0;
    list.forEach((d, i) => {
      if (i === list.length - 1) {
        map.set(d.id, money(targetTax - allocated));
      } else {
        map.set(d.id, each);
        allocated = money(allocated + each);
      }
    });
    return map;
  }

  let allocated = 0;
  list.forEach((d, i) => {
    if (i === list.length - 1) {
      map.set(d.id, money(targetTax - allocated));
    } else {
      const share = money((weights[i] / weightSum) * targetTax);
      map.set(d.id, share);
      allocated = money(allocated + share);
    }
  });
  return map;
}

/**
 * 按业务金额重写分录借贷（保留科目/角色/摘要），避免预览手改后与价税脱节
 * @param {'purchase_receipt'|'sales_outbound'} businessType
 * @param {Array} entryLines
 * @param {{ subtotal:number, taxAmount:number, totalAmount:number }} amounts
 */
function syncEntryLinesToAmounts(businessType, entryLines, amounts = {}) {
  const lines = (entryLines || []).map((l) => ({ ...normalizeEntryLine(l) }));
  const subtotal = money(amounts.subtotal || 0);
  const taxAmount = money(amounts.taxAmount || 0);
  const totalAmount = money(
    amounts.totalAmount != null ? amounts.totalAmount : subtotal + taxAmount
  );
  const byRole = (role) => lines.find((l) => l.role === role);
  const ap = String(businessType) === 'purchase_receipt';
  const splitTax = taxAmount > 0.0001 && byRole(ENTRY_ROLES.TAX);

  const setAmt = (line, debit, credit) => {
    if (!line) return;
    line.debit_amount = money(debit);
    line.credit_amount = money(credit);
  };

  if (ap) {
    setAmt(byRole(ENTRY_ROLES.COST), splitTax ? subtotal : totalAmount, 0);
    setAmt(byRole(ENTRY_ROLES.TAX), splitTax ? taxAmount : 0, 0);
    setAmt(byRole(ENTRY_ROLES.PAYABLE), 0, totalAmount);
  } else {
    setAmt(byRole(ENTRY_ROLES.RECEIVABLE), totalAmount, 0);
    setAmt(byRole(ENTRY_ROLES.INCOME), 0, splitTax ? subtotal : totalAmount);
    setAmt(byRole(ENTRY_ROLES.TAX), 0, splitTax ? taxAmount : 0);
  }

  return lines.filter((l) => l.debit_amount > 0 || l.credit_amount > 0);
}

/**
 * 校验合并凭证分录与业务金额是否一致（价税合计）
 * options.autoSync=true 时先按金额重写分录再校验
 */
function assertEntryLinesMatchTotals(entryLines, expectedTotal, label = '合并凭证', options = {}) {
  let lines = entryLines || [];
  if (options.autoSync && options.businessType && options.amounts) {
    lines = syncEntryLinesToAmounts(options.businessType, lines, options.amounts);
  }
  const debit = sumBy(lines, 'debit_amount');
  const credit = sumBy(lines, 'credit_amount');
  if (Math.abs(debit - credit) > 0.01) {
    const err = new Error(`${label}借贷不平：借 ${debit} / 贷 ${credit}`);
    err.code = 'VOUCHER_UNBALANCED';
    err.statusCode = 400;
    throw err;
  }
  if (expectedTotal != null && Math.abs(debit - money(expectedTotal)) > 0.02) {
    const err = new Error(
      `${label}分录合计 ${debit} 与业务价税合计 ${money(expectedTotal)} 不一致（请检查预览中的数量/单价/税额）`
    );
    err.code = 'VOUCHER_AMOUNT_MISMATCH';
    err.statusCode = 400;
    throw err;
  }
  return { debit, credit, entryLines: lines };
}

/**
 * 校验发票税额合计与合并税额
 */
function assertInvoiceTaxSum(invoiceTaxes, expectedTax, label = '合并税额') {
  const sum = money((invoiceTaxes || []).reduce((s, t) => s + money(t || 0), 0));
  const target = money(expectedTax || 0);
  if (Math.abs(sum - target) > 0.02) {
    const err = new Error(`${label}分摊后合计 ${sum} ≠ 目标 ${target}`);
    err.code = 'TAX_ALLOCATION_MISMATCH';
    err.statusCode = 400;
    throw err;
  }
  return sum;
}

/**
 * 规范化业务明细行（统一 material/product 字段）
 */
function normalizeLineItem(raw = {}, source = {}) {
  const quantity = toNumber(raw.quantity, 0);
  const unitPrice = toNumber(firstDefined(raw.unit_price, raw.price), 0);
  const materialId = firstDefined(raw.material_id, raw.product_id, null);
  const name = firstDefined(
    raw.material_name,
    raw.product_name,
    raw.material_code,
    materialId ? `material#${materialId}` : null
  );

  return {
    source_id: toPositiveInt(firstDefined(raw.source_id, raw.sourceId, source.id)) || null,
    source_doc_no: firstDefined(raw.source_doc_no, raw.sourceDocNo, source.docNo) || null,
    material_id: materialId,
    product_id: firstDefined(raw.product_id, raw.material_id, materialId),
    material_name: name,
    product_name: name,
    material_code: raw.material_code || null,
    description: raw.description || null,
    quantity,
    unit_price: unitPrice,
    price: unitPrice,
    amount: money(quantity * unitPrice),
  };
}

function normalizeEntryLine(raw = {}) {
  return {
    role: String(raw.role || '').toLowerCase() || null,
    account_id: toPositiveInt(raw.account_id),
    account_code: raw.account_code || null,
    account_name: raw.account_name || null,
    account_label: raw.account_label || null,
    description: raw.description || '',
    debit_amount: money(raw.debit_amount || 0),
    credit_amount: money(raw.credit_amount || 0),
    // 辅助核算维度（应付/GR-IR 写供应商；应收写客户）
    supplier_id: toPositiveInt(raw.supplier_id) || null,
    customer_id: toPositiveInt(raw.customer_id) || null,
    editable: raw.editable !== false,
  };
}

/**
 * 从分录角色推导 accounts 覆盖
 */
function accountsFromEntryLines(entryLines = []) {
  const accounts = {};
  for (const line of entryLines) {
    const role = String(line.role || '').toLowerCase();
    const accountId = toPositiveInt(line.account_id);
    const key = ROLE_TO_ACCOUNT_KEY[role];
    if (key && accountId) accounts[key] = accountId;
  }
  return accounts;
}

function normalizeAccounts(raw = {}, fromLines = {}) {
  const candidates = {
    costAccountId: firstDefined(raw.costAccountId, raw.purchase_cost_account_id, fromLines.costAccountId),
    taxAccountId: firstDefined(
      raw.taxAccountId,
      raw.input_tax_account_id,
      raw.output_tax_account_id,
      fromLines.taxAccountId
    ),
    payableAccountId: firstDefined(
      raw.payableAccountId,
      raw.payable_account_id,
      fromLines.payableAccountId
    ),
    receivableAccountId: firstDefined(
      raw.receivableAccountId,
      raw.receivable_account_id,
      fromLines.receivableAccountId
    ),
    incomeAccountId: firstDefined(
      raw.incomeAccountId,
      raw.income_account_id,
      fromLines.incomeAccountId
    ),
  };
  const accounts = {};
  for (const [key, value] of Object.entries(candidates)) {
    const id = toPositiveInt(value);
    if (id) accounts[key] = id;
  }
  return accounts;
}

/**
 * 单条覆盖（一单或合并草稿）→ 规范对象
 */
function normalizeOverrideRow(row = {}) {
  if (!row || typeof row !== 'object') return null;

  // 对外契约：camelCase；读入时仅兼容极少数历史键，写出一律 camelCase
  const entryLines = Array.isArray(row.entryLines)
    ? row.entryLines.map(normalizeEntryLine)
    : [];

  const fromLines = accountsFromEntryLines(entryLines);
  const accounts = normalizeAccounts(row.accounts || {}, fromLines);

  const items = Array.isArray(row.items)
    ? row.items.map((it) => normalizeLineItem(it)).filter((it) => it.quantity > 0)
    : [];

  const taxRateRaw = firstDefined(row.taxRate, row.tax_rate);
  const taxAmountRaw = firstDefined(row.taxAmount, row.tax_amount);

  const sourceIds = Array.isArray(row.sourceIds)
    ? row.sourceIds.map(toPositiveInt).filter(Boolean)
    : [];

  const id = toPositiveInt(firstDefined(row.id, sourceIds[0]));

  // 明细未税合计（权威）
  const itemsSubtotal = items.length ? sumBy(items, 'amount') : undefined;
  const subtotal =
    itemsSubtotal != null
      ? itemsSubtotal
      : row.subtotal != null
        ? money(row.subtotal)
        : undefined;

  let taxAmount =
    taxAmountRaw !== undefined && taxAmountRaw !== null && taxAmountRaw !== ''
      ? money(taxAmountRaw)
      : undefined;
  const taxRate =
    taxRateRaw !== undefined && taxRateRaw !== null && taxRateRaw !== ''
      ? normalizeTaxRate(taxRateRaw, 0)
      : undefined;

  // 有明细 + 税率但无显式税额 → 按明细重算
  if (taxAmount === undefined && subtotal != null && taxRate != null) {
    taxAmount = money(subtotal * taxRate);
  }

  const totalAmount =
    subtotal != null && taxAmount != null
      ? money(subtotal + taxAmount)
      : row.totalAmount != null
        ? money(row.totalAmount)
        : undefined;

  return {
    id,
    isMerged: Boolean(row.isMerged || sourceIds.length > 1),
    sourceIds: sourceIds.length ? sourceIds : id ? [id] : [],
    partyId: toPositiveInt(firstDefined(row.partyId, row.supplier_id, row.customer_id)) || null,
    invoiceDate: firstDefined(row.invoiceDate, row.entryDate) || null,
    description: firstDefined(row.description, row.notes) || null,
    notes: firstDefined(row.notes, row.description) || null,
    taxRate,
    taxAmount,
    subtotal,
    totalAmount,
    items: items.length ? items : undefined,
    entryLines,
    accounts,
  };
}

/**
 * 批量覆盖 → Map<sourceId, override>
 * 仅处理「一单一覆盖」列表；合并草稿请用 resolveMergedPayload
 */
function normalizeOverridesMap(rawOverrides) {
  const map = new Map();
  for (const row of asArray(rawOverrides)) {
    const normalized = normalizeOverrideRow(row);
    if (!normalized?.id || normalized.isMerged) continue;
    map.set(normalized.id, {
      invoiceDate: normalized.invoiceDate,
      notes: normalized.notes,
      description: normalized.description,
      taxRate: normalized.taxRate,
      taxAmount: normalized.taxAmount,
      items: normalized.items,
      accounts: normalized.accounts,
    });
  }
  return map;
}

/**
 * 合并生成载荷：1 张合并草稿 → 各单明细覆盖（含税额分摊）+ 合并总账元数据
 */
function resolveMergedPayload(rawOverrides, ids = []) {
  const list = asArray(rawOverrides).map(normalizeOverrideRow).filter(Boolean);
  const merged =
    list.find((row) => row.isMerged || row.sourceIds.length > 1) ||
    (list.length === 1 && ids.length > 1 ? list[0] : null);

  if (!merged) {
    return {
      perDocOverrides: normalizeOverridesMap(rawOverrides),
      mergedMeta: null,
    };
  }

  const allItems = merged.items || [];
  const perDocOverrides = new Map();

  // 各单未税（用于分摊税额）
  const docSubtotals = ids.map((id) => {
    const docItems = allItems
      .filter((it) => Number(it.source_id) === Number(id))
      .map((it) => normalizeLineItem(it, { id }));
    const subtotal = docItems.length
      ? sumBy(docItems, 'amount')
      : 0;
    return { id, subtotal, items: docItems };
  });

  const targetTax =
    merged.taxAmount != null
      ? money(merged.taxAmount)
      : merged.subtotal != null && merged.taxRate != null
        ? money(merged.subtotal * merged.taxRate)
        : money(docSubtotals.reduce((s, d) => s + d.subtotal, 0) * (merged.taxRate || 0));

  const taxMap = allocateTaxBySubtotal(docSubtotals, targetTax);
  assertInvoiceTaxSum(
    ids.map((id) => taxMap.get(id) || 0),
    targetTax
  );

  for (const row of docSubtotals) {
    perDocOverrides.set(row.id, {
      invoiceDate: merged.invoiceDate,
      notes: merged.notes,
      description: merged.description,
      taxRate: merged.taxRate,
      taxAmount: taxMap.get(row.id),
      items: row.items.length ? row.items : undefined,
      accounts: merged.accounts,
    });
  }

  const subtotal = money(docSubtotals.reduce((s, d) => s + d.subtotal, 0));
  const totalAmount = money(subtotal + targetTax);

  // 分录按业务金额自动对齐（预览手改数量/税额后常见不一致）
  let entryLines = merged.entryLines || [];
  if (entryLines.length) {
    const roles = new Set(entryLines.map((l) => l.role));
    const businessType =
      merged.businessType ||
      (roles.has(ENTRY_ROLES.PAYABLE)
        ? 'purchase_receipt'
        : roles.has(ENTRY_ROLES.RECEIVABLE)
          ? 'sales_outbound'
          : null);
    if (businessType) {
      entryLines = syncEntryLinesToAmounts(businessType, entryLines, {
        subtotal,
        taxAmount: targetTax,
        totalAmount,
      });
    }
    assertEntryLinesMatchTotals(entryLines, totalAmount, '合并凭证');
  }

  return {
    perDocOverrides,
    mergedMeta: {
      entryDate: merged.invoiceDate,
      description: merged.description,
      entryLines,
      accounts: merged.accounts,
      subtotal,
      taxAmount: targetTax,
      totalAmount,
      sourceIds: ids,
      partyId: toPositiveInt(merged.partyId) || null,
    },
  };
}

function sumBy(list, field) {
  return money(list.reduce((sum, row) => sum + toNumber(row[field], 0), 0));
}

/**
 * 合并摘要中的业务单号列表。
 * 专业要求：写全单号，不截断为「前3张+等」——账务追溯必须可定位每一张来源单。
 * 超长时仍写全，由调用方（description 字段）承担长度；gl 描述多为 TEXT。
 */
function formatDocLabel(docNos = [], options = {}) {
  const list = (docNos || []).map((n) => String(n || '').trim()).filter(Boolean);
  if (!list.length) return '';
  const maxShow = options.maxShow;
  if (maxShow != null && Number.isFinite(maxShow) && maxShow > 0 && list.length > maxShow) {
    return `${list.slice(0, maxShow).join('、')}等${list.length}张`;
  }
  return list.join('、');
}

/** 去掉单票摘要里的「- 入库 XXX」后缀，合并时改用全量单号，避免摘要重复冗长 */
function stripSingleDocSuffix(text = '') {
  return String(text || '')
    .replace(/\s*[-–—]\s*(入库|出库|发票号)[:：]?\s*\S+/g, '')
    .replace(/\s*（合并[^）]*）\s*$/g, '')
    .trim();
}

function formatPartyLabel(partyNames = []) {
  if (partyNames.length === 1) return partyNames[0];
  if (partyNames.length > 1) return `${partyNames[0]} 等${partyNames.length}家`;
  return '多方';
}

/**
 * 多张草稿 → 一张合并凭证草稿
 * @param {'purchase_receipt'|'sales_outbound'} businessType
 * @param {Array} readyDrafts
 * @param {boolean} isAp
 */
function mergeDraftsIntoVoucher(businessType, readyDrafts, isAp) {
  if (!readyDrafts.length) return null;

  if (readyDrafts.length === 1) {
    const only = readyDrafts[0];
    return {
      ...only,
      isMerged: false,
      sourceIds: [only.id],
      sourceDocs: [
        {
          id: only.id,
          docNo: only.docNo,
          partyName: only.partyName,
          partyId: only.partyId,
          totalAmount: only.totalAmount,
          subtotal: only.subtotal,
          taxAmount: only.taxAmount,
        },
      ],
    };
  }

  const docNos = readyDrafts.map((d) => d.docNo).filter(Boolean);
  const partyNames = [...new Set(readyDrafts.map((d) => d.partyName).filter(Boolean))];
  const partyIds = [...new Set(readyDrafts.map((d) => d.partyId).filter(Boolean))];

  const items = readyDrafts.flatMap((draft) =>
    (draft.items || []).map((it) =>
      normalizeLineItem(
        {
          ...it,
          description:
            it.description ||
            `${draft.docNo || draft.id} ${it.material_name || it.product_name || ''}`.trim(),
        },
        { id: draft.id, docNo: draft.docNo }
      )
    )
  );

  const subtotal = sumBy(readyDrafts, 'subtotal');
  const taxAmount = sumBy(readyDrafts, 'taxAmount');
  const totalAmount = money(subtotal + taxAmount);

  const rates = readyDrafts.map((d) => toNumber(d.taxRate, 0));
  const sameRate = rates.every((r) => Math.abs(r - rates[0]) < 1e-6);
  const taxRate = sameRate
    ? rates[0]
    : subtotal > 0
      ? money(taxAmount / subtotal)
      : rates[0] || 0;

  const roleOrder = isAp ? AP_ROLE_ORDER : AR_ROLE_ORDER;
  const roleMap = new Map();
  for (const draft of readyDrafts) {
    for (const line of draft.entryLines || []) {
      const role = line.role || 'other';
      if (!roleMap.has(role)) {
        roleMap.set(role, {
          ...normalizeEntryLine(line),
          debit_amount: 0,
          credit_amount: 0,
        });
      }
      const acc = roleMap.get(role);
      acc.debit_amount = money(acc.debit_amount + toNumber(line.debit_amount, 0));
      acc.credit_amount = money(acc.credit_amount + toNumber(line.credit_amount, 0));
    }
  }

  const docsLabel = formatDocLabel(docNos); // 全量单号
  const singlePartyId = partyIds.length === 1 ? partyIds[0] : null;
  const ordered = [];
  for (const role of roleOrder) {
    if (!roleMap.has(role)) continue;
    const line = roleMap.get(role);
    roleMap.delete(role);
    // 合并后辅助核算：同一往来单位时落到分录；多单位不写（避免误挂）
    const withParty = {
      ...line,
      description: `${stripSingleDocSuffix(line.description || role)}（合并 ${docsLabel}）`,
      editable: true,
    };
    if (isAp && singlePartyId) {
      // 应付/GR-IR 行挂供应商；进项税一般不强制
      if (role === ENTRY_ROLES.PAYABLE || role === ENTRY_ROLES.COST) {
        withParty.supplier_id = singlePartyId;
      }
    } else if (!isAp && singlePartyId) {
      if (role === ENTRY_ROLES.RECEIVABLE) {
        withParty.customer_id = singlePartyId;
      }
    }
    ordered.push(withParty);
  }
  for (const line of roleMap.values()) {
    ordered.push({ ...line, editable: true });
  }
  const entryLines = ordered.filter(
    (l) => l.debit_amount > 0 || l.credit_amount > 0
  );

  const accounts = {
    ...(readyDrafts[0].accounts || {}),
    ...accountsFromEntryLines(entryLines),
  };

  const partyLabel = formatPartyLabel(partyNames);
  // 凭证头摘要：往来 + 全量业务单号，便于账簿/联查
  const description = isAp
    ? `供应商 ${partyLabel} 应付账款（合并入库 ${docsLabel}）`
    : `客户 ${partyLabel} 应收账款（合并出库 ${docsLabel}）`;

  const dates = readyDrafts.map((d) => d.entryDate).filter(Boolean).sort();
  const entryDate = dates[dates.length - 1] || null;

  return {
    id: readyDrafts[0].id,
    businessType,
    isMerged: true,
    docNo: docNos.join('、'),
    sourceIds: readyDrafts.map((d) => d.id),
    sourceDocs: readyDrafts.map((d) => ({
      id: d.id,
      docNo: d.docNo,
      partyName: d.partyName,
      partyId: d.partyId,
      totalAmount: d.totalAmount,
      subtotal: d.subtotal,
      taxAmount: d.taxAmount,
    })),
    sourceOrderNo: readyDrafts
      .map((d) => d.sourceOrderNo)
      .filter(Boolean)
      .join('、'),
    partyName: partyLabel,
    partyId: partyIds.length === 1 ? partyIds[0] : null,
    entryDate,
    description,
    skipped: false,
    skipMessage: null,
    subtotal,
    taxAmount,
    taxRate,
    totalAmount,
    items,
    entryLines,
    accounts,
    totals: {
      debit: sumBy(entryLines, 'debit_amount'),
      credit: sumBy(entryLines, 'credit_amount'),
    },
  };
}

/**
 * 规范生成侧 options.overrides（只认 camelCase）
 */
function canonicalizeGenerateOverrides(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = normalizeOverrideRow(raw);
  if (!row) return null;
  return {
    invoiceDate: row.invoiceDate,
    notes: row.notes,
    description: row.description,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    items: row.items,
    accounts: row.accounts,
  };
}

module.exports = {
  ENTRY_ROLES,
  ROLE_TO_ACCOUNT_KEY,
  AP_ROLE_ORDER,
  AR_ROLE_ORDER,
  money,
  firstDefined,
  toPositiveInt,
  toNumber,
  parseMergeFlag,
  asArray,
  allocateTaxBySubtotal,
  assertEntryLinesMatchTotals,
  syncEntryLinesToAmounts,
  assertInvoiceTaxSum,
  normalizeLineItem,
  normalizeEntryLine,
  accountsFromEntryLines,
  normalizeAccounts,
  normalizeOverrideRow,
  normalizeOverridesMap,
  resolveMergedPayload,
  mergeDraftsIntoVoucher,
  canonicalizeGenerateOverrides,
  formatDocLabel,
  formatPartyLabel,
  sumBy,
};
