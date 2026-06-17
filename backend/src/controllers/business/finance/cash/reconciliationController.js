/**
 * reconciliationController.js
 * @description 从 cashController.js 拆分的子控制器 — reconciliation
 * @date 2026-06-15
 */

/**
 * cashController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../../utils/responseHandler');
const { logger } = require('../../../../utils/logger');
const { parsePagination } = require('../../../../utils/safePagination');
const cash = require('../../../../models/cash');
const { validationResult } = require('express-validator');
const cashTransactionService = require('../../../../services/cashTransactionService');
const BankAccountModel = require('../../../../models/cash/Account');
const BankTransactionModel = require('../../../../models/cash/Transaction');
const ReconciliationModel = require('../../../../models/cash/Reconciliation');
const CashReportsModel = require('../../../../models/cash/Reports');
const CashTransactionModel = require('../../../../models/cash/CashTransaction');
const { getAuthenticatedUserId } = require('../../../../utils/authContext');
const { currentDateString, toLocalDateString } = require('../../../../utils/dateUtils');
const { financeConfig } = require('../../../../config/financeConfig');
const { safeParseId } = require('../../../../utils/safeParseId');

/**
 * 安全的 parseFloat，返回 NaN 时抛出明确错误
 * @param {*} value - 待解析的值
 * @param {string} label - 字段名，用于错误提示
 * @returns {number}
 */
function safeParseFloat(value, label = 'amount') {
  const num = parseFloat(value);
  if (isNaN(num)) {
    throw new Error(`${label} 必须是有效的数字，收到: ${value}`);
  }
  return num;
}

/**
 * 安全的 parseInt，返回 NaN 时抛出明确错误
 * @param {*} value - 待解析的值
 * @param {string} label - 字段名，用于错误提示
 * @returns {number}
 */
function safeParseInt(value, label = 'id') {
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`${label} 必须是有效的整数，收到: ${value}`);
  }
  return num;
}

function normalizeExcelDate(value) {
  if (!value) return null;
  if (value instanceof Date) return toLocalDateString(value);
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    return toLocalDateString(new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000));
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split('-');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return toLocalDateString(parsed);
}

function addMonthsToCurrentDateString(months) {
  const date = new Date();
  date.setMonth(date.getMonth() + Number(months || 0));
  return toLocalDateString(date);
}

function normalizeStatementType(value, amount) {
  const text = String(value || '').trim().toLowerCase();
  if (['income', 'in', 'credit', 'deposit'].includes(text) || ['收入', '存款', '转入', '贷方'].includes(value)) {
    return 'income';
  }
  if (['expense', 'out', 'debit', 'withdrawal'].includes(text) || ['支出', '取款', '转出', '借方'].includes(value)) {
    return 'expense';
  }
  return amount >= 0 ? 'income' : 'expense';
}

function sendCashBusinessError(res, error, fallback) {
  if (error.statusCode && error.statusCode < 500) {
    return ResponseHandler.error(
      res,
      error.message || fallback,
      error.code || 'VALIDATION_ERROR',
      error.statusCode
    );
  }

  const message = error.message || fallback;
  if (/cannot|不能|无法|不允许|已完成|已审核|未审核|状态|不存在|重复/.test(message)) {
    const statusCode = /不存在/.test(message) ? 404 : 400;
    return ResponseHandler.error(
      res,
      message,
      statusCode === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR',
      statusCode,
      error
    );
  }

  return ResponseHandler.error(res, fallback, 'SERVER_ERROR', 500, error);
}

const BANK_ACCOUNT_TYPES = new Set(['活期', '定期', '信用卡', '其他']);
const BANK_ACCOUNT_STATUSES = new Set(['active', 'frozen']);

function createCashValidationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  error.statusCode = 400;
  return error;
}

function normalizeBankAccountType(value) {
  const accountType = value || '活期';
  if (!BANK_ACCOUNT_TYPES.has(accountType)) {
    throw createCashValidationError('无效的银行账户类型，仅支持：活期、定期、信用卡、其他');
  }
  return accountType;
}

function normalizeBankAccountStatus(value) {
  if (!BANK_ACCOUNT_STATUSES.has(value)) {
    throw createCashValidationError('无效的银行账户状态，仅支持 active 或 frozen');
  }
  return value;
}

