/**
 * bankTransactionController.js
 * @description 从 cashController.js 拆分的子控制器 — bankTransaction
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

const bankTransactionController = {
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

      const pagination = parsePagination(req.query.page, req.query.limit || req.query.pageSize, {
        defaultPageSize: 10,
        maxPageSize: 100,
      });
      const page = pagination.page;
      const limit = pagination.pageSize;

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
  getBankTransactionsForPrint: async (req, res) => {
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
        noPagination: true,
      };

      const result = await BankTransactionModel.getBankTransactions(filters);
      ResponseHandler.success(res, { list: result.transactions || [] }, '获取银行交易打印数据成功');
    } catch (error) {
      logger.error('Error fetching bank transaction print data:', error);
      ResponseHandler.error(res, '获取银行交易打印数据失败', 'SERVER_ERROR', 500, error);
    }
  },

  getBankTransactionById: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

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
   * 更新银行交易
   */
  updateBankTransaction: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

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
      const id = safeParseId(req.params.id);

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
      const result = await BankTransactionModel.getBankTransactions({ ...filters, noPagination: true });
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
              transactionDate = toLocalDateString(row['交易日期']);
            } else if (typeof row['交易日期'] === 'number') {
              // Excel日期序列号，需要转换
              // Excel的日期基准是1900年1月1日，但实际上是1899年12月30日
              const excelEpoch = new Date(1899, 11, 30); // 1899年12月30日
              const date = new Date(excelEpoch.getTime() + row['交易日期'] * 24 * 60 * 60 * 1000);
              transactionDate = toLocalDateString(date);
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
                transactionDate = toLocalDateString(parsedDate);
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
            importDate: currentDateString(),
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
};

module.exports = bankTransactionController;
