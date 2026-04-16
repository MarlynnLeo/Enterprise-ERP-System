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
const { getCurrentUserName } = require('../../../utils/userHelper');

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
        filters.transactionType = req.query.transactionType.trim();
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
        return ResponseHandler.error(res, '无效的交易ID', 'BAD_REQUEST', 400);
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
        account_id: parseInt(req.body.account_id),
        reference_no: req.body.reference_no,
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
        return ResponseHandler.error(res, '无效的交易ID', 'BAD_REQUEST', 400);
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
        return ResponseHandler.error(res, '无效的交易ID', 'BAD_REQUEST', 400);
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
        return ResponseHandler.error(res, '无效的对账ID', 'BAD_REQUEST', 400);
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
        return ResponseHandler.error(res, '无效的对账ID', 'BAD_REQUEST', 400);
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
        filters.transactionType = req.query.transactionType.trim();
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
        return ResponseHandler.error(res, '无效的分页参数', 'BAD_REQUEST', 400);
      }

      // 获取账户数据
      const accounts = await BankAccountModel.getBankAccounts(filters);

      // 安全地将数据字段转换为前端期望的格式
      const formattedAccounts = accounts.map((account) => {
        try {
          // 确保所有必需字段都存在并转换为正确格式
          // 特别注意openDate字段，使用created_at
          const createdAt = account.created_at ? new Date(account.created_at) : new Date();
          const lastTxDate = account.last_transaction_date
            ? new Date(account.last_transaction_date)
            : null;

          return {
            id: account.id,
            accountName: account.account_name || '',
            accountNumber: account.account_number || '',
            bankName: account.bank_name || '',
            branchName: account.branch_name || '',
            currency: account.currency_code || 'CNY',
            balance:
              account.current_balance !== undefined ? parseFloat(account.current_balance) : 0,
            initialBalance:
              account.opening_balance !== undefined ? parseFloat(account.opening_balance) : 0,
            openDate: createdAt.toISOString().split('T')[0],
            status: account.is_active ? 'active' : 'frozen',
            purpose: account.account_type || '',
            notes: account.notes || '',
            lastTransactionDate: lastTxDate ? lastTxDate.toISOString().split('T')[0] : '',
          };
        } catch (err) {
          logger.error('格式化账户数据出错:', err, account);
          // 返回一个基本对象以避免中断整个过程
          return {
            id: account.id,
            accountName: account.account_name || '',
            accountNumber: account.account_number || '',
            bankName: account.bank_name || '',
            branchName: account.branch_name || '',
            currency: 'CNY',
            balance: 0,
            openDate: new Date().toISOString().split('T')[0],
            status: 'active',
          };
        }
      });

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
        return ResponseHandler.error(res, '无效的银行账户ID', 'BAD_REQUEST', 400);
      }

      const account = await BankAccountModel.getBankAccountById(id);

      if (!account) {
        return ResponseHandler.error(res, '银行账户不存在', 'NOT_FOUND', 404);
      }

      // 将数据字段转换为前端期望的格式
      try {
        // 确保日期字段格式正确
        const createdAt = account.created_at ? new Date(account.created_at) : new Date();
        const lastTxDate = account.last_transaction_date
          ? new Date(account.last_transaction_date)
          : null;

        const formattedAccount = {
          id: account.id,
          accountName: account.account_name || '',
          accountNumber: account.account_number || '',
          bankName: account.bank_name || '',
          branchName: account.branch_name || '',
          currency: account.currency_code || 'CNY',
          balance: account.current_balance !== undefined ? parseFloat(account.current_balance) : 0,
          initialBalance:
            account.opening_balance !== undefined ? parseFloat(account.opening_balance) : 0,
          openDate: createdAt.toISOString().split('T')[0],
          status: account.is_active ? 'active' : 'frozen',
          purpose: account.account_type || '',
          notes: account.notes || '',
          lastTransactionDate: lastTxDate ? lastTxDate.toISOString().split('T')[0] : '',
        };

        ResponseHandler.success(res, formattedAccount, '操作成功');
      } catch (err) {
        logger.error('格式化账户数据出错:', err, account);
        ResponseHandler.error(res, '处理银行账户数据失败', 'SERVER_ERROR', 500, err);
      }
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
        account_type: req.body.account_type || '活期',
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
        contact_person: req.body.contact_person,
        contact_phone: req.body.contact_phone,
        notes: req.body.notes,
      };

      const insertId = await BankAccountModel.createBankAccount(accountData);

      // 将数据字段转换为前端期望的格式
      const currentDate = new Date().toISOString().split('T')[0];
      const formattedAccount = {
        id: insertId,
        accountName: accountData.account_name || '',
        accountNumber: accountData.account_number || '',
        bankName: accountData.bank_name || '',
        branchName: accountData.branch_name || '',
        currency: accountData.currency_code || 'CNY',
        balance: parseFloat(accountData.current_balance) || 0,
        initialBalance: parseFloat(accountData.current_balance) || 0,
        openDate: currentDate,
        status: accountData.is_active ? 'active' : 'frozen',
        purpose: accountData.account_type || '',
        notes: accountData.notes || '',
        lastTransactionDate: '',
      };

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
      ResponseHandler.error(res, '创建银行账户失败', 'SERVER_ERROR', 500, error);
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
        return ResponseHandler.error(res, '无效的银行账户ID', 'BAD_REQUEST', 400);
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
        account_type: req.body.account_type,
        currency_code: req.body.currency_code,
        branch_name: req.body.branch_name || existingAccount.branch_name,
        notes: req.body.notes,
        is_active: req.body.is_active,
        updated_by: await getCurrentUserName(req),
      };

      const updated = await BankAccountModel.updateBankAccount(id, accountData);

      if (updated) {
        const updatedAccount = await BankAccountModel.getBankAccountById(id);

        // 确保日期字段格式正确
        const createdAt = updatedAccount.created_at
          ? new Date(updatedAccount.created_at)
          : new Date();
        const lastTxDate = updatedAccount.last_transaction_date
          ? new Date(updatedAccount.last_transaction_date)
          : null;

        const formattedAccount = {
          id: updatedAccount.id,
          accountName: updatedAccount.account_name || '',
          accountNumber: updatedAccount.account_number || '',
          bankName: updatedAccount.bank_name || '',
          branchName: updatedAccount.branch_name || '',
          currency: updatedAccount.currency_code || 'CNY',
          balance:
            updatedAccount.current_balance !== undefined
              ? parseFloat(updatedAccount.current_balance)
              : 0,
          initialBalance:
            updatedAccount.opening_balance !== undefined
              ? parseFloat(updatedAccount.opening_balance)
              : 0,
          openDate: createdAt.toISOString().split('T')[0],
          status: updatedAccount.is_active ? 'active' : 'frozen',
          purpose: updatedAccount.account_type || '',
          notes: updatedAccount.notes || '',
          lastTransactionDate: lastTxDate ? lastTxDate.toISOString().split('T')[0] : '',
        };

        ResponseHandler.success(res, formattedAccount, '银行账户更新成功');
      } else {
        ResponseHandler.error(res, '银行账户更新失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('Error updating bank account:', error);
      ResponseHandler.error(res, '更新银行账户失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取银行交易列表
   */
  getBankTransactions: async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        transaction_type: req.query.transactionType,
        bank_account_id: req.query.accountId ? parseInt(req.query.accountId) : null,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : null,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : null,
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
        return ResponseHandler.error(res, '无效的交易ID', 'BAD_REQUEST', 400);
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
        created_by: await getCurrentUserName(req),
      };

      // 检查必要字段
      if (!transactionData.transaction_number) {
        logger.error('缺少交易编号');
        return ResponseHandler.error(res, '缺少交易编号', 'BAD_REQUEST', 400);
      }

      if (!transactionData.bank_account_id || isNaN(transactionData.bank_account_id)) {
        return ResponseHandler.error(res, '无效的银行账户ID', 'BAD_REQUEST', 400);
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
            ...transactionData,
          },
        },
        '创建成功',
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
        return ResponseHandler.error(res, '无效的交易ID', 'BAD_REQUEST', 400);
      }

      const reconciled = await ReconciliationModel.reconcileTransaction(id, {
        reconciled: true,
        reconciliation_date: req.body.reconciliation_date,
        updated_by: await getCurrentUserName(req),
      });

      if (reconciled) {
        return ResponseHandler.success(res, { id, reconciled: true }, '交易已对账');
      } else {
        return ResponseHandler.error(res, '对账操作失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      ResponseHandler.error(res, '对账操作失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新银行交易
   */
  updateBankTransaction: async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'BAD_REQUEST', 400);
      }

      // 检查交易是否存在
      const existingTransaction = await cash.getBankTransactionById(id);
      if (!existingTransaction) {
        return ResponseHandler.error(res, '交易记录不存在', 'NOT_FOUND', 404);
      }

      // 由于银行交易涉及复杂的余额计算和账户更新，
      // 这里采用先删除再创建的方式实现更新
      // 这并不是最佳实践，但对于简单系统来说是最直接的解决方案

      // 1. 备份原交易数据

      const originalAccountId = existingTransaction.bank_account_id;
      const originalAmount = existingTransaction.amount;
      const originalType = existingTransaction.transaction_type;

      // 2. 构建新交易数据
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
        created_by: await getCurrentUserName(req),
      };

      // 3. 删除原交易（使用控制器内部方法）
      await cash.deleteBankTransaction(id, {
        originalAccountId,
        originalAmount,
        originalType,
      });

      // 4. 创建新交易
      const result = await cash.createBankTransaction(transactionData);

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
      return ResponseHandler.error(res, '更新银行交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 删除银行交易
   */
  deleteBankTransaction: async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'BAD_REQUEST', 400);
      }

      // 检查交易是否存在
      const transaction = await cash.getBankTransactionById(id);
      if (!transaction) {
        return ResponseHandler.error(res, '交易记录不存在', 'NOT_FOUND', 404);
      }

      // 删除交易并恢复余额
      const result = await cash.deleteBankTransaction(id);

      return ResponseHandler.success(res, { id }, '银行交易删除成功');
    } catch (error) {
      logger.error('删除银行交易失败:', error);
      return ResponseHandler.error(res, '删除银行交易失败', 'SERVER_ERROR', 500, error);
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
        from_account_id: parseInt(req.body.from_account_id),
        to_account_id: parseInt(req.body.to_account_id),
        amount: parseFloat(req.body.amount),
        transaction_date: req.body.transaction_date,
        description: req.body.description,
        reference_number: req.body.reference_number,
        created_by: await getCurrentUserName(req),
      };

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
        return ResponseHandler.error(res, '无效的银行账户ID', 'BAD_REQUEST', 400);
      }

      // 检查银行账户是否存在
      const existingAccount = await BankAccountModel.getBankAccountById(id);

      if (!existingAccount) {
        return ResponseHandler.error(res, '银行账户不存在', 'NOT_FOUND', 404);
      }

      // 使用专门的方法更新账户状态
      const isActive = req.body.status === 'active';
      const updated = await BankAccountModel.updateBankAccountStatus(id, isActive);

      if (updated) {
        // 获取更新后的完整信息
        const updatedAccount = await BankAccountModel.getBankAccountById(id);

        // 创建前端格式的数据
        const createdAt = updatedAccount.created_at
          ? new Date(updatedAccount.created_at)
          : new Date();
        const lastTxDate = updatedAccount.last_transaction_date
          ? new Date(updatedAccount.last_transaction_date)
          : null;

        const formattedAccount = {
          id: updatedAccount.id,
          accountName: updatedAccount.account_name || '',
          accountNumber: updatedAccount.account_number || '',
          bankName: updatedAccount.bank_name || '',
          branchName: updatedAccount.branch_name || '',
          currency: updatedAccount.currency_code || 'CNY',
          balance:
            updatedAccount.current_balance !== undefined
              ? parseFloat(updatedAccount.current_balance)
              : 0,
          initialBalance:
            updatedAccount.opening_balance !== undefined
              ? parseFloat(updatedAccount.opening_balance)
              : 0,
          openDate: createdAt.toISOString().split('T')[0],
          status: updatedAccount.is_active ? 'active' : 'frozen',
          purpose: updatedAccount.account_type || '',
          notes: updatedAccount.notes || '',
          lastTransactionDate: lastTxDate ? lastTxDate.toISOString().split('T')[0] : '',
        };

        ResponseHandler.success(res, formattedAccount, '银行账户状态更新成功');
      } else {
        ResponseHandler.error(res, '银行账户状态更新失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('Error updating bank account status:', error);
      ResponseHandler.error(res, '更新银行账户状态失败', 'SERVER_ERROR', 500, error);
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
        BankTransactionModel.getBankTransactions({ ...bankTransactionFilters, is_reconciled: false }),
        BankTransactionModel.getBankTransactions({ ...bankTransactionFilters, is_reconciled: true }),
      ]);

      const unreconciledItems = unreconciledResult?.transactions?.length || 0;
      const reconciledItems = reconciledResult?.transactions?.length || 0;

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

      const stats = {
        bookBalance: accountInfo.accountId ? parseFloat((await BankAccountModel.getBankAccountById(accountId))?.current_balance || 0) : 0,
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
        return ResponseHandler.error(res, '缺少交易ID', 'BAD_REQUEST', 400);
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
      ResponseHandler.error(res, '标记交易为已对账失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 提交交易审核
   */
  submitForAudit: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'BAD_REQUEST', 400);
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
      ResponseHandler.error(res, '提交审核失败', 'SERVER_ERROR', 500, error);
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
        return ResponseHandler.error(res, '无效的交易ID', 'BAD_REQUEST', 400);
      }

      if (!['approved', 'rejected'].includes(status)) {
        return ResponseHandler.error(
          res,
          '无效的审核状态，仅支持 approved 或 rejected',
          'BAD_REQUEST',
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
        return ResponseHandler.success(res, { id, status }, '审核操作成功');
      } else {
        return ResponseHandler.error(res, '审核操作失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('审核操作失败:', error);
      ResponseHandler.error(res, '审核操作失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 取消交易对账标记
   */
  cancelTransactionReconciliation: async (req, res) => {
    try {
      const { transactionId, accountId } = req.body;

      if (!transactionId) {
        return ResponseHandler.error(res, '缺少交易ID', 'BAD_REQUEST', 400);
      }

      // 更新数据库中的交易记录，取消对账标记
      const success = await cash.cancelReconciliation(transactionId);

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
      const bankTransactionId = req.query.bankTransactionId
        ? parseInt(req.query.bankTransactionId)
        : null;

      if (!bankTransactionId) {
        return ResponseHandler.error(res, '缺少银行交易ID', 'BAD_REQUEST', 400);
      }

      // 当前系统未实现交易匹配功能，返回空数组
      // 如需此功能，请创建 transaction_matches 表并实现匹配逻辑
      return ResponseHandler.success(res, [], '获取已匹配交易成功（功能待实现）');
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
      const bankTransactionId = req.query.bankTransactionId
        ? parseInt(req.query.bankTransactionId)
        : null;
      const accountId = req.query.accountId ? parseInt(req.query.accountId) : null;

      if (!bankTransactionId || !accountId) {
        return ResponseHandler.error(res, '缺少必要参数', 'BAD_REQUEST', 400);
      }

      // 当前系统未实现交易匹配功能，返回空数组
      // 如需此功能，请创建 transaction_matches 表并实现匹配逻辑
      return ResponseHandler.success(res, [], '获取可能匹配交易成功（功能待实现）');
    } catch (error) {
      logger.error('获取可能匹配交易失败:', error);
      ResponseHandler.error(res, '获取可能匹配交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 确认交易匹配
   * 注意：交易匹配功能需要创建 transaction_matches 关联表后才能使用
   */
  confirmTransactionMatch: async (req, res) => {
    try {
      const { bankTransactionId, transactionIds, accountId } = req.body;

      if (!bankTransactionId || !transactionIds || !transactionIds.length || !accountId) {
        return ResponseHandler.error(res, '缺少必要参数', 'BAD_REQUEST', 400);
      }

      // 当前系统未实现交易匹配功能
      // 如需此功能，请创建 transaction_matches 表并实现匹配逻辑
      return ResponseHandler.error(res, '交易匹配功能待实现', 'NOT_IMPLEMENTED', 501);
    } catch (error) {
      logger.error('确认交易匹配失败:', error);
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
        transaction_type: req.query.transactionType,
        bank_account_id: req.query.accountId ? parseInt(req.query.accountId) : null,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : null,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : null,
      };

      // 获取所有符合条件的交易数据（不分页）
      const result = await BankTransactionModel.getBankTransactions(filters, 1, 10000);
      const transactions = result.transactions || [];

      if (transactions.length === 0) {
        return ResponseHandler.error(res, '没有找到符合条件的交易数据', 'BAD_REQUEST', 400);
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
        return ResponseHandler.error(res, '请选择要导入的Excel文件', 'BAD_REQUEST', 400);
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
        return ResponseHandler.error(res, '文件中没有有效数据', 'BAD_REQUEST', 400);
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
      // 银行对账单导入功能待实现
      // 需要对接银行提供的标准对账单文件格式（如 MT940、CSV 等）
      return ResponseHandler.error(res, '银行对账单导入功能待实现，请使用手动录入方式', 'NOT_IMPLEMENTED', 501);
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
      return ResponseHandler.error(res, '获取现金交易列表失败', 500, error);
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
      return ResponseHandler.error(res, '获取现金交易详情失败', 500, error);
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
        created_by: await getCurrentUserName(req),
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
      return ResponseHandler.error(res, '创建现金交易失败', 500, error);
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
        return ResponseHandler.error(res, '无效的交易ID', 400);
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
      return ResponseHandler.error(res, '更新现金交易失败', 500, error);
    }
  },

  /**
   * 删除现金交易
   */
  deleteCashTransaction: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 400);
      }

      const deleted = await CashTransactionModel.deleteCashTransaction(id);

      if (deleted) {
        return ResponseHandler.success(res, null, '现金交易删除成功');
      } else {
        return ResponseHandler.notFound(res, '现金交易记录不存在');
      }
    } catch (error) {
      return ResponseHandler.error(res, '删除现金交易失败', 500, error);
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
      return ResponseHandler.error(res, '获取现金交易统计失败', 500, error);
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
        return ResponseHandler.error(res, '请选择要导入的文件', 'BAD_REQUEST', 400);
      }

      // 使用服务层导入功能
      const result = await cashTransactionService.importCashTransactions(req.file.buffer);

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
        return ResponseHandler.error(res, '无效的交易ID', 'BAD_REQUEST', 400);
      }

      const userId = (req.body && req.body.userId) || 1;
      const success = await CashTransactionModel.submitForAudit(id, userId);

      if (success) {
        return ResponseHandler.success(res, { id, status: 'pending' }, '现金交易已提交审核');
      } else {
        return ResponseHandler.error(res, '提交审核失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('提交现金交易审核失败:', error);
      ResponseHandler.error(res, error.message || '提交审核失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 审核通过现金交易
   */
  approveCashTransaction: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'BAD_REQUEST', 400);
      }

      const userId = (req.body && req.body.userId) || 1;
      const success = await CashTransactionModel.approveTransaction(id, userId);

      if (success) {
        return ResponseHandler.success(res, { id, status: 'approved' }, '现金交易审核通过');
      } else {
        return ResponseHandler.error(res, '审核操作失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('审核通过现金交易失败:', error);
      ResponseHandler.error(res, error.message || '审核操作失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 驳回现金交易
   */
  rejectCashTransaction: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'BAD_REQUEST', 400);
      }

      const userId = (req.body && req.body.userId) || 1;
      const reason = (req.body && req.body.reason) || '';
      const success = await CashTransactionModel.rejectTransaction(id, userId, reason);

      if (success) {
        return ResponseHandler.success(res, { id, status: 'rejected' }, '现金交易已驳回');
      } else {
        return ResponseHandler.error(res, '驳回操作失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('驳回现金交易失败:', error);
      ResponseHandler.error(res, error.message || '驳回操作失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = cashController;