function formatBankAccountForClient(account) {
  const createdAt = account.created_at ? new Date(account.created_at) : new Date();
  const lastTxDate = account.last_transaction_date
    ? new Date(account.last_transaction_date)
    : null;
  const accountType = account.account_type || '活期';

  return {
    id: account.id,
    accountName: account.account_name || '',
    accountNumber: account.account_number || '',
    bankName: account.bank_name || '',
    branchName: account.branch_name || '',
    currency: account.currency_code || financeConfig.get('account.defaultCurrency', 'CNY'),
    balance: account.current_balance !== undefined ? parseFloat(account.current_balance) : 0,
    initialBalance: account.opening_balance !== undefined ? parseFloat(account.opening_balance) : 0,
    openDate: toLocalDateString(createdAt),
    status: account.is_active ? 'active' : 'frozen',
    accountType,
    purpose: accountType,
    notes: account.notes || '',
    lastTransactionDate: lastTxDate ? toLocalDateString(lastTxDate) : '',
  };
}

function normalizeBankTransactionTypeFilter(value) {
  if (!value || String(value).trim() === '') return undefined;
  const type = String(value).trim();
  const groups = {
    income: ['存款', '转入', '利息', '收入', 'income', 'deposit', 'transfer_in', 'interest'],
    expense: ['取款', '转出', '费用', '支出', 'expense', 'withdrawal', 'transfer_out', 'fee'],
    transfer: ['转账', '转入', '转出', 'transfer', 'transfer_in', 'transfer_out'],
  };
  return groups[type] || type;
}

function getFirstValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
  }
  return null;
}

function getCellRawValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if (value.text !== undefined) return value.text;
  if (value.result !== undefined) return value.result;
  if (value.richText) return value.richText.map((item) => item.text || '').join('');
  if (value.hyperlink && value.text) return value.text;
  return String(value);
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsvRows(file) {
  const content = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  });
}

function parseStatementAmount(row) {
  const amountValue = getFirstValue(row, [
    'amount',
    'Amount',
    '交易金额',
    '金额',
    '发生额',
    '收入金额',
    '支出金额',
    '借方金额',
    '贷方金额',
  ]);

  if (amountValue !== null && amountValue !== undefined && amountValue !== '') {
    const amount = Math.abs(parseFloat(String(amountValue).replace(/,/g, '')));
    if (!Number.isNaN(amount) && amount > 0) return amount;
  }

  const income = parseFloat(String(getFirstValue(row, ['收入', '收入金额', '贷方金额', 'credit']) || '').replace(/,/g, ''));
  const expense = parseFloat(String(getFirstValue(row, ['支出', '支出金额', '借方金额', 'debit']) || '').replace(/,/g, ''));

  if (!Number.isNaN(income) && income > 0) return income;
  if (!Number.isNaN(expense) && expense > 0) return expense;
  return null;
}

function parseStatementSignedAmount(row) {
  const amountValue = getFirstValue(row, [
    'amount',
    'Amount',
    '交易金额',
    '金额',
    '发生额',
  ]);
  if (amountValue === null || amountValue === undefined || amountValue === '') return null;

  const amount = parseFloat(String(amountValue).replace(/,/g, ''));
  return Number.isNaN(amount) ? null : amount;
}

async function readStatementRows(file) {
  if (!file || !file.buffer) {
    throw new Error('No statement file uploaded');
  }

  if (/\.csv$/i.test(file.originalname || '')) {
    return parseCsvRows(file);
  }

  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const headers = [];
  const rows = [];

  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber - 1] = String(getCellRawValue(cell.value) || '').trim();
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rowData = {};
    row.eachCell((cell, colNumber) => {
      rowData[headers[colNumber - 1]] = getCellRawValue(cell.value);
    });
    rows.push(rowData);
  });

  return rows;
}

/**
 * 现金管理控制器
 */

