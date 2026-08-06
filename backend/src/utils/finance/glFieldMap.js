/**
 * 总账 / 现金 / 预算 字段契约（SSOT）
 * - DB / SQL / 模型内部：snake_case
 * - HTTP API：camelCase
 * - 转换只在边界发生
 */

const { formatDate } = require('./invoiceFieldMap');
const { toNumber } = require('../money');

function toBool(v) {
  if (v === true || v === 1 || v === '1') return true;
  if (v === false || v === 0 || v === '0') return false;
  return Boolean(v);
}

/** 会计科目 */
function toGlAccountApi(row) {
  if (row == null) return null;
  if (Array.isArray(row)) return row.map((r) => toGlAccountApi(r));
  return {
    id: row.id,
    accountCode: row.account_code ?? row.accountCode ?? null,
    accountName: row.account_name ?? row.accountName ?? null,
    accountType: row.account_type ?? row.accountType ?? null,
    parentId: row.parent_id ?? row.parentId ?? null,
    isDebit: row.is_debit != null ? toBool(row.is_debit) : row.isDebit ?? null,
    isActive: row.is_active != null ? toBool(row.is_active) : row.isActive ?? null,
    currencyCode: row.currency_code ?? row.currencyCode ?? null,
    description: row.description ?? null,
    type: row.type ?? null,
    openingDebit: row.opening_debit != null ? toNumber(row.opening_debit, 0) : null,
    openingCredit: row.opening_credit != null ? toNumber(row.opening_credit, 0) : null,
    openingBalanceDate: formatDate(row.opening_balance_date ?? row.openingBalanceDate),
    openingBalanceSet:
      row.opening_balance_set != null ? toBool(row.opening_balance_set) : null,
    hasCustomer: row.has_customer != null ? toBool(row.has_customer) : null,
    hasSupplier: row.has_supplier != null ? toBool(row.has_supplier) : null,
    hasEmployee: row.has_employee != null ? toBool(row.has_employee) : null,
    hasDepartment: row.has_department != null ? toBool(row.has_department) : null,
    hasProject: row.has_project != null ? toBool(row.has_project) : null,
    createdAt: formatDate(row.created_at ?? row.createdAt),
    updatedAt: formatDate(row.updated_at ?? row.updatedAt),
  };
}

