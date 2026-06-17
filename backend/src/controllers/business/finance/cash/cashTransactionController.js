/**
 * cashTransactionController.js
 * @description 从 cashController.js 拆分的子控制器 — cashTransaction
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

const cashTransactionController = {
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
      const id = safeParseId(req.params.id);
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

      const id = safeParseId(req.params.id);
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
        updated_by: getAuthenticatedUserId(req),
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
      const id = safeParseId(req.params.id);
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
  getCashTransactionsForPrint: async (req, res) => {
    try {
      const { type, category, startDate, endDate, search } = req.query;
      const result = await CashTransactionModel.getCashTransactionsForExport({
        type,
        category,
        startDate,
        endDate,
        search,
      });

      return ResponseHandler.success(
        res,
        { transactions: result.transactions || [] },
        '获取现金交易打印数据成功'
      );
    } catch (error) {
      return ResponseHandler.error(res, '获取现金交易打印数据失败', 'SERVER_ERROR', 500, error);
    }
  },

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
        `attachment; filename*=UTF-8''${encodeURIComponent('现金交易记录_' + currentDateString() + '.xlsx')}`
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
      const id = safeParseId(req.params.id);
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
      const id = safeParseId(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      const userId = getAuthenticatedUserId(req);
      const result = await CashTransactionModel.approveTransaction(id, userId);

      if (result) {
        return ResponseHandler.success(
          res,
          {
            id,
            status: 'approved',
            entryId: result.entryId,
            entryNumber: result.entryNumber,
          },
          '现金交易审核通过'
        );
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
      const id = safeParseId(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      const userId = getAuthenticatedUserId(req);
      const reason = (req.body && (req.body.reason || req.body.remark)) || '';
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

module.exports = cashTransactionController;