const reconciliationController = {
  /**
   * 获取对账记录
   */
  getReconciliations: async (req, res) => {
    try {
      const pagination = parsePagination(req.query.page, req.query.limit || req.query.pageSize, {
        defaultPageSize: 10,
        maxPageSize: 100,
      });
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        accountId: req.query.accountId ? parseInt(req.query.accountId) : null,
        status: req.query.status,
        page: pagination.page,
        limit: pagination.pageSize,
      };

      const result = await ReconciliationModel.getReconciliations(filters);

      ResponseHandler.paginated(
        res,
        result.data,
        result.total,
        filters.page,
        filters.limit,
        '获取银行账户成功'
      );
    } catch (error) {
      ResponseHandler.error(res, '获取对账记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单条对账记录
   */
  getReconciliationById: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的对账ID', 'VALIDATION_ERROR', 400);
      }

      const reconciliation = await ReconciliationModel.getReconciliationById(id);

      if (!reconciliation) {
        return ResponseHandler.error(res, '对账记录不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, reconciliation, '操作成功');
    } catch (error) {
      logger.error('Error fetching reconciliation:', error);
      ResponseHandler.error(res, '获取对账记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建对账记录
   */
  createReconciliation: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.error(res, '验证失败', 'VALIDATION_ERROR', 400, {
          errors: errors.array(),
        });
      }

      const reconciliation = {
        account_id: safeParseInt(req.body.account_id, 'account_id'),
        reconciliation_date: req.body.reconciliation_date,
        bank_statement_balance: safeParseFloat(req.body.bank_statement_balance, 'bank_statement_balance'),
        book_balance: safeParseFloat(req.body.book_balance, 'book_balance'),
        status: req.body.status || 'draft',
        notes: req.body.notes,
        items: req.body.items || [],
        created_by: getAuthenticatedUserId(req),
      };

      const insertId = await ReconciliationModel.createReconciliation(reconciliation);

      ResponseHandler.success(
        res,
        { id: insertId, ...reconciliation },
        '对账记录创建成功',
        201
      );
    } catch (error) {
      logger.error('Error creating reconciliation:', error);
      ResponseHandler.error(res, '创建对账记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新对账记录
   */
  updateReconciliation: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.error(res, '验证失败', 'VALIDATION_ERROR', 400, {
          errors: errors.array(),
        });
      }

      const id = safeParseId(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的对账ID', 'VALIDATION_ERROR', 400);
      }

      // 检查对账记录是否存在
      const existingReconciliation = await ReconciliationModel.getReconciliationById(id);

      if (!existingReconciliation) {
        return ResponseHandler.error(res, '对账记录不存在', 'NOT_FOUND', 404);
      }

      const reconciliation = {
        account_id: safeParseInt(req.body.account_id, 'account_id'),
        reconciliation_date: req.body.reconciliation_date,
        bank_statement_balance: safeParseFloat(req.body.bank_statement_balance, 'bank_statement_balance'),
        book_balance: safeParseFloat(req.body.book_balance, 'book_balance'),
        status: req.body.status,
        notes: req.body.notes,
        items: req.body.items || [],
      };

      const updated = await ReconciliationModel.updateReconciliation(id, reconciliation);

      if (updated) {
        return ResponseHandler.success(res, { id, ...reconciliation }, '对账记录更新成功');
      } else {
        return ResponseHandler.error(res, '对账记录更新失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('Error updating reconciliation:', error);
      ResponseHandler.error(res, '更新对账记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取未对账交易列表
   */
  getUnreconciledTransactions: async (req, res) => {
    try {
      const filters = {
        accountId: req.query.accountId ? parseInt(req.query.accountId) : null,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      };

      // 从数据库查询未对账交易
      const result = await BankTransactionModel.getBankTransactions({
        bank_account_id: filters.accountId,
        start_date: filters.startDate,
        end_date: filters.endDate,
        is_reconciled: false,
      });

      return ResponseHandler.success(res, result.transactions || [], '获取未对账交易成功');
    } catch (error) {
      logger.error('获取未对账交易失败:', error);
      ResponseHandler.error(res, '获取未对账交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取已对账交易列表
   */
  getReconciledTransactions: async (req, res) => {
    try {
      const filters = {
        accountId: req.query.accountId ? parseInt(req.query.accountId) : null,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      };

      // 从数据库查询已对账交易
      const result = await BankTransactionModel.getBankTransactions({
        bank_account_id: filters.accountId,
        start_date: filters.startDate,
        end_date: filters.endDate,
        is_reconciled: true,
      });

      return ResponseHandler.success(res, result.transactions || [], '获取已对账交易成功');
    } catch (error) {
      logger.error('获取已对账交易失败:', error);
      ResponseHandler.error(res, '获取已对账交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取对账统计信息
   */
  getReconciliationStats: async (req, res) => {
    try {
      const filters = {
        accountId: req.query.accountId ? parseInt(req.query.accountId) : null,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      };

      // 从数据库获取对账统计
      const accountId = filters.accountId;
      const bankTransactionFilters = {
        bank_account_id: accountId,
        start_date: filters.startDate,
        end_date: filters.endDate,
      };

      // 获取未对账和已对账交易统计
      const [unreconciledResult, reconciledResult] = await Promise.all([
        BankTransactionModel.getBankTransactions({
          ...bankTransactionFilters,
          is_reconciled: false,
          noPagination: true,
        }),
        BankTransactionModel.getBankTransactions({
          ...bankTransactionFilters,
          is_reconciled: true,
          noPagination: true,
        }),
      ]);

      const unreconciledTransactions = unreconciledResult?.transactions || [];
      const reconciledTransactions = reconciledResult?.transactions || [];
      const unreconciledItems =
        unreconciledResult?.pagination?.total || unreconciledTransactions.length || 0;
      const reconciledItems = reconciledResult?.pagination?.total || reconciledTransactions.length || 0;
      const calculateNetAmount = (transactions) =>
        transactions.reduce((sum, transaction) => {
          const amount = parseFloat(transaction.amount) || 0;
          const isIncome = ['存款', '转入', '利息', 'income'].includes(
            transaction.transaction_type
          );
          return sum + (isIncome ? amount : -amount);
        }, 0);

      // 获取账户信息
      let accountInfo = { accountId: accountId || null };
      if (accountId) {
        const account = await BankAccountModel.getBankAccountById(accountId);
        if (account) {
          accountInfo = {
            accountId: account.id,
            accountName: account.account_name,
            accountNumber: account.account_number,
            bankName: account.bank_name,
          };
        }
      }

      const bookBalance = accountInfo.accountId
        ? parseFloat((await BankAccountModel.getBankAccountById(accountId))?.current_balance || 0)
        : 0;
      const unreconciledNet = calculateNetAmount(unreconciledTransactions);

      const stats = {
        bookBalance,
        bankBalance: bookBalance - unreconciledNet,
        difference: unreconciledNet,
        unreconciledItems,
        reconciledItems,
        totalItems: unreconciledItems + reconciledItems,
        accountInfo,
      };

      return ResponseHandler.success(res, stats, '获取对账统计成功');
    } catch (error) {
      logger.error('获取对账统计失败:', error);
      ResponseHandler.error(res, '获取对账统计失败', 'SERVER_ERROR', 500, error);
    }
  },

  submitForAudit: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      // 使用BankTransactionModel而不是CashTransactionModel，因为这是银行交易
      const success = await BankTransactionModel.submitForAudit(id, req.user?.id || req.body.userId || 'system');

      if (success) {
        return ResponseHandler.success(res, { id, status: 'pending' }, '交易已提交审核');
      } else {
        return ResponseHandler.error(res, '提交审核失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('提交审核失败:', error);
      return sendCashBusinessError(res, error, '提交审核失败');
    }
  },

  /**
   * 审核交易
   */
  auditTransaction: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);
      const { status, remark, auditorId } = req.body;

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      if (!['approved', 'rejected'].includes(status)) {
        return ResponseHandler.error(
          res,
          '无效的审核状态，仅支持 approved 或 rejected',
          'VALIDATION_ERROR',
          400
        );
      }

      let success = false;
      const userId = req.user?.id || auditorId || 'system';

      // 使用BankTransactionModel进行审核操作
      if (status === 'approved') {
        success = await BankTransactionModel.approveTransaction(id, userId);
      } else if (status === 'rejected') {
        success = await BankTransactionModel.rejectTransaction(id, userId, remark || '');
      }

      if (success) {
        return ResponseHandler.success(
          res,
          {
            id,
            status,
            newBalance: status === 'approved' ? success.newBalance : undefined,
            entryId: status === 'approved' ? success.entryId : undefined,
            entryNumber: status === 'approved' ? success.entryNumber : undefined,
          },
          '审核操作成功'
        );
      } else {
        return ResponseHandler.error(res, '审核操作失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('审核操作失败:', error);
      return sendCashBusinessError(res, error, '审核操作失败');
    }
  },

  /**
   * 取消交易对账标记
   */
  cancelTransactionReconciliation: async (req, res) => {
    try {
      const { transactionId, accountId } = req.body;

      if (!transactionId) {
        return ResponseHandler.error(res, '缺少交易ID', 'VALIDATION_ERROR', 400);
      }

      // 更新数据库中的交易记录，取消对账标记
      const success = await ReconciliationModel.cancelReconciliation(transactionId);

      if (success) {
        return ResponseHandler.success(
          res,
          {
            transactionId,
            accountId,
            status: 'unreconciled',
            reconciliationDate: null,
          },
          '交易对账标记已取消'
        );
      } else {
        return ResponseHandler.error(res, '交易不存在或更新失败', 'NOT_FOUND', 404);
      }
    } catch (error) {
      logger.error('取消交易对账标记失败:', error);
      ResponseHandler.error(res, '取消交易对账标记失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取已匹配的交易
   * 注意：交易匹配功能需要创建 transaction_matches 关联表后才能使用
   */
  getMatchedTransactions: async (req, res) => {
    try {
      const statementItemId = req.query.statementItemId
        ? parseInt(req.query.statementItemId)
        : null;

      if (!statementItemId) {
        return ResponseHandler.error(res, '缺少银行对账单明细ID', 'VALIDATION_ERROR', 400);
      }

      const transactions = await ReconciliationModel.getMatchedTransactions(statementItemId);
      return ResponseHandler.success(res, transactions, '获取已匹配交易成功');
    } catch (error) {
      logger.error('获取已匹配交易失败:', error);
      ResponseHandler.error(res, '获取已匹配交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取可能匹配的交易
   * 注意：交易匹配功能需要创建 transaction_matches 关联表后才能使用
   */
  getPossibleMatchingTransactions: async (req, res) => {
    try {
      const statementItemId = req.query.statementItemId
        ? parseInt(req.query.statementItemId)
        : null;
      const accountId = req.query.accountId ? parseInt(req.query.accountId) : null;

      if (!statementItemId || !accountId) {
        return ResponseHandler.error(res, '缺少必要参数', 'VALIDATION_ERROR', 400);
      }

      const transactions = await ReconciliationModel.getPossibleMatchingTransactions(
        statementItemId,
        accountId
      );
      return ResponseHandler.success(res, transactions, '获取可匹配交易成功');
    } catch (error) {
      logger.error('获取可能匹配交易失败:', error);
      if (error.statusCode && error.statusCode < 500) {
        return ResponseHandler.error(
          res,
          error.message,
          error.code || 'VALIDATION_ERROR',
          error.statusCode
        );
      }
      ResponseHandler.error(res, '获取可能匹配交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 确认交易匹配
   * 注意：交易匹配功能需要创建 transaction_matches 关联表后才能使用
   */
  confirmTransactionMatch: async (req, res) => {
    try {
      const { statementItemId, transactionIds, accountId } = req.body;

      if (!statementItemId || !transactionIds || !transactionIds.length || !accountId) {
        return ResponseHandler.error(res, '缺少必要参数', 'VALIDATION_ERROR', 400);
      }

      const result = await ReconciliationModel.confirmTransactionMatch(
        statementItemId,
        transactionIds,
        accountId,
        getAuthenticatedUserId(req)
      );
      return ResponseHandler.success(res, result, '交易匹配成功');
    } catch (error) {
      logger.error('确认交易匹配失败:', error);
      if (error.statusCode && error.statusCode < 500) {
        return ResponseHandler.error(
          res,
          error.message,
          error.code || 'VALIDATION_ERROR',
          error.statusCode
        );
      }
      ResponseHandler.error(res, '确认交易匹配失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = reconciliationController;
