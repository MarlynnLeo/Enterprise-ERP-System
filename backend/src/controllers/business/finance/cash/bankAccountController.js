/**
 * bankAccountController.js
 * @description 从 cashController.js 拆分的子控制器 — bankAccount
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

const bankAccountController = {
  /**
   * 获取银行账户列表
   */
  getBankAccounts: async (req, res) => {
    try {
      // 处理分页参数
      const pagination = parsePagination(req.query.page, req.query.limit || req.query.pageSize, {
        defaultPageSize: 10,
        maxPageSize: 100,
      });

      const filters = {
        account_name: req.query.accountName,
        bank_name: req.query.bankName,
        is_active:
          req.query.status === 'active' ? true : req.query.status === 'frozen' ? false : undefined,
        page: pagination.page,
        pageSize: pagination.pageSize,
      };

      // 使用数据库级分页获取账户数据
      const result = await BankAccountModel.getBankAccounts(filters);

      // 处理分页返回（新格式）和非分页返回（兼容）
      const accounts = result.accounts || result;
      const total = result.total ?? (Array.isArray(result) ? result.length : 0);

      // 安全地将数据字段转换为前端期望的格式
      const formattedAccounts = accounts.map(formatBankAccountForClient);

      ResponseHandler.paginated(
        res,
        formattedAccounts,
        total,
        pagination.page,
        pagination.pageSize,
        '获取账户列表成功'
      );
    } catch (error) {
      logger.error('获取银行账户列表出错:', error);
      ResponseHandler.error(res, '获取银行账户失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取银行账户统计信息
   */
  getBankAccountsStats: async (req, res) => {
    try {
      // reports are in index, let's try to access via cash or use direct import if needed
      // Since index.js seems broken, let's import Reports directly
      const Reports = require('../../../../models/cash/Reports');
      const stats = await Reports.getBankAccountsStats();

      // 将后端数据格式转换为前端需要的格式
      const responseData = {
        totalAccounts: stats.summary.total_accounts,
        activeAccounts: stats.summary.active_accounts,
        totalBalance: parseFloat(stats.summary.total_balance || 0),
        totalInLastMonth: stats.summary.total_in_last_month,
        totalOutLastMonth: stats.summary.total_out_last_month,
        currencyStats: stats.currency_stats,
        bankStats: stats.bank_stats,
      };

      ResponseHandler.success(res, responseData, '获取银行账户统计信息成功');
    } catch (error) {
      logger.error('Error fetching bank account statistics:', error);
      ResponseHandler.error(res, '获取银行账户统计信息失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个银行账户详情
   */
  getBankAccountById: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的银行账户ID', 'VALIDATION_ERROR', 400);
      }

      const account = await BankAccountModel.getBankAccountById(id);

      if (!account) {
        return ResponseHandler.error(res, '银行账户不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, formatBankAccountForClient(account), '操作成功');
    } catch (error) {
      logger.error('Error fetching bank account:', error);
      ResponseHandler.error(res, '获取银行账户失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建银行账户
   */
  createBankAccount: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.error(res, '验证失败', 'VALIDATION_ERROR', 400, {
          errors: errors.array(),
        });
      }

      const accountData = {
        account_number: req.body.account_number,
        account_name: req.body.account_name,
        bank_name: req.body.bank_name,
        branch_name: req.body.branch_name,
        currency_code: req.body.currency_code || financeConfig.get('account.defaultCurrency', 'CNY'),
        current_balance: parseFloat(req.body.initial_balance || req.body.current_balance || 0),
        opening_balance: parseFloat(req.body.initial_balance || req.body.opening_balance || req.body.current_balance || 0),
        account_type: normalizeBankAccountType(req.body.account_type),
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
        contact_person: req.body.contact_person,
        contact_phone: req.body.contact_phone,
        notes: req.body.notes,
        created_by: getAuthenticatedUserId(req),
      };

      const insertId = await BankAccountModel.createBankAccount(accountData);

      const createdAccount = await BankAccountModel.getBankAccountById(insertId);
      const formattedAccount = formatBankAccountForClient(createdAccount);

      ResponseHandler.success(
        res,
        {
          success: true,
          message: '银行账户创建成功',
          data: formattedAccount,
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('Error creating bank account:', error);
      return sendCashBusinessError(res, error, '创建银行账户失败');
    }
  },

  /**
   * 更新银行账户
   */
  updateBankAccount: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.error(res, '验证失败', 'VALIDATION_ERROR', 400, {
          errors: errors.array(),
        });
      }

      const id = safeParseId(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的银行账户ID', 'VALIDATION_ERROR', 400);
      }

      // 检查银行账户是否存在
      const existingAccount = await BankAccountModel.getBankAccountById(id);

      if (!existingAccount) {
        return ResponseHandler.error(res, '银行账户不存在', 'NOT_FOUND', 404);
      }

      const accountData = {
        bank_name: req.body.bank_name,
        account_name: req.body.account_name,
        account_number: req.body.account_number,
        account_type: normalizeBankAccountType(req.body.account_type),
        currency_code: req.body.currency_code,
        branch_name: req.body.branch_name || existingAccount.branch_name,
        notes: req.body.notes,
        is_active: req.body.is_active,
        updated_by: getAuthenticatedUserId(req),
      };

      const updated = await BankAccountModel.updateBankAccount(id, accountData);

      if (updated) {
        const updatedAccount = await BankAccountModel.getBankAccountById(id);
        ResponseHandler.success(res, formatBankAccountForClient(updatedAccount), '银行账户更新成功');
      } else {
        ResponseHandler.error(res, '银行账户更新失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('Error updating bank account:', error);
      return sendCashBusinessError(res, error, '更新银行账户失败');
    }
  },

  /**
   * 更新银行账户状态
   */
  updateBankAccountStatus: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的银行账户ID', 'VALIDATION_ERROR', 400);
      }

      // 检查银行账户是否存在
      const existingAccount = await BankAccountModel.getBankAccountById(id);

      if (!existingAccount) {
        return ResponseHandler.error(res, '银行账户不存在', 'NOT_FOUND', 404);
      }

      // 使用专门的方法更新账户状态
      const requestedStatus = normalizeBankAccountStatus(req.body.status);
      const isActive = requestedStatus === 'active';
      const updated = await BankAccountModel.updateBankAccountStatus(id, isActive);

      if (updated) {
        // 获取更新后的完整信息
        const updatedAccount = await BankAccountModel.getBankAccountById(id);
        ResponseHandler.success(res, formatBankAccountForClient(updatedAccount), '银行账户状态更新成功');
      } else {
        ResponseHandler.error(res, '银行账户状态更新失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('Error updating bank account status:', error);
      return sendCashBusinessError(res, error, '更新银行账户状态失败');
    }
  },

  /**
   * 重新计算所有银行账户余额
   */
  recalculateBankAccountBalances: async (req, res) => {
    try {
      const result = await cash.recalculateAllBankAccountBalances();
      ResponseHandler.success(res, result, result.message || '重新计算余额成功');
    } catch (error) {
      logger.error('重新计算银行账户余额失败:', error);
      ResponseHandler.error(res, '重新计算银行账户余额失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = bankAccountController;
