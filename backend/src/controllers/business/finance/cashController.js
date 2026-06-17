/**
 * cashController.js
 * @description 现金管理统一控制器入口
 *
 * 方法实现按职责拆分到 cash/ 子目录：
 *   - cash/bankAccountController.js     — 银行账户管理
 *   - cash/bankTransactionController.js — 银行交易管理
 *   - cash/reconciliationController.js  — 银行对账
 *   - cash/cashTransactionController.js — 现金交易管理
 *
 * @date 2025-08-27
 * @version 2.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { parsePagination } = require('../../../utils/safePagination');
const cash = require('../../../models/cash');
const { validationResult } = require('express-validator');
const cashTransactionService = require('../../../services/cashTransactionService');
const BankAccountModel = require('../../../models/cash/Account');
const BankTransactionModel = require('../../../models/cash/Transaction');
const ReconciliationModel = require('../../../models/cash/Reconciliation');
const CashReportsModel = require('../../../models/cash/Reports');
const CashTransactionModel = require('../../../models/cash/CashTransaction');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const { currentDateString, toLocalDateString } = require('../../../utils/dateUtils');
const { financeConfig } = require('../../../config/financeConfig');
const { safeParseId } = require('../../../utils/safeParseId');
const BusinessError = require('../../../utils/BusinessError');

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

// --- 子控制器导入 ---
const bankAccountCtrl = require('./cash/bankAccountController');
const bankTransactionCtrl = require('./cash/bankTransactionController');
const reconciliationCtrl = require('./cash/reconciliationController');
const cashTransactionCtrl = require('./cash/cashTransactionController');

const cashController = {
  // ===== 通用现金交易和统计 =====
  /**
   * 获取交易记录列表
   */
  getTransactions: async (req, res) => {
    try {
      const filters = {};

      // 处理日期参数
      if (req.query.startDate && req.query.startDate.trim() !== '') {
        filters.startDate = req.query.startDate.trim();
      }

      if (req.query.endDate && req.query.endDate.trim() !== '') {
        filters.endDate = req.query.endDate.trim();
      }

      // 处理交易类型
      if (req.query.transactionType && req.query.transactionType.trim() !== '') {
        filters.transactionType = normalizeBankTransactionTypeFilter(req.query.transactionType);
      }

      // 处理账户ID
      if (req.query.accountId && req.query.accountId !== 'null' && req.query.accountId !== '') {
        const accountId = parseInt(req.query.accountId);
        if (!isNaN(accountId)) {
          filters.accountId = accountId;
        }
      }

      // 处理金额范围
      if (req.query.minAmount && req.query.minAmount !== '') {
        const minAmount = parseFloat(req.query.minAmount);
        if (!isNaN(minAmount)) {
          filters.minAmount = minAmount;
        }
      }

      if (req.query.maxAmount && req.query.maxAmount !== '') {
        const maxAmount = parseFloat(req.query.maxAmount);
        if (!isNaN(maxAmount)) {
          filters.maxAmount = maxAmount;
        }
      }

      // 处理分页参数
      const pagination = parsePagination(req.query.page, req.query.limit || req.query.pageSize, {
        defaultPageSize: 10,
        maxPageSize: 100,
      });

      filters.page = pagination.page;
      filters.limit = pagination.pageSize;

      const result = await BankTransactionModel.getBankTransactions(filters, pagination.page, pagination.pageSize);

      ResponseHandler.paginated(
        res,
        result.transactions,
        result.pagination.total,
        pagination.page,
        pagination.pageSize,
        '获取交易记录成功'
      );
    } catch (error) {
      logger.error('Error fetching transactions:', error);
      ResponseHandler.error(res, '获取交易记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单笔交易记录
   */
  getTransactionById: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      const transaction = await BankTransactionModel.getBankTransactionById(id);

      if (!transaction) {
        return ResponseHandler.error(res, '交易记录不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, transaction, '操作成功');
    } catch (error) {
      logger.error('Error fetching transaction:', error);
      ResponseHandler.error(res, '获取交易记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建交易记录
   */
  createTransaction: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.error(res, '验证失败', 'VALIDATION_ERROR', 400, {
          errors: errors.array(),
        });
      }

      const transaction = {
        transaction_date: req.body.transaction_date,
        amount: safeParseFloat(req.body.amount, 'amount'),
        transaction_type: req.body.transaction_type,
        description: req.body.description,
        bank_account_id: safeParseInt(req.body.bank_account_id || req.body.account_id, 'bank_account_id'),
        reference_no: req.body.reference_no,
        created_by: getAuthenticatedUserId(req),
      };

      const insertId = await BankTransactionModel.createBankTransaction(transaction);

      ResponseHandler.success(
        res,
        { id: insertId, ...transaction },
        '交易记录创建成功',
        201
      );
    } catch (error) {
      logger.error('Error creating transaction:', error);
      ResponseHandler.error(res, '创建交易记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新交易记录
   */
  updateTransaction: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.error(res, '验证失败', 'VALIDATION_ERROR', 400, {
          errors: errors.array(),
        });
      }

      const id = safeParseId(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      // 检查交易记录是否存在
      const existingTransaction = await BankTransactionModel.getBankTransactionById(id);

      if (!existingTransaction) {
        return ResponseHandler.error(res, '交易记录不存在', 'NOT_FOUND', 404);
      }

      const transaction = {
        transaction_date: req.body.transaction_date,
        amount: safeParseFloat(req.body.amount, 'amount'),
        transaction_type: req.body.transaction_type,
        description: req.body.description,
        account_id: safeParseInt(req.body.account_id, 'account_id'),
        reference_no: req.body.reference_no,
      };

      const updated = await BankTransactionModel.updateBankTransaction(id, transaction);

      if (updated) {
        return ResponseHandler.success(res, { id, ...transaction }, '交易记录更新成功');
      } else {
        return ResponseHandler.error(res, '交易记录更新失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('Error updating transaction:', error);
      ResponseHandler.error(res, '更新交易记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 删除交易记录
   */
  deleteTransaction: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      // 检查交易记录是否存在
      const existingTransaction = await BankTransactionModel.getBankTransactionById(id);

      if (!existingTransaction) {
        return ResponseHandler.error(res, '交易记录不存在', 'NOT_FOUND', 404);
      }

      const deleted = await BankTransactionModel.deleteBankTransaction(id);

      if (deleted) {
        ResponseHandler.success(res, null, '交易记录删除成功');
      } else {
        ResponseHandler.error(res, '交易记录删除失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('Error deleting transaction:', error);
      ResponseHandler.error(res, '删除交易记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取现金流预测
   */
  getCashFlowForecast: async (req, res) => {
    try {
      const startDate = req.query.startDate || currentDateString();
      const endDate = req.query.endDate || addMonthsToCurrentDateString(3);

      const forecast = await CashReportsModel.getCashFlowForecast(startDate, endDate);

      ResponseHandler.success(res, forecast, '操作成功');
    } catch (error) {
      logger.error('Error generating cash flow forecast:', error);
      ResponseHandler.error(res, '生成现金流预测失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取现金流统计
   */
  getCashFlowStatistics: async (req, res) => {
    try {
      // 处理过滤条件，确保undefined值被正确处理
      const filters = {};

      // 只有当参数存在且不为空时才添加到filters中
      if (req.query.startDate && req.query.startDate.trim() !== '') {
        filters.startDate = req.query.startDate.trim();
      }

      if (req.query.endDate && req.query.endDate.trim() !== '') {
        filters.endDate = req.query.endDate.trim();
      }

      if (req.query.accountId && req.query.accountId !== 'null' && req.query.accountId !== '') {
        const accountId = parseInt(req.query.accountId);
        if (!isNaN(accountId)) {
          filters.accountId = accountId;
        }
      }

      if (req.query.transactionType && req.query.transactionType.trim() !== '') {
        filters.transactionType = normalizeBankTransactionTypeFilter(req.query.transactionType);
      }

      // 获取交易统计
      const stats = await CashReportsModel.getTransactionStatistics(filters);

      ResponseHandler.success(res, stats, '操作成功');
    } catch (error) {
      logger.error('获取现金流统计失败:', error);
      ResponseHandler.error(res, '获取现金流统计失败', 'SERVER_ERROR', 500, error);
    }
  },

  // ===== 银行账户管理 =====
  ...bankAccountCtrl,

  // ===== 银行交易管理 =====
  ...bankTransactionCtrl,

  // ===== 银行对账 =====
  ...reconciliationCtrl,

  // ===== 现金交易管理 =====
  ...cashTransactionCtrl,
};

module.exports = cashController;
