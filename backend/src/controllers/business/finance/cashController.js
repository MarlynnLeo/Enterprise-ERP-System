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
const { validationResult } = require('express-validator');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const BankTransactionModel = require('../../../models/cash/Transaction');
const CashReportsModel = require('../../../models/cash/Reports');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const { currentDateString } = require('../../../utils/dateUtils');
const { safeParseId } = require('../../../utils/safeParseId');
const bankAccountCtrl = require('./cash/bankAccountController');
const bankTransactionCtrl = require('./cash/bankTransactionController');
const reconciliationCtrl = require('./cash/reconciliationController');
const cashTransactionCtrl = require('./cash/cashTransactionController');

/**
 * 安全的 parseFloat，返回 NaN 时抛出明确错误
 * @param {*} value - 待解析的值
 * @param {string} label - 字段名，用于错误提示
 * @returns {number}
 */
const {
  addMonthsToCurrentDateString,
  normalizeBankTransactionTypeFilter,
  safeParseFloat,
  safeParseInt,
} = require('./cash/helpers');

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

      const body = mapKeysToSnake(req.body || {});
      const transaction = {
        transaction_date: body.transaction_date,
        amount: safeParseFloat(body.amount, 'amount'),
        transaction_type: body.transaction_type,
        description: body.description,
        bank_account_id: safeParseInt(body.bank_account_id || body.account_id, 'bank_account_id'),
        reference_no: body.reference_no,
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

      const body = mapKeysToSnake(req.body || {});
      const transaction = {
        transaction_date: body.transaction_date,
        amount: safeParseFloat(body.amount, 'amount'),
        transaction_type: body.transaction_type,
        description: body.description,
        account_id: safeParseInt(body.account_id, 'account_id'),
        reference_no: body.reference_no,
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
