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
const { validationResult } = require('express-validator');
const BankAccountModel = require('../../../../models/cash/Account');
const BankTransactionModel = require('../../../../models/cash/Transaction');
const ReconciliationModel = require('../../../../models/cash/Reconciliation');
const { getAuthenticatedUserId } = require('../../../../utils/authContext');
const { safeParseId } = require('../../../../utils/safeParseId');
const { mapKeysToSnake } = require('../../../../utils/fieldMap');

/**
 * 安全的 parseFloat，返回 NaN 时抛出明确错误
 * @param {*} value - 待解析的值
 * @param {string} label - 字段名，用于错误提示
 * @returns {number}
 */
const {
  safeParseFloat,
  safeParseInt,
  sendCashBusinessError,
} = require('./helpers');

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
        '获取对账记录成功'
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

      // HTTP camel → snake
      const body = mapKeysToSnake(req.body || {});
      const reconciliation = {
        account_id: safeParseInt(body.account_id ?? req.body.accountId, 'accountId'),
        reconciliation_date: body.reconciliation_date ?? req.body.reconciliationDate,
        bank_statement_balance: safeParseFloat(
          body.bank_statement_balance ?? req.body.bankStatementBalance,
          'bankStatementBalance'
        ),
        book_balance: safeParseFloat(body.book_balance ?? req.body.bookBalance, 'bookBalance'),
        status: body.status || 'draft',
        notes: body.notes,
        items: Array.isArray(req.body.items)
          ? req.body.items.map((it) => mapKeysToSnake(it))
          : [],
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

      const body = mapKeysToSnake(req.body || {});
      const reconciliation = {
        account_id: safeParseInt(body.account_id ?? req.body.accountId, 'accountId'),
        reconciliation_date: body.reconciliation_date ?? req.body.reconciliationDate,
        bank_statement_balance: safeParseFloat(
          body.bank_statement_balance ?? req.body.bankStatementBalance,
          'bankStatementBalance'
        ),
        book_balance: safeParseFloat(body.book_balance ?? req.body.bookBalance, 'bookBalance'),
        status: body.status ?? req.body.status,
        notes: body.notes,
        items: Array.isArray(req.body.items)
          ? req.body.items.map((it) => mapKeysToSnake(it))
          : [],
      };

      const updated = await ReconciliationModel.updateReconciliation(id, reconciliation);

      if (updated) {
        return ResponseHandler.success(
          res,
          { id, ...reconciliation },
          '对账记录更新成功'
        );
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
      const success = await BankTransactionModel.submitForAudit(id, (req.user?.id || req.body.userId || null));

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

      if (!['approved', 'rejected', 'void'].includes(status)) {
        return ResponseHandler.error(
          res,
          '无效的审核状态，仅支持 approved / rejected / void',
          'VALIDATION_ERROR',
          400
        );
      }

      let success = false;
      const userId = (req.user?.id || auditorId || null);

      // 使用BankTransactionModel进行审核/作废操作
      if (status === 'approved') {
        success = await BankTransactionModel.approveTransaction(id, userId);
      } else if (status === 'rejected') {
        success = await BankTransactionModel.rejectTransaction(id, userId, remark || '');
      } else if (status === 'void') {
        success = await BankTransactionModel.voidApprovedTransaction(
          id,
          userId,
          remark || '作废冲销'
        );
      }

      if (success) {
        return ResponseHandler.success(
          res,
          {
            id,
            status,
            newBalance:
              status === 'approved' || status === 'void' ? success.newBalance : undefined,
            entryId: status === 'approved' ? success.entryId : undefined,
            entryNumber: status === 'approved' ? success.entryNumber : undefined,
            reversalEntryId: status === 'void' ? success.reversalEntryId : undefined,
            reversalEntryNumber: status === 'void' ? success.reversalEntryNumber : undefined,
          },
          status === 'void' ? '银行交易已作废并冲销凭证' : '审核操作成功'
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
