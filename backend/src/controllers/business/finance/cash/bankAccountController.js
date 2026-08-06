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
const { mapKeysToSnake } = require('../../../../utils/fieldMap');
const cash = require('../../../../models/cash');
const { validationResult } = require('express-validator');
const BankAccountModel = require('../../../../models/cash/Account');
const { getAuthenticatedUserId } = require('../../../../utils/authContext');
const { financeConfig } = require('../../../../config/financeConfig');
const { safeParseId } = require('../../../../utils/safeParseId');

/**
 * 安全的 parseFloat，返回 NaN 时抛出明确错误
 * @param {*} value - 待解析的值
 * @param {string} label - 字段名，用于错误提示
 * @returns {number}
 */
const {
  formatBankAccountForClient,
  normalizeBankAccountStatus,
  normalizeBankAccountType,
  sendCashBusinessError,
} = require('./helpers');

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

      const body = mapKeysToSnake(req.body || {});
      const accountData = {
        account_number: body.account_number,
        account_name: body.account_name,
        bank_name: body.bank_name,
        branch_name: body.branch_name,
        currency_code: body.currency_code || financeConfig.get('account.defaultCurrency', 'CNY'),
        current_balance: parseFloat(body.initial_balance || body.current_balance || 0),
        opening_balance: parseFloat(body.initial_balance || body.opening_balance || body.current_balance || 0),
        account_type: normalizeBankAccountType(body.account_type),
        is_active: body.is_active !== undefined ? body.is_active : true,
        contact_person: body.contact_person,
        contact_phone: body.contact_phone,
        notes: body.notes,
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

      const body = mapKeysToSnake(req.body || {});
      const accountData = {
        bank_name: body.bank_name,
        account_name: body.account_name,
        account_number: body.account_number,
        account_type: normalizeBankAccountType(body.account_type),
        currency_code: body.currency_code,
        branch_name: body.branch_name || existingAccount.branch_name,
        notes: body.notes,
        is_active: body.is_active,
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
