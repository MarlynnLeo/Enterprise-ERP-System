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
const { validationResult } = require('express-validator');
const cashTransactionService = require('../../../../services/cashTransactionService');
const CashTransactionModel = require('../../../../models/cash/CashTransaction');
const { getAuthenticatedUserId } = require('../../../../utils/authContext');
const { currentDateString } = require('../../../../utils/dateUtils');
const { safeParseId } = require('../../../../utils/safeParseId');
const ScopeGuard = require('../../../../authorization/ScopeGuard');
const db = require('../../../../config/db');

/**
 * 安全的 parseFloat，返回 NaN 时抛出明确错误
 * @param {*} value - 待解析的值
 * @param {string} label - 字段名，用于错误提示
 * @returns {number}
 */
const { sendCashBusinessError } = require('./helpers');

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
      filters.scopeClause = await ScopeGuard.applyListScope(req, 'cash_transaction', {
        tableAlias: 't',
        ownerAlias: 'cash_txn_owner_scope',
      });

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

      if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, 'cash_transaction', id, '无权访问该现金交易'))) {
        return;
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
        ...ScopeGuard.stampOwner(req, 'cash_transaction'),
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

      if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, 'cash_transaction', id, '无权修改该现金交易'))) {
        return;
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

      if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, 'cash_transaction', id, '无权删除该现金交易'))) {
        return;
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

  /**
   * 作废已审核现金交易（冲销凭证）
   */
  voidCashTransaction: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }
      const userId = getAuthenticatedUserId(req);
      const reason = (req.body && (req.body.reason || req.body.remark)) || '作废冲销';
      const result = await CashTransactionModel.voidApprovedTransaction(id, userId, reason);
      return ResponseHandler.success(
        res,
        {
          id,
          status: 'void',
          reversalEntryId: result.reversalEntryId,
          reversalEntryNumber: result.reversalEntryNumber,
        },
        '现金交易已作废并冲销凭证'
      );
    } catch (error) {
      logger.error('作废现金交易失败:', error);
      return sendCashBusinessError(res, error, '作废操作失败');
    }
  },
};

module.exports = cashTransactionController;
