/**
 * cashController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const cash = require('../../../models/cash');
const { validationResult } = require('express-validator');
const cashTransactionService = require('../../../services/cashTransactionService');
const BankAccountModel = require('../../../models/cash/Account');
const BankTransactionModel = require('../../../models/cash/Transaction');
const ReconciliationModel = require('../../../models/cash/Reconciliation');
const CashReportsModel = require('../../../models/cash/Reports');
const CashTransactionModel = require('../../../models/cash/CashTransaction');
const { getAuthenticatedUserId } = require('../../../utils/authContext');

function normalizeExcelDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
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
  return parsed.toISOString().slice(0, 10);
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
    currency: account.currency_code || 'CNY',
    balance: account.current_balance !== undefined ? parseFloat(account.current_balance) : 0,
    initialBalance: account.opening_balance !== undefined ? parseFloat(account.opening_balance) : 0,
    openDate: createdAt.toISOString().split('T')[0],
    status: account.is_active ? 'active' : 'frozen',
    accountType,
    purpose: accountType,
    notes: account.notes || '',
    lastTransactionDate: lastTxDate ? lastTxDate.toISOString().split('T')[0] : '',
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
const cashController = {
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
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;

      filters.page = page;
      filters.limit = limit;

      const result = await BankTransactionModel.getBankTransactions(filters, page, limit);

      ResponseHandler.paginated(
        res,
        result.transactions,
        result.pagination.total,
        page,
        limit,
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
      const id = parseInt(req.params.id);

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
        amount: parseFloat(req.body.amount),
        transaction_type: req.body.transaction_type,
        description: req.body.description,
        bank_account_id: parseInt(req.body.bank_account_id || req.body.account_id),
        reference_no: req.body.reference_no,
        created_by: getAuthenticatedUserId(req),
      };

      const insertId = await BankTransactionModel.createBankTransaction(transaction);

      ResponseHandler.success(
        res,
        {
          success: true,
          message: '交易记录创建成功',
          data: { id: insertId, ...transaction },
        },
        '创建成功',
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

      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      // 检查交易记录是否存在
      const existingTransaction = await cash.getBankTransactionById(id);

      if (!existingTransaction) {
        return ResponseHandler.error(res, '交易记录不存在', 'NOT_FOUND', 404);
      }

      const transaction = {
        transaction_date: req.body.transaction_date,
        amount: parseFloat(req.body.amount),
        transaction_type: req.body.transaction_type,
        description: req.body.description,
        account_id: parseInt(req.body.account_id),
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
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      // 检查交易记录是否存在
      const existingTransaction = await cash.getBankTransactionById(id);

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
   * 获取对账记录
   */
  getReconciliations: async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        accountId: req.query.accountId ? parseInt(req.query.accountId) : null,
        status: req.query.status,
        page: req.query.page ? parseInt(req.query.page) : 1,
        limit: req.query.limit ? parseInt(req.query.limit) : 10,
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
      const id = parseInt(req.params.id);

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
        account_id: parseInt(req.body.account_id),
        reconciliation_date: req.body.reconciliation_date,
        bank_statement_balance: parseFloat(req.body.bank_statement_balance),
        book_balance: parseFloat(req.body.book_balance),
        status: req.body.status || 'draft',
        notes: req.body.notes,
        items: req.body.items || [],
        created_by: getAuthenticatedUserId(req),
      };

      const insertId = await ReconciliationModel.createReconciliation(reconciliation);

      ResponseHandler.success(
        res,
        {
          success: true,
          message: '对账记录创建成功',
          data: { id: insertId, ...reconciliation },
        },
        '创建成功',
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

      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的对账ID', 'VALIDATION_ERROR', 400);
      }

      // 检查对账记录是否存在
      const existingReconciliation = await cash.getReconciliationById(id);

      if (!existingReconciliation) {
        return ResponseHandler.error(res, '对账记录不存在', 'NOT_FOUND', 404);
      }

      const reconciliation = {
        account_id: parseInt(req.body.account_id),
        reconciliation_date: req.body.reconciliation_date,
        bank_statement_balance: parseFloat(req.body.bank_statement_balance),
        book_balance: parseFloat(req.body.book_balance),
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
   * 获取现金流预测
   */
  getCashFlowForecast: async (req, res) => {
    try {
      const startDate = req.query.startDate || new Date().toISOString().slice(0, 10);
      const endDate =
        req.query.endDate ||
        new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().slice(0, 10);

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

  /**
   * 获取银行账户列表
   */
  getBankAccounts: async (req, res) => {
    try {
      const filters = {
        account_name: req.query.accountName,
        bank_name: req.query.bankName,
        is_active:
          req.query.status === 'active' ? true : req.query.status === 'frozen' ? false : undefined,
      };

      // 处理分页参数
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;

      // 参数验证
      if (page < 1 || limit < 1 || limit > 100) {
        return ResponseHandler.error(res, '无效的分页参数', 'VALIDATION_ERROR', 400);
      }

      // 获取账户数据
      const accounts = await BankAccountModel.getBankAccounts(filters);

      // 安全地将数据字段转换为前端期望的格式
      const formattedAccounts = accounts.map(formatBankAccountForClient);

      // 处理分页
      const startIndex = (page - 1) * limit;
      const paginatedAccounts = formattedAccounts.slice(startIndex, startIndex + limit);

      ResponseHandler.paginated(
        res,
        paginatedAccounts,
        formattedAccounts.length,
        page,
        limit,
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
      const Reports = require('../../../models/cash/Reports');
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
      const id = parseInt(req.params.id);

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
        currency_code: req.body.currency_code || 'CNY',
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

      const id = parseInt(req.params.id);

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
   * 获取银行交易列表
   */
  getBankTransactions: async (req, res) => {
    try {
      const isReconciled =
        req.query.isReconciled !== undefined
          ? ['true', '1', true, 1].includes(req.query.isReconciled)
          : req.query.is_reconciled !== undefined
            ? ['true', '1', true, 1].includes(req.query.is_reconciled)
            : undefined;

      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        transaction_type: normalizeBankTransactionTypeFilter(req.query.transactionType),
        bank_account_id: req.query.accountId ? parseInt(req.query.accountId) : null,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : null,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : null,
        is_reconciled: isReconciled,
        status: req.query.status || null,
      };

      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;

      const result = await BankTransactionModel.getBankTransactions(filters, page, limit);


      ResponseHandler.paginated(
        res,
        result.transactions,
        result.pagination.total,
        page,
        limit,
        '获取银行交易成功'
      );
    } catch (error) {
      logger.error('Error fetching bank transactions:', error);
      ResponseHandler.error(res, '获取银行交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单笔银行交易详情
   */
  getBankTransactionById: async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      // 调用正确的银行交易查询方法
      const transaction = await BankTransactionModel.getBankTransactionById(id);

      if (!transaction) {
        return ResponseHandler.error(res, '交易记录不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, transaction, '操作成功');
    } catch (error) {
      logger.error('Error fetching bank transaction:', error);
      ResponseHandler.error(res, '获取银行交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建银行交易
   */
  createBankTransaction: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.error(res, '验证失败', 'VALIDATION_ERROR', 400, {
          errors: errors.array(),
        });
      }

      const transactionData = {
        bank_account_id: parseInt(req.body.bank_account_id),
        transaction_date: req.body.transaction_date,
        transaction_type: req.body.transaction_type,
        amount: req.body.amount,
        description: req.body.description,
        reference_number: req.body.reference_number,
        transaction_number: req.body.transaction_number,
        is_reconciled: req.body.is_reconciled !== undefined ? req.body.is_reconciled : false,
        reconciliation_date: req.body.reconciliation_date || null,
        related_party: req.body.related_party || null,
        category: req.body.category || null,
        payment_method: req.body.payment_method || null,
        created_by: getAuthenticatedUserId(req),
      };

      // 检查必要字段
      if (!transactionData.transaction_number) {
        logger.error('缺少交易编号');
        return ResponseHandler.error(res, '缺少交易编号', 'VALIDATION_ERROR', 400);
      }

      if (!transactionData.bank_account_id || isNaN(transactionData.bank_account_id)) {
        return ResponseHandler.error(res, '无效的银行账户ID', 'VALIDATION_ERROR', 400);
      }

      // gl_entry 字段不在此创建流程中处理
      transactionData.gl_entry = null;

      const result = await BankTransactionModel.createBankTransaction(transactionData);

      ResponseHandler.success(
        res,
        {
          success: true,
          message: '银行交易创建成功',
          data: {
            id: result.transactionId,
            newBalance: result.newBalance,
            status: 'draft',
            ...transactionData,
          },
        },
        '创建成功，待审核通过后入账',
        201
      );
    } catch (error) {
      logger.error('创建银行交易失败:', error);
      return ResponseHandler.error(res, '创建银行交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 对账交易记录
   */
  reconcileBankTransaction: async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      const shouldReconcile = req.body.is_reconciled !== false && req.body.reconciled !== false;
      const reconciled = await ReconciliationModel.reconcileTransaction(id, {
        reconciled: shouldReconcile,
        is_reconciled: shouldReconcile,
        reconciliation_date: shouldReconcile ? req.body.reconciliation_date : null,
        updated_by: getAuthenticatedUserId(req),
      });

      if (reconciled) {
        return ResponseHandler.success(res, { id, reconciled: shouldReconcile }, 'Reconciliation status updated');
      } else {
        return ResponseHandler.error(res, '对账操作失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      return sendCashBusinessError(res, error, '对账操作失败');
    }
  },

  /**
   * 更新银行交易
   */
  updateBankTransaction: async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      // 检查交易是否存在
      const existingTransaction = await cash.getBankTransactionById(id);
      if (!existingTransaction) {
        return ResponseHandler.error(res, '交易记录不存在', 'NOT_FOUND', 404);
      }

      const transactionData = {
        bank_account_id: parseInt(req.body.bank_account_id),
        transaction_date: req.body.transaction_date,
        transaction_type: req.body.transaction_type,
        amount: parseFloat(req.body.amount),
        description: req.body.description,
        reference_number: req.body.reference_number,
        transaction_number: req.body.transaction_number,
        is_reconciled: req.body.is_reconciled !== undefined ? req.body.is_reconciled : false,
        reconciliation_date: req.body.reconciliation_date || null,
        related_party: req.body.related_party || null,
        category: req.body.category || null,
        payment_method: req.body.payment_method || null,
        updated_by: getAuthenticatedUserId(req),
      };

      const result = await cash.updateBankTransaction(id, transactionData);

      return ResponseHandler.success(
        res,
        {
          id: result.transactionId,
          newBalance: result.newBalance,
          ...transactionData,
        },
        '银行交易更新成功'
      );
    } catch (error) {
      logger.error('更新银行交易失败:', error);
      return sendCashBusinessError(res, error, '更新银行交易失败');
    }
  },

  /**
   * 删除银行交易
   */
  deleteBankTransaction: async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      // 检查交易是否存在
      const transaction = await cash.getBankTransactionById(id);
      if (!transaction) {
        return ResponseHandler.error(res, '交易记录不存在', 'NOT_FOUND', 404);
      }

      // 删除交易并恢复余额
      await cash.deleteBankTransaction(id);

      return ResponseHandler.success(res, { id }, '银行交易删除成功');
    } catch (error) {
      logger.error('删除银行交易失败:', error);
      return sendCashBusinessError(res, error, '删除银行交易失败');
    }
  },

  /**
   * 资金调拨
   */
  transferFunds: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.error(res, '验证失败', 'VALIDATION_ERROR', 400, {
          errors: errors.array(),
        });
      }

      const transferData = {
        transaction_number: req.body.transaction_number,
        from_account_id: parseInt(req.body.from_account_id),
        to_account_id: parseInt(req.body.to_account_id),
        amount: parseFloat(req.body.amount),
        transaction_date: req.body.transaction_date,
        description: req.body.description,
        reference_number: req.body.reference_number,
        created_by: getAuthenticatedUserId(req),
      };

      if (!transferData.transaction_number) {
        return ResponseHandler.error(res, '缺少交易编号', 'VALIDATION_ERROR', 400);
      }
      if (!transferData.from_account_id || !transferData.to_account_id) {
        return ResponseHandler.error(res, '源账户和目标账户不能为空', 'VALIDATION_ERROR', 400);
      }
      if (transferData.from_account_id === transferData.to_account_id) {
        return ResponseHandler.error(res, '源账户和目标账户不能相同', 'VALIDATION_ERROR', 400);
      }
      if (!transferData.amount || transferData.amount <= 0) {
        return ResponseHandler.error(res, '调拨金额必须大于0', 'VALIDATION_ERROR', 400);
      }

      const result = await cash.transferFunds(transferData);

      ResponseHandler.success(
        res,
        {
          success: true,
          message: '资金调拨成功',
          data: result,
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('Error transferring funds:', error);
      if (
        error.message &&
        (error.message.includes('资金调拨') ||
          error.message.includes('账户') ||
          error.message.includes('余额不足') ||
          error.message.includes('币种') ||
          error.message.includes('会计期间') ||
          error.message.includes('No open accounting period'))
      ) {
        return ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
      }
      ResponseHandler.error(res, '资金调拨失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新银行账户状态
   */
  updateBankAccountStatus: async (req, res) => {
    try {
      const id = parseInt(req.params.id);

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
        BankTransactionModel.getBankTransactions(
          { ...bankTransactionFilters, is_reconciled: false },
          1,
          10000
        ),
        BankTransactionModel.getBankTransactions(
          { ...bankTransactionFilters, is_reconciled: true },
          1,
          10000
        ),
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

  /**
   * 标记交易为已对账
   */
  markTransactionAsReconciled: async (req, res) => {
    try {
      const { transactionId, accountId } = req.body;

      if (!transactionId) {
        return ResponseHandler.error(res, '缺少交易ID', 'VALIDATION_ERROR', 400);
      }

      const reconciliationDate = new Date().toISOString().split('T')[0];

      // 更新数据库中的交易记录
      const success = await cash.reconcileBankTransaction(transactionId, {
        reconciliation_date: reconciliationDate,
      });

      if (success) {
        return ResponseHandler.success(
          res,
          {
            transactionId,
            accountId,
            reconciliationDate,
            status: 'reconciled',
          },
          '交易已标记为已对账'
        );
      } else {
        return ResponseHandler.error(res, '交易不存在或更新失败', 'NOT_FOUND', 404);
      }
    } catch (error) {
      logger.error('标记交易为已对账失败:', error);
      return sendCashBusinessError(res, error, '标记交易为已对账失败');
    }
  },

  /**
   * 提交交易审核
   */
  submitForAudit: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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

  /**
   * 导出银行交易数据
   */
  exportBankTransactions: async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        transaction_type: normalizeBankTransactionTypeFilter(req.query.transactionType),
        bank_account_id: req.query.accountId ? parseInt(req.query.accountId) : null,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : null,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : null,
      };

      // 获取所有符合条件的交易数据（不分页）
      const result = await BankTransactionModel.getBankTransactions(filters, 1, 10000);
      const transactions = result.transactions || [];

      if (transactions.length === 0) {
        return ResponseHandler.error(res, '没有找到符合条件的交易数据', 'VALIDATION_ERROR', 400);
      }

      // 使用 ExcelJS 创建工作簿
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('银行交易数据');

      // 设置列
      worksheet.columns = [
        { header: '序号', key: 'index', width: 8 },
        { header: '交易日期', key: 'transaction_date', width: 12 },
        { header: '账户名称', key: 'account_name', width: 20 },
        { header: '交易类型', key: 'transaction_type', width: 10 },
        { header: '交易金额', key: 'amount', width: 15 },
        { header: '交易对方', key: 'related_party', width: 20 },
        { header: '交易描述', key: 'description', width: 30 },
        { header: '参考号', key: 'reference_number', width: 15 },
        { header: '对账状态', key: 'is_reconciled', width: 10 },
        { header: '对账日期', key: 'reconciliation_date', width: 12 },
        { header: '创建时间', key: 'created_at', width: 12 },
      ];

      // 添加数据
      transactions.forEach((transaction, index) => {
        worksheet.addRow({
          index: index + 1,
          transaction_date: transaction.transaction_date
            ? transaction.transaction_date.split('T')[0]
            : '',
          account_name: transaction.account_name || '',
          transaction_type: transaction.transaction_type || '',
          amount: parseFloat(transaction.amount) || 0,
          related_party: transaction.related_party || '',
          description: transaction.description || '',
          reference_number: transaction.reference_number || '',
          is_reconciled: transaction.is_reconciled ? '已对账' : '未对账',
          reconciliation_date: transaction.reconciliation_date
            ? transaction.reconciliation_date.split('T')[0]
            : '',
          created_at: transaction.created_at ? transaction.created_at.split('T')[0] : '',
        });
      });

      // 生成Excel缓冲区
      const buffer = await workbook.xlsx.writeBuffer();

      // 设置响应头
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="bank_transactions.xlsx"');

      // 发送文件
      res.send(buffer);
    } catch (error) {
      logger.error('导出银行交易数据失败:', error);
      ResponseHandler.error(res, '导出银行交易数据失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 导入银行交易数据
   */
  importBankTransactions: async (req, res) => {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '请选择要导入的Excel文件', 'VALIDATION_ERROR', 400);
      }

      const ExcelJS = require('exceljs');

      // 读取Excel文件
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);

      const worksheet = workbook.worksheets[0];
      const data = [];
      const headers = [];

      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber - 1] = cell.value;
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // 跳过表头
        const rowData = {};
        row.eachCell((cell, colNumber) => {
          rowData[headers[colNumber - 1]] = cell.value;
        });
        data.push(rowData);
      });

      if (data.length === 0) {
        return ResponseHandler.error(res, '文件中没有有效数据', 'VALIDATION_ERROR', 400);
      }

      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      const importedTransactions = [];

      // 获取银行账户列表用于验证
      const bankAccounts = await cash.getBankAccounts();

      const accountMap = new Map();
      bankAccounts.forEach((account) => {
        // 使用正确的字段名
        accountMap.set(account.account_name, account.id);
        accountMap.set(account.account_number, account.id);
        // 同时支持驼峰命名（兼容性）
        if (account.accountName) {
          accountMap.set(account.accountName, account.id);
        }
        if (account.accountNumber) {
          accountMap.set(account.accountNumber, account.id);
        }
      });

      // 处理每一行数据
      for (let i = 0; i < data.length; i++) {
        try {
          const row = data[i];

          // 验证必填字段
          if (!row['交易日期'] || !row['账户名称'] || !row['交易类型'] || !row['交易金额']) {
            errors.push(`第${i + 2}行：缺少必填字段（交易日期、账户名称、交易类型、交易金额）`);
            errorCount++;
            continue;
          }

          // 查找银行账户ID
          const accountId = accountMap.get(row['账户名称']);
          if (!accountId) {
            errors.push(`第${i + 2}行：找不到账户"${row['账户名称']}"`);
            errorCount++;
            continue;
          }

          // 验证交易类型
          const validTypes = ['存款', '取款', '转账', '转入', '转出', '利息', '费用'];
          if (!validTypes.includes(row['交易类型'])) {
            errors.push(`第${i + 2}行：无效的交易类型"${row['交易类型']}"`);
            errorCount++;
            continue;
          }

          // 验证金额
          const amount = parseFloat(row['交易金额']);
          if (isNaN(amount) || amount <= 0) {
            errors.push(`第${i + 2}行：无效的交易金额"${row['交易金额']}"`);
            errorCount++;
            continue;
          }

          // 格式化日期
          let transactionDate;
          try {
            if (row['交易日期'] instanceof Date) {
              // 已经是Date对象
              transactionDate = row['交易日期'].toISOString().split('T')[0];
            } else if (typeof row['交易日期'] === 'number') {
              // Excel日期序列号，需要转换
              // Excel的日期基准是1900年1月1日，但实际上是1899年12月30日
              const excelEpoch = new Date(1899, 11, 30); // 1899年12月30日
              const date = new Date(excelEpoch.getTime() + row['交易日期'] * 24 * 60 * 60 * 1000);
              transactionDate = date.toISOString().split('T')[0];
            } else if (typeof row['交易日期'] === 'string') {
              // 字符串格式的日期
              const dateStr = row['交易日期'].trim();
              if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // YYYY-MM-DD格式
                transactionDate = dateStr;
              } else if (dateStr.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
                // YYYY/M/D格式
                const parts = dateStr.split('/');
                transactionDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
              } else if (dateStr.includes('T')) {
                // ISO格式
                transactionDate = dateStr.split('T')[0];
              } else {
                // 尝试用Date构造函数解析
                const parsedDate = new Date(dateStr);
                if (isNaN(parsedDate.getTime())) {
                  throw new Error('无法解析日期');
                }
                transactionDate = parsedDate.toISOString().split('T')[0];
              }
            } else {
              throw new Error('不支持的日期格式');
            }

            // 验证日期格式
            if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
              throw new Error('日期格式不正确');
            }
          } catch (error) {
            errors.push(`第${i + 2}行：无效的交易日期格式"${row['交易日期']}" (${error.message})`);
            errorCount++;
            continue;
          }

          // 生成交易编号
          const now = new Date();
          const transactionNumber = `TX${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(i).padStart(3, '0')}`;

          // 准备交易数据
          const transactionData = {
            bank_account_id: accountId,
            transaction_date: transactionDate,
            transaction_type: row['交易类型'],
            amount: amount,
            description: row['交易描述'] || '',
            reference_number: row['参考号'] || '',
            related_party: row['交易对方'] || '',
            transaction_number: transactionNumber,
            is_reconciled: false,
            reconciliation_date: null,
            gl_entry: null,
            created_by: getAuthenticatedUserId(req),
          };

          // 创建交易记录
          const result = await cash.createBankTransaction(transactionData);

          importedTransactions.push({
            ...transactionData,
            id: result.transactionId,
            newBalance: result.newBalance,
          });

          successCount++;
        } catch (error) {
          logger.error(`处理第${i + 2}行数据失败:`, error);
          errors.push(`第${i + 2}行：${error.message}`);
          errorCount++;
        }
      }

      return ResponseHandler.success(
        res,
        {
          successCount,
          errorCount,
          errors: errors.slice(0, 10), // 只返回前10个错误
          importedTransactions: importedTransactions.slice(0, 5), // 只返回前5条成功导入的记录
          summary: {
            totalRecords: data.length,
            successCount,
            errorCount,
            importDate: new Date().toISOString().split('T')[0],
          },
        },
        `导入完成！成功：${successCount}条，失败：${errorCount}条`
      );
    } catch (error) {
      logger.error('导入银行交易数据失败:', error);
      ResponseHandler.error(res, '导入银行交易数据失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 导入银行对账单
   */
  importBankStatement: async (req, res) => {
    try {
      const accountId = req.body.accountId ? parseInt(req.body.accountId, 10) : null;
      const startDate = req.body.startDate || null;
      const endDate = req.body.endDate || null;

      if (!accountId) {
        return ResponseHandler.error(res, '缺少银行账户ID', 'VALIDATION_ERROR', 400);
      }
      if (!req.file) {
        return ResponseHandler.error(res, '缺少银行对账单文件', 'VALIDATION_ERROR', 400);
      }

      const account = await BankAccountModel.getBankAccountById(accountId);
      if (!account) {
        return ResponseHandler.error(res, '银行账户不存在', 'NOT_FOUND', 404);
      }

      const rows = await readStatementRows(req.file);
      if (rows.length === 0) {
        return ResponseHandler.error(res, '对账单文件没有可导入的数据', 'VALIDATION_ERROR', 400);
      }

      const errors = [];
      const items = rows.map((row, index) => {
        const rowNo = index + 2;
        const transactionDate = normalizeExcelDate(getFirstValue(row, [
          'transactionDate',
          'transaction_date',
          'Date',
          '日期',
          '交易日期',
          '记账日期',
          '入账日期',
        ]));
        const amount = parseStatementAmount(row);
        const signedAmount = parseStatementSignedAmount(row);
        const typeValue = getFirstValue(row, [
          'type',
          'transactionType',
          'transaction_type',
          '交易类型',
          '收支类型',
          '借贷方向',
        ]);
        const incomeValue = getFirstValue(row, ['收入', '收入金额', '贷方金额', 'credit']);
        const expenseValue = getFirstValue(row, ['支出', '支出金额', '借方金额', 'debit']);
        const inferredType =
          incomeValue !== null && incomeValue !== undefined && incomeValue !== ''
            ? 'income'
            : expenseValue !== null && expenseValue !== undefined && expenseValue !== ''
              ? 'expense'
              : normalizeStatementType(typeValue, signedAmount ?? amount ?? 0);

        if (!transactionDate) {
          errors.push(`第 ${rowNo} 行：缺少或无法识别交易日期`);
        }
        if (!amount || amount <= 0) {
          errors.push(`第 ${rowNo} 行：缺少或无法识别交易金额`);
        }
        if (startDate && transactionDate && transactionDate < startDate) {
          errors.push(`第 ${rowNo} 行：交易日期早于对账开始日期`);
        }
        if (endDate && transactionDate && transactionDate > endDate) {
          errors.push(`第 ${rowNo} 行：交易日期晚于对账结束日期`);
        }

        const balanceValue = getFirstValue(row, ['balance', 'Balance', '余额', '账户余额']);
        const balance =
          balanceValue === null || balanceValue === undefined || balanceValue === ''
            ? null
            : parseFloat(String(balanceValue).replace(/,/g, ''));

        return {
          transaction_date: transactionDate,
          transaction_type: inferredType,
          amount,
          summary: getFirstValue(row, ['summary', '摘要', '说明', '用途', '备注']) || '',
          reference_number: getFirstValue(row, ['referenceNumber', 'reference_no', '参考号', '流水号', '凭证号']) || '',
          counterparty: getFirstValue(row, ['counterparty', '交易对方', '对方户名', '对方账户', '客户名称']) || '',
          balance: Number.isNaN(balance) ? null : balance,
        };
      });

      if (errors.length > 0) {
        return ResponseHandler.error(
          res,
          `对账单导入校验失败：${errors.slice(0, 5).join('；')}`,
          'VALIDATION_ERROR',
          400
        );
      }

      const result = await ReconciliationModel.createStatementImport(
        {
          bank_account_id: accountId,
          statement_start_date: startDate,
          statement_end_date: endDate,
          file_name: req.file.originalname,
          imported_by: getAuthenticatedUserId(req),
        },
        items
      );

      return ResponseHandler.success(
        res,
        result.items,
        `对账单导入成功，共导入 ${result.items.length} 条明细`
      );
    } catch (error) {
      ResponseHandler.error(res, '导入银行对账单失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 重新计算所有银行账户余额
   */
  recalculateBankAccountBalances: async (req, res) => {
    try {
      const result = await BankAccountModel.recalculateAllBankAccountBalances();
      ResponseHandler.success(res, result, result.message || '重新计算余额成功');
    } catch (error) {
      logger.error('重新计算银行账户余额失败:', error);
      ResponseHandler.error(res, '重新计算银行账户余额失败', 'SERVER_ERROR', 500, error);
    }
  },

  // ==================== 现金交易管理 ====================

  /**
   * 获取现金交易列表
   */
  getCashTransactions: async (req, res) => {
    try {
      const { page = 1, pageSize = 20, type, category, startDate, endDate, search } = req.query;

      const filters = {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        type,
        category,
        startDate,
        endDate,
        search,
      };

      const result = await CashTransactionModel.getCashTransactions(filters);

      return ResponseHandler.success(
        res,
        {
          transactions: result.transactions || [],
          total: result.pagination?.total || 0,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
        },
        '获取现金交易列表成功'
      );
    } catch (error) {
      return ResponseHandler.error(res, '获取现金交易列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个现金交易
   */
  getCashTransactionById: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.validationError(res, [{ msg: '无效的交易ID' }]);
      }

      const transaction = await CashTransactionModel.getCashTransactionById(id);

      if (!transaction) {
        return ResponseHandler.notFound(res, '现金交易记录不存在');
      }

      return ResponseHandler.success(res, transaction, '获取现金交易详情成功');
    } catch (error) {
      return ResponseHandler.error(res, '获取现金交易详情失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建现金交易
   */
  createCashTransaction: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.validationError(res, errors.array());
      }

      const transactionData = {
        transaction_type: req.body.type || req.body.transaction_type,
        transaction_date: req.body.transactionDate || req.body.transaction_date,
        amount: parseFloat(req.body.amount),
        category: req.body.category,
        counterparty: req.body.counterparty,
        description: req.body.description,
        reference_number: req.body.referenceNumber || req.body.reference_number,
        created_by: getAuthenticatedUserId(req),
      };

      const result = await CashTransactionModel.createCashTransaction(transactionData);

      return ResponseHandler.success(
        res,
        {
          id: result.transactionId,
          transactionNumber: result.transactionNumber,
          ...transactionData,
        },
        '现金交易创建成功',
        201
      );
    } catch (error) {
      return ResponseHandler.error(res, '创建现金交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新现金交易
   */
  updateCashTransaction: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.validationError(res, errors.array());
      }

      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      const transactionData = {
        transaction_type: req.body.type || req.body.transaction_type,
        transaction_date: req.body.transactionDate || req.body.transaction_date,
        amount: parseFloat(req.body.amount),
        category: req.body.category,
        counterparty: req.body.counterparty,
        description: req.body.description,
        reference_number: req.body.referenceNumber || req.body.reference_number,
      };

      const updated = await CashTransactionModel.updateCashTransaction(id, transactionData);

      if (updated) {
        return ResponseHandler.success(res, { id, ...transactionData }, '现金交易更新成功');
      } else {
        return ResponseHandler.notFound(res, '现金交易记录不存在');
      }
    } catch (error) {
      return ResponseHandler.error(res, '更新现金交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 删除现金交易
   */
  deleteCashTransaction: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      const deleted = await CashTransactionModel.deleteCashTransaction(id);

      if (deleted) {
        return ResponseHandler.success(res, null, '现金交易删除成功');
      } else {
        return ResponseHandler.notFound(res, '现金交易记录不存在');
      }
    } catch (error) {
      return ResponseHandler.error(res, '删除现金交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取现金交易统计
   */
  getCashTransactionStats: async (req, res) => {
    try {
      const { type, category, startDate, endDate } = req.query;

      const filters = {
        type,
        category,
        startDate,
        endDate,
      };

      const stats = await CashTransactionModel.getCashTransactionStats(filters);

      return ResponseHandler.success(res, stats, '获取现金交易统计成功');
    } catch (error) {
      return ResponseHandler.error(res, '获取现金交易统计失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 导出现金交易
   */
  exportCashTransactions: async (req, res) => {
    try {
      const { type, category, startDate, endDate } = req.query;

      const filters = { type, category, startDate, endDate };

      // 使用服务层导出功能
      const result = await cashTransactionService.exportCashTransactions(filters);

      // 设置响应头为Excel文件下载
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent('现金交易记录_' + new Date().toISOString().slice(0, 10) + '.xlsx')}`
      );

      // 发送Excel文件
      res.send(result.buffer);
    } catch (error) {
      logger.error('导出现金交易失败:', error);
      ResponseHandler.error(res, '导出现金交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 导入现金交易
   */
  importCashTransactions: async (req, res) => {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '请选择要导入的文件', 'VALIDATION_ERROR', 400);
      }

      const result = await cashTransactionService.importCashTransactions(
        req.file.buffer,
        getAuthenticatedUserId(req)
      );

      return ResponseHandler.success(res, result, `成功导入 ${result.successCount} 条现金交易记录`);
    } catch (error) {
      logger.error('导入现金交易失败:', error);
      ResponseHandler.error(res, '导入现金交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 提交现金交易审核
   */
  submitCashTransactionForAudit: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      const userId = getAuthenticatedUserId(req);
      const success = await CashTransactionModel.submitForAudit(id, userId);

      if (success) {
        return ResponseHandler.success(res, { id, status: 'pending' }, '现金交易已提交审核');
      } else {
        return ResponseHandler.error(res, '提交审核失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('提交现金交易审核失败:', error);
      return sendCashBusinessError(res, error, '提交审核失败');
    }
  },

  /**
   * 审核通过现金交易
   */
  approveCashTransaction: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      const userId = getAuthenticatedUserId(req);
      const success = await CashTransactionModel.approveTransaction(id, userId);

      if (success) {
        return ResponseHandler.success(res, { id, status: 'approved' }, '现金交易审核通过');
      } else {
        return ResponseHandler.error(res, '审核操作失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('审核通过现金交易失败:', error);
      return sendCashBusinessError(res, error, '审核操作失败');
    }
  },

  /**
   * 驳回现金交易
   */
  rejectCashTransaction: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      const userId = getAuthenticatedUserId(req);
      const reason = (req.body && req.body.reason) || '';
      const success = await CashTransactionModel.rejectTransaction(id, userId, reason);

      if (success) {
        return ResponseHandler.success(res, { id, status: 'rejected' }, '现金交易已驳回');
      } else {
        return ResponseHandler.error(res, '驳回操作失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('驳回现金交易失败:', error);
      return sendCashBusinessError(res, error, '驳回操作失败');
    }
  },
};

module.exports = cashController;