function fromGlAccountApi(body = {}) {
  const row = {
    id: body.id,
    account_code: body.accountCode,
    account_name: body.accountName,
    account_type: body.accountType,
    parent_id: body.parentId,
    is_debit: body.isDebit,
    is_active: body.isActive,
    currency_code: body.currencyCode,
    description: body.description,
    type: body.type,
    has_customer: body.hasCustomer,
    has_supplier: body.hasSupplier,
    has_employee: body.hasEmployee,
    has_department: body.hasDepartment,
    has_project: body.hasProject,
  };
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

function fromGlAccountListQuery(query = {}) {
  const filters = {};
  if (query.accountCode) {
    filters.account_code = query.accountCode;
  }
  if (query.accountName) {
    filters.account_name = query.accountName;
  }
  if (query.accountType) {
    filters.account_type = query.accountType;
  }
  return filters;
}

/** 会计分录明细 */
function toGlEntryItemApi(item = {}) {
  if (item == null) return null;
  return {
    id: item.id ?? null,
    entryId: item.entry_id ?? item.entryId ?? null,
    lineNumber: item.line_number ?? item.lineNumber ?? null,
    accountId: item.account_id ?? item.accountId ?? null,
    accountCode: item.account_code ?? item.accountCode ?? null,
    accountName: item.account_name ?? item.accountName ?? null,
    accountIsActive:
      item.account_is_active != null ? toBool(item.account_is_active) : item.accountIsActive ?? null,
    debitAmount: toNumber(item.debit_amount ?? item.debitAmount, 0),
    creditAmount: toNumber(item.credit_amount ?? item.creditAmount, 0),
    currencyCode: item.currency_code ?? item.currencyCode ?? null,
    exchangeRate: toNumber(item.exchange_rate ?? item.exchangeRate, 1),
    costCenterId: item.cost_center_id ?? item.costCenterId ?? null,
    projectId: item.project_id ?? item.projectId ?? null,
    description: item.description ?? null,
  };
}

/** 会计分录主表 */
function toGlEntryApi(row) {
  if (row == null) return null;
  if (Array.isArray(row)) return row.map((r) => toGlEntryApi(r));

  const voucherWord = row.voucher_word ?? row.voucherWord ?? null;
  const voucherNumber = row.voucher_number ?? row.voucherNumber ?? null;
  const entryNumberRaw = row.entry_number ?? row.entryNumber ?? null;
  const displayEntryNumber =
    voucherWord && voucherNumber ? `${voucherWord}-${voucherNumber}` : entryNumberRaw;

  const api = {
    id: row.id,
    entryNumber: displayEntryNumber,
    technicalId: entryNumberRaw,
    voucherWord,
    voucherNumber,
    entryDate: formatDate(row.entry_date ?? row.entryDate),
    postingDate: formatDate(row.posting_date ?? row.postingDate),
    documentType: row.document_type ?? row.documentType ?? null,
    documentNumber: row.document_number ?? row.documentNumber ?? null,
    periodId: row.period_id ?? row.periodId ?? null,
    periodName: row.period_name ?? row.periodName ?? null,
    fiscalYear: row.fiscal_year ?? row.fiscalYear ?? null,
    isPosted: toBool(row.is_posted ?? row.isPosted),
    isReversed: toBool(row.is_reversed ?? row.isReversed),
    isReversalEntry: toBool(row.is_reversal_entry ?? row.isReversalEntry),
    reversalOfEntryId: row.reversal_of_entry_id ?? row.reversalOfEntryId ?? null,
    reversalEntryId: row.reversal_entry_id ?? row.reversalEntryId ?? null,
    description: row.description ?? null,
    summary: row.description ?? row.summary ?? null,
    totalDebit: toNumber(row.total_debit ?? row.totalDebit, 0),
    totalCredit: toNumber(row.total_credit ?? row.totalCredit, 0),
    totalAmount: toNumber(
      row.total_amount ?? row.totalAmount ?? row.total_debit ?? row.totalDebit,
      0
    ),
    createdBy: row.created_by ?? row.createdBy ?? null,
    creatorName: row.creator_name ?? row.creator_username ?? row.creatorName ?? null,
    createdAt: formatDate(row.created_at ?? row.createdAt),
    updatedAt: formatDate(row.updated_at ?? row.updatedAt),
    status: row.status ?? (toBool(row.is_posted ?? row.isPosted) ? 'posted' : 'draft'),
  };

  if (Array.isArray(row.items)) {
    api.items = row.items.map((it) => toGlEntryItemApi(it));
  }
  return api;
}

function fromGlEntryListQuery(query = {}) {
  const filters = {};
  if (query.entryNumber) {
    filters.entry_number = query.entryNumber;
  }
  if (query.startDate) {
    filters.start_date = query.startDate;
  }
  if (query.endDate) {
    filters.end_date = query.endDate;
  }
  if (query.documentType) {
    filters.document_type = query.documentType;
  }
  if (query.voucherWord) {
    filters.voucher_word = query.voucherWord;
  }
  if (query.periodId) {
    filters.period_id = parseInt(query.periodId, 10);
  }
  if (query.isPosted !== undefined && query.isPosted !== '') {
    filters.is_posted = query.isPosted === true || query.isPosted === 'true' || query.isPosted === 1;
  } else if (query.is_posted !== undefined && query.is_posted !== '') {
    filters.is_posted = query.is_posted === true || query.is_posted === 'true' || query.is_posted === 1;
  }
  return filters;
}

/** 银行交易 */
function toBankTransactionApi(row) {
  if (row == null) return null;
  if (Array.isArray(row)) return row.map((r) => toBankTransactionApi(r));
  return {
    id: row.id,
    transactionNumber: row.transaction_number ?? row.transactionNumber ?? null,
    transactionDate: formatDate(row.transaction_date ?? row.transactionDate),
    transactionType: row.transaction_type ?? row.transactionType ?? null,
    transactionCategory: row.transaction_category ?? row.transactionCategory ?? null,
    bankAccountId: row.bank_account_id ?? row.bankAccountId ?? null,
    accountName: row.account_name ?? row.accountName ?? null,
    bankName: row.bank_name ?? row.bankName ?? null,
    amount: toNumber(row.amount, 0),
    relatedParty: row.related_party ?? row.relatedParty ?? null,
    description: row.description ?? null,
    referenceNumber: row.reference_number ?? row.referenceNumber ?? null,
    isReconciled: toBool(row.is_reconciled ?? row.isReconciled),
    status: row.status ?? null,
    relatedInvoiceId: row.related_invoice_id ?? row.relatedInvoiceId ?? null,
    relatedInvoiceType: row.related_invoice_type ?? row.relatedInvoiceType ?? null,
    relatedInvoiceNumber: row.related_invoice_number ?? row.relatedInvoiceNumber ?? null,
    entryNumber: row.entry_number ?? row.entryNumber ?? null,
    glEntryId: row.gl_entry_id ?? row.glEntryId ?? null,
    createdAt: formatDate(row.created_at ?? row.createdAt),
    updatedAt: formatDate(row.updated_at ?? row.updatedAt),
  };
}

/** 预算主表 + 明细 */
function toBudgetDetailApi(row = {}) {
  if (row == null) return null;
  return {
    id: row.id ?? null,
    budgetId: row.budget_id ?? row.budgetId ?? null,
    accountId: row.account_id ?? row.accountId ?? null,
    accountCode: row.account_code ?? row.accountCode ?? null,
    accountName: row.account_name ?? row.accountName ?? null,
    departmentId: row.department_id ?? row.departmentId ?? null,
    departmentName: row.department_name ?? row.departmentName ?? null,
    budgetAmount: toNumber(row.budget_amount ?? row.budgetAmount, 0),
    usedAmount: toNumber(row.used_amount ?? row.usedAmount, 0),
    remainingAmount: toNumber(row.remaining_amount ?? row.remainingAmount, 0),
    actualAmount: toNumber(row.actual_amount ?? row.actualAmount, 0),
    executionRate:
      row.execution_rate != null
        ? toNumber(row.execution_rate, 0)
        : row.executionRate != null
          ? toNumber(row.executionRate, 0)
          : null,
    warningThreshold:
      row.warning_threshold != null
        ? toNumber(row.warning_threshold, 0)
        : row.warningThreshold != null
          ? toNumber(row.warningThreshold, 0)
          : null,
    remarks: row.remarks ?? null,
  };
}

function toBudgetApi(row) {
  if (row == null) return null;
  if (Array.isArray(row)) return row.map((r) => toBudgetApi(r));
  const api = {
    id: row.id,
    budgetNo: row.budget_no ?? row.budgetNo ?? null,
    budgetName: row.budget_name ?? row.budgetName ?? null,
    budgetYear: row.budget_year ?? row.budgetYear ?? null,
    budgetType: row.budget_type ?? row.budgetType ?? null,
    departmentId: row.department_id ?? row.departmentId ?? null,
    departmentName: row.department_name ?? row.departmentName ?? null,
    startDate: formatDate(row.start_date ?? row.startDate),
    endDate: formatDate(row.end_date ?? row.endDate),
    totalAmount: toNumber(row.total_amount ?? row.totalAmount, 0),
    usedAmount: toNumber(row.used_amount ?? row.usedAmount, 0),
    status: row.status ?? null,
    creatorName: row.creator_name ?? row.creatorName ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdAt: formatDate(row.created_at ?? row.createdAt),
    updatedAt: formatDate(row.updated_at ?? row.updatedAt),
    remarks: row.remarks ?? null,
  };
  const details = row.details || row.items;
  if (Array.isArray(details)) {
    api.details = details.map((d) => toBudgetDetailApi(d));
  }
  return api;
}

function fromBudgetApi(body = {}) {
  const row = {
    id: body.id,
    budget_name: body.budgetName ?? body.budget_name,
    budget_year: body.budgetYear ?? body.budget_year,
    budget_type: body.budgetType ?? body.budget_type,
    department_id: body.departmentId ?? body.department_id,
    start_date: body.startDate ?? body.start_date,
    end_date: body.endDate ?? body.end_date,
    total_amount: body.totalAmount ?? body.total_amount,
    remarks: body.remarks,
    status: body.status,
  };
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

function fromBudgetDetailApi(body = {}) {
  const row = {
    id: body.id,
    account_id: body.accountId ?? body.account_id,
    department_id: body.departmentId ?? body.department_id,
    budget_amount: body.budgetAmount ?? body.budget_amount,
    warning_threshold: body.warningThreshold ?? body.warning_threshold,
    remarks: body.remarks,
  };
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

module.exports = {
  toGlAccountApi,
  fromGlAccountApi,
  fromGlAccountListQuery,
  toGlEntryApi,
  toGlEntryItemApi,
  fromGlEntryListQuery,
  toBankTransactionApi,
  toBudgetApi,
  toBudgetDetailApi,
  fromBudgetApi,
  fromBudgetDetailApi,
  formatDate,
  toNumber,
};
