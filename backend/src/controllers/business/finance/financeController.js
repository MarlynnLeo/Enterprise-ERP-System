/**
 * financeController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const financeModel = require('../../../models/finance');
const db = require('../../../config/db');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { getAuthenticatedUserId } = require('../../../utils/authContext');

/**
 * 财务总账控制器
 */
const financeController = {
  /**
   * 初始化财务系统表格
   */
  initFinanceTables: async (req, res) => {
    try {
      const taxModel = require('../../../models/tax');

      // 创建财务所需表格
      await financeModel.createTables();

      // 初始化会计科目和会计期间
      await financeModel.initializeGLAccounts();

      // 银行账户表结构由 migrations/20260312000008 管理，无需显式初始化

      // 初始化税务模块表结构
      await taxModel.createTables();

      ResponseHandler.success(res, null, '财务系统数据初始化成功');
    } catch (error) {
      logger.error('初始化财务系统数据失败:', error);
      ResponseHandler.error(res, '初始化财务系统数据失败', 'SERVER_ERROR', 500, error);
    }
  },

  // ===== 会计科目相关方法 =====

  /**
   * 获取所有会计科目
   */
  getAllAccounts: async (req, res) => {
    try {
      // 检查是否有分页参数 - 支持 limit 和 pageSize 两种参数名
      const { page, limit, pageSize, account_code, account_name, account_type } = req.query;
      const pageSizeValue = limit || pageSize;

      if (page || pageSizeValue) {
        // 使用分页查询
        const filters = {};
        if (account_code) filters.account_code = account_code;
        if (account_name) filters.account_name = account_name;
        if (account_type) filters.account_type = account_type;

        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(pageSizeValue) || 20;

        const result = await financeModel.getAccountsList(filters, pageNum, limitNum);

        // 统一使用ResponseHandler.paginated
        return ResponseHandler.paginated(
          res,
          result.accounts,
          result.pagination.total,
          result.pagination.page,
          result.pagination.limit,
          '获取会计科目成功'
        );
      } else {
        // 获取所有记录（用于选项列表等）
        const accounts = await financeModel.getAllAccounts();
        return ResponseHandler.success(res, { accounts }, '获取会计科目成功');
      }
    } catch (error) {
      logger.error('获取会计科目失败:', error);
      return ResponseHandler.error(res, '获取会计科目失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个会计科目
   */
  getAccountById: async (req, res) => {
    try {
      const { id } = req.params;
      const account = await financeModel.getAccountById(id);

      if (!account) {
        return ResponseHandler.error(res, '会计科目不存在', 'NOT_FOUND', 404);
      }

      return ResponseHandler.success(res, { account }, '获取会计科目成功');
    } catch (error) {
      logger.error('获取会计科目失败:', error);
      return ResponseHandler.error(res, '获取会计科目失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建会计科目
   */
  createAccount: async (req, res) => {
    try {
      const {
        account_code,
        account_name,
        account_type,
        parent_id,
        is_debit: userIsDebit,
        is_active,
        currency_code,
        description,
      } = req.body;

      // 验证必填字段
      if (!account_code || !account_name || !account_type) {
        return ResponseHandler.error(res, '科目编码、名称和类型为必填项', 'VALIDATION_ERROR', 400);
      }

      // 验证科目类型
      const validTypes = ['资产', '负债', '所有者权益', '收入', '成本', '费用'];
      if (!validTypes.includes(account_type)) {
        return ResponseHandler.error(res, '无效的科目类型', 'VALIDATION_ERROR', 400);
      }

      // 根据科目类型自动设置is_debit（借贷方向）
      // 会计准则：资产、成本、费用类科目属于借方科目(is_debit=1)
      //          负债、所有者权益、收入类科目属于贷方科目(is_debit=0)
      const debitTypes = ['资产', '成本', '费用'];
      const autoIsDebit = debitTypes.includes(account_type) ? 1 : 0;

      // 如果用户明确指定了is_debit且与自动推断不一致，记录警告日志
      const finalIsDebit = userIsDebit !== undefined ? userIsDebit : autoIsDebit;
      if (userIsDebit !== undefined && userIsDebit !== autoIsDebit) {
        logger.warn('科目is_debit设置与科目类型不匹配', {
          account_code,
          account_type,
          userIsDebit,
          autoIsDebit,
          description: '资产/成本/费用应为借方(1)，负债/权益/收入应为贷方(0)',
        });
      }

      const accountId = await financeModel.createAccount({
        account_code,
        account_name,
        account_type,
        parent_id,
        is_debit: finalIsDebit,
        is_active,
        currency_code,
        description,
      });

      ResponseHandler.success(
        res,
        {
          message: '会计科目创建成功',
          account_id: accountId,
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建会计科目失败:', error);
      return ResponseHandler.error(res, '创建会计科目失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新会计科目
   */
  updateAccount: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        account_name,
        account_type,
        parent_id,
        is_debit: userIsDebit,
        is_active,
        currency_code,
        description,
      } = req.body;

      // 验证必填字段
      if (!account_name || !account_type) {
        return ResponseHandler.error(res, '科目名称和类型为必填项', 'VALIDATION_ERROR', 400);
      }

      // 验证科目类型
      const validTypes = ['资产', '负债', '所有者权益', '收入', '成本', '费用'];
      if (!validTypes.includes(account_type)) {
        return ResponseHandler.error(res, '无效的科目类型', 'VALIDATION_ERROR', 400);
      }

      // 检查科目是否存在
      const account = await financeModel.getAccountById(id);
      if (!account) {
        return ResponseHandler.error(res, '会计科目不存在', 'NOT_FOUND', 404);
      }

      // 根据科目类型自动设置is_debit（借贷方向）
      const debitTypes = ['资产', '成本', '费用'];
      const autoIsDebit = debitTypes.includes(account_type) ? 1 : 0;
      const finalIsDebit = userIsDebit !== undefined ? userIsDebit : autoIsDebit;

      // 警告科目类型与借贷方向不匹配
      if (userIsDebit !== undefined && userIsDebit !== autoIsDebit) {
        logger.warn('更新科目时is_debit设置与科目类型不匹配', {
          id,
          account_type,
          userIsDebit,
          autoIsDebit,
        });
      }

      const success = await financeModel.updateAccount(id, {
        account_name,
        account_type,
        parent_id,
        is_debit: finalIsDebit,
        is_active,
        currency_code,
        description,
      });

      if (success) {
        ResponseHandler.success(res, { message: '会计科目更新成功' }, '更新成功');
      } else {
        ResponseHandler.error(res, '会计科目更新失败', 'OPERATION_FAILED', 400);
      }
    } catch (error) {
      logger.error('更新会计科目失败:', error);
      ResponseHandler.error(res, '更新会计科目失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 停用会计科目
   */
  deactivateAccount: async (req, res) => {
    try {
      const { id } = req.params;

      // 检查科目是否存在
      const account = await financeModel.getAccountById(id);
      if (!account) {
        return ResponseHandler.error(res, '会计科目不存在', 'NOT_FOUND', 404);
      }

      const success = await financeModel.deactivateAccount(id);

      if (success) {
        ResponseHandler.success(res, { message: '会计科目已停用' }, '停用成功');
      } else {
        ResponseHandler.error(res, '会计科目停用失败', 'OPERATION_FAILED', 400);
      }
    } catch (error) {
      logger.error('停用会计科目失败:', error);
      ResponseHandler.error(res, '停用会计科目失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 切换会计科目状态（启用/禁用）
   */
  toggleAccountStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { is_active } = req.body;

      // 检查科目是否存在
      const account = await financeModel.getAccountById(id);
      if (!account) {
        return ResponseHandler.error(res, '会计科目不存在', 'NOT_FOUND', 404);
      }

      const success = await financeModel.updateAccountStatus(id, is_active);

      if (success) {
        const statusText = is_active ? '启用' : '禁用';
        ResponseHandler.success(res, { message: `会计科目已${statusText}` }, '状态更新成功');
      } else {
        ResponseHandler.error(res, '会计科目状态更新失败', 'OPERATION_FAILED', 400);
      }
    } catch (error) {
      logger.error('更新会计科目状态失败:', error);
      ResponseHandler.error(res, '更新会计科目状态失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取会计科目选项（用于级联选择器）
   */
  getAccountOptions: async (req, res) => {
    try {
      const accounts = await financeModel.getAllAccounts();
      ResponseHandler.success(res, accounts, '获取会计科目选项成功');
    } catch (error) {
      logger.error('获取会计科目选项失败:', error);
      ResponseHandler.error(res, '获取会计科目选项失败', 'SERVER_ERROR', 500, error);
    }
  },

  // ===== 期初余额相关方法 =====

  /**
   * 获取期初余额列表
   */
  getOpeningBalances: async (req, res) => {
    try {
      const balances = await financeModel.getOpeningBalances();
      ResponseHandler.success(res, balances, '获取期初余额列表成功');
    } catch (error) {
      logger.error('获取期初余额列表失败:', error);
      ResponseHandler.error(res, '获取期初余额列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 设置单个科目期初余额
   */
  setOpeningBalance: async (req, res) => {
    try {
      const { id } = req.params;
      const { debit, credit, balanceDate, notes } = req.body;

      const result = await financeModel.setOpeningBalance(id, {
        debit: parseFloat(debit) || 0,
        credit: parseFloat(credit) || 0,
        balanceDate,
        notes,
        setBy: getAuthenticatedUserId(req),
      });

      ResponseHandler.success(res, result, '期初余额设置成功');
    } catch (error) {
      logger.error('设置期初余额失败:', error);
      ResponseHandler.error(res, '设置期初余额失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 批量设置期初余额
   */
  setBatchOpeningBalance: async (req, res) => {
    try {
      const { balances, balanceDate } = req.body;

      if (!balances || !Array.isArray(balances) || balances.length === 0) {
        return ResponseHandler.error(res, '请提供有效的余额数据', 'BAD_REQUEST', 400);
      }

      const result = await financeModel.setBatchOpeningBalance(balances, balanceDate);
      ResponseHandler.success(res, result, `成功设置${result.count}个科目的期初余额`);
    } catch (error) {
      logger.error('批量设置期初余额失败:', error);
      ResponseHandler.error(res, '批量设置期初余额失败', 'SERVER_ERROR', 500, error);
    }
  },

  // ===== 会计分录相关方法 =====

  /**
   * 创建会计分录
   */
  createEntry: async (req, res) => {
    try {
      const {
        entry_date,
        posting_date,
        document_type,
        document_number,
        period_id,
        description,
        created_by,
        items,
        voucher_word, // Extract voucher_word
      } = req.body;

      // 验证核心必填字段
      if (!entry_date) {
        return ResponseHandler.error(res, '记账日期为必填项', 'VALIDATION_ERROR', 400);
      }

      // 自动推断 created_by：优先从数据库获取真实姓名
      const resolvedCreatedBy = created_by || await getCurrentUserName(req);

      // 自动推断 period_id：优先使用请求体中的值，否则根据 entry_date 自动查找对应的开放会计期间
      let resolvedPeriodId = period_id;
      if (!resolvedPeriodId) {
        const GLService = require('../../../services/finance/GLService');
        resolvedPeriodId = await GLService.getPeriodIdByDate(entry_date);
        if (!resolvedPeriodId) {
          return ResponseHandler.error(
            res,
            `记账日期 ${entry_date} 未找到对应的开放会计期间，该期间可能已关闭或尚未创建`,
            'VALIDATION_ERROR',
            400
          );
        }
      }

      // ===== 期间和年度结转校验 =====
      const PeriodValidationService = require('../../../services/business/PeriodValidationService');
      const financeCheck = await PeriodValidationService.validateFinanceEntry(
        resolvedPeriodId,
        entry_date
      );
      if (!financeCheck.allowed) {
        return ResponseHandler.error(res, financeCheck.message, 'VALIDATION_ERROR', 400);
      }
      // ===== 期间和年度结转校验结束 =====

      // 验证分录明细
      if (!items || !Array.isArray(items) || items.length === 0) {
        return ResponseHandler.error(res, '分录明细为必填项且不能为空', 'VALIDATION_ERROR', 400);
      }

      // 验证借贷平衡（使用整数"分"累加，避免浮点精度偏移）
      let totalDebitCents = 0;
      let totalCreditCents = 0;

      for (const item of items) {
        if (!item.account_id) {
          return ResponseHandler.error(res, '每个分录明细必须包含科目ID', 'VALIDATION_ERROR', 400);
        }

        totalDebitCents += Math.round((parseFloat(item.debit_amount) || 0) * 100);
        totalCreditCents += Math.round((parseFloat(item.credit_amount) || 0) * 100);
      }

      const totalDebit = totalDebitCents / 100;
      const totalCredit = totalCreditCents / 100;

      if (totalDebitCents !== totalCreditCents) {
        return ResponseHandler.error(res, '借贷不平衡', 'VALIDATION_ERROR', 400, {
          totalDebit,
          totalCredit,
          difference: Math.abs(totalDebit - totalCredit),
        });
      }

      // ===== 收/付凭证科目校验 =====
      // 收款凭证: 必须有借方现金或银行科目
      // 付款凭证: 必须有贷方现金或银行科目
      const cashBankCodes = ['1001', '1002']; // 现金、银行存款科目编码前缀

      // 获取所有涉及的科目编码
      const accountIds = items.map((item) => item.account_id);
      const [accountsInfo] = await db.pool.execute(
        `SELECT id, account_code FROM gl_accounts WHERE id IN (${accountIds.map(() => '?').join(',')})`,
        accountIds
      );
      const accountCodeMap = {};
      accountsInfo.forEach((acc) => {
        accountCodeMap[acc.id] = acc.account_code;
      });

      if (document_type === '收款凭证' || voucher_word === '收') {
        // 检查是否有借方现金/银行科目
        const hasDebitCashBank = items.some((item) => {
          const code = accountCodeMap[item.account_id] || '';
          return (
            cashBankCodes.some((prefix) => code.startsWith(prefix)) &&
            parseFloat(item.debit_amount || 0) > 0
          );
        });
        if (!hasDebitCashBank) {
          return ResponseHandler.error(
            res,
            '收款凭证必须包含借方现金或银行存款科目',
            'VALIDATION_ERROR',
            400
          );
        }
      }

      if (document_type === '付款凭证' || voucher_word === '付') {
        // 检查是否有贷方现金/银行科目
        const hasCreditCashBank = items.some((item) => {
          const code = accountCodeMap[item.account_id] || '';
          return (
            cashBankCodes.some((prefix) => code.startsWith(prefix)) &&
            parseFloat(item.credit_amount || 0) > 0
          );
        });
        if (!hasCreditCashBank) {
          return ResponseHandler.error(
            res,
            '付款凭证必须包含贷方现金或银行存款科目',
            'VALIDATION_ERROR',
            400
          );
        }
      }
      // ===== 收/付凭证科目校验结束 =====

      const GLService2 = require('../../../services/finance/GLService');
      const entryId = await GLService2.createEntry(
        {
          entry_date,
          posting_date: posting_date || entry_date,
          document_type: document_type || '记账凭证',
          document_number,
          period_id: resolvedPeriodId,
          description,
          created_by: resolvedCreatedBy,
          voucher_word,
        },
        items
      );

      ResponseHandler.success(
        res,
        {
          message: '会计分录创建成功',
          entry_id: entryId,
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建会计分录失败:', error);
      ResponseHandler.error(res, '创建会计分录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取会计分录列表
   */
  getEntries: async (req, res) => {
    try {
      const {
        entry_number,
        start_date,
        end_date,
        document_type,
        voucher_word,
        period_id,
        is_posted,
        page = 1,
        pageSize = 20,
      } = req.query;

      const filters = {};

      if (entry_number) filters.entry_number = entry_number;
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;
      if (document_type) filters.document_type = document_type;
      if (voucher_word) filters.voucher_word = voucher_word;
      if (period_id) filters.period_id = parseInt(period_id);
      if (is_posted !== undefined) filters.is_posted = is_posted === 'true';

      const result = await financeModel.getEntries(filters, parseInt(page), parseInt(pageSize));

      ResponseHandler.success(res, result, '获取会计分录列表成功');
    } catch (error) {
      logger.error('获取会计分录列表失败:', error);
      ResponseHandler.error(res, '获取会计分录列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个会计分录
   */
  getEntryById: async (req, res) => {
    try {
      const { id } = req.params;
      const entry = await financeModel.getEntryById(id);

      if (!entry) {
        return ResponseHandler.error(res, '会计分录不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, { entry }, '获取会计分录成功');
    } catch (error) {
      logger.error('获取会计分录失败:', error);
      ResponseHandler.error(res, '获取会计分录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取会计分录明细
   */
  getEntryItems: async (req, res) => {
    try {
      const { id } = req.params;

      // 先检查分录是否存在
      const entry = await financeModel.getEntryById(id);
      if (!entry) {
        return ResponseHandler.error(res, '会计分录不存在', 'NOT_FOUND', 404);
      }

      // 获取完整的明细信息，包括科目信息
      const items = await financeModel.getEntryItems(id);

      // 将科目信息和金额格式化为前端需要的格式
      const formattedItems = items.map((item) => ({
        id: item.id,
        accountId: item.account_id,
        accountCode: item.account_code,
        accountName: item.account_name,
        debitAmount: parseFloat(item.debit_amount) || 0,
        creditAmount: parseFloat(item.credit_amount) || 0,
        currencyCode: item.currency_code || 'CNY',
        exchangeRate: parseFloat(item.exchange_rate) || 1,
        costCenterId: item.cost_center_id,
        description: item.description,
      }));

      ResponseHandler.success(res, formattedItems, '获取会计分录明细成功');
    } catch (error) {
      ResponseHandler.error(res, '获取会计分录明细失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 过账会计分录
   * 安全校验由模型层统一执行：凭证存在性、已过账、已冲销、期间已关闭
   */
  postEntry: async (req, res) => {
    try {
      const { id } = req.params;

      const success = await financeModel.postEntry(id);

      if (success) {
        ResponseHandler.success(res, { message: '会计分录过账成功' }, '过账成功');
      } else {
        ResponseHandler.error(res, '会计分录过账失败', 'OPERATION_FAILED', 400);
      }
    } catch (error) {
      logger.error('过账会计分录失败:', error);
      // 将模型层的业务错误（如"不能在已关闭的期间过账"）返回给前端
      const isBusinessError = error.message.includes('不能') ||
                              error.message.includes('已过账') ||
                              error.message.includes('不存在') ||
                              error.message.includes('已冲销');
      const statusCode = isBusinessError ? 400 : 500;
      ResponseHandler.error(res, error.message || '过账会计分录失败', 'POST_ERROR', statusCode, error);
    }
  },

  /**
   * 冲销会计分录
   */
  reverseEntry: async (req, res) => {
    try {
      const { id } = req.params;
      const { entry_date, posting_date, period_id, description } = req.body;

      // 验证必填字段（entry_number 由后端自动生成，无需前端传入）
      if (!entry_date || !posting_date || !period_id) {
        return ResponseHandler.error(
          res,
          '冲销日期、过账日期、会计期间为必填项',
          'VALIDATION_ERROR',
          400
        );
      }

      // 检查分录是否存在
      const entry = await financeModel.getEntryById(id);
      if (!entry) {
        return ResponseHandler.error(res, '原会计分录不存在', 'NOT_FOUND', 404);
      }

      // 检查分录是否已冲销
      if (entry.is_reversed) {
        return ResponseHandler.error(res, '会计分录已冲销', 'VALIDATION_ERROR', 400);
      }

      // 使用当前登录用户的真实姓名作为创建人
      const createdBy = await getCurrentUserName(req);

      const reversalEntryId = await financeModel.reverseEntry(id, {
        entry_date,
        posting_date,
        period_id,
        description,
        created_by: createdBy,
      });

      ResponseHandler.success(
        res,
        {
          message: '会计分录冲销成功',
          reversal_entry_id: reversalEntryId,
        },
        '冲销成功'
      );
    } catch (error) {
      logger.error('冲销会计分录失败:', error);
      ResponseHandler.error(res, '冲销会计分录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 删除会计分录（仅允许删除未过账且未冲销的凭证）
   */
  deleteEntry: async (req, res) => {
    try {
      const { id } = req.params;

      const success = await financeModel.deleteEntry(id);

      if (success) {
        ResponseHandler.success(res, { message: '凭证删除成功' }, '删除成功');
      } else {
        ResponseHandler.error(res, '凭证删除失败', 'OPERATION_FAILED', 400);
      }
    } catch (error) {
      logger.error('删除会计分录失败:', error);
      // 将业务错误信息（如"已过账不能删除"）返回给前端
      const statusCode = error.message.includes('不能删除') || error.message.includes('不存在') ? 400 : 500;
      ResponseHandler.error(res, error.message || '删除会计分录失败', 'DELETE_ERROR', statusCode, error);
    }
  },

  // ===== 会计期间相关方法 =====

  /**
   * 获取所有会计期间
   */
  getAllPeriods: async (req, res) => {
    try {
      const periods = await financeModel.getAllPeriods();
      ResponseHandler.success(res, { periods }, '获取会计期间列表成功');
    } catch (error) {
      logger.error('获取会计期间失败:', error);
      ResponseHandler.error(res, '获取会计期间失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个会计期间
   */
  getPeriodById: async (req, res) => {
    try {
      const { id } = req.params;
      const period = await financeModel.getPeriodById(id);

      if (!period) {
        return ResponseHandler.error(res, '会计期间不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, { period }, '获取会计期间成功');
    } catch (error) {
      logger.error('获取会计期间失败:', error);
      ResponseHandler.error(res, '获取会计期间失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建会计期间
   */
  createPeriod: async (req, res) => {
    try {
      const { period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year } = req.body;

      // 验证必填字段
      if (!period_name || !start_date || !end_date || !fiscal_year) {
        return ResponseHandler.error(
          res,
          '期间名称、开始日期、结束日期和财政年度为必填项',
          'VALIDATION_ERROR',
          400
        );
      }

      // 验证日期
      if (new Date(start_date) > new Date(end_date)) {
        return ResponseHandler.error(res, '开始日期不能晚于结束日期', 'VALIDATION_ERROR', 400);
      }

      const periodId = await financeModel.createPeriod({
        period_name,
        start_date,
        end_date,
        is_closed,
        is_adjusting,
        fiscal_year,
      });

      ResponseHandler.success(
        res,
        {
          message: '会计期间创建成功',
          period_id: periodId,
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建会计期间失败:', error);
      ResponseHandler.error(res, '创建会计期间失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 关闭会计期间
   * 重要：必须通过 PeriodEndService 执行，以确保结账前完成：
   *   1. 未过账分录检查（阻断结账）
   *   2. 损益自动结转（收入/费用/成本 -> 本年利润）
   *   3. 期末余额快照计算
   */
  closePeriod: async (req, res) => {
    try {
      const { id } = req.params;

      // 检查期间是否存在
      const period = await financeModel.getPeriodById(id);
      if (!period) {
        return ResponseHandler.error(res, '会计期间不存在', 'NOT_FOUND', 404);
      }

      // 检查期间是否已关闭
      if (period.is_closed) {
        return ResponseHandler.error(res, '会计期间已关闭', 'VALIDATION_ERROR', 400);
      }

      // 使用 PeriodEndService 执行完整结账流程（含校验、损益结转、余额快照）
      const PeriodEndService = require('../../../services/business/PeriodEndService');
      const result = await PeriodEndService.closePeriod({
        period_id: parseInt(id),
        closed_by: req.user?.id || 'system',
        closing_date: new Date().toISOString().slice(0, 10),
      });

      ResponseHandler.success(res, result, '会计期间关闭成功');
    } catch (error) {
      logger.error('关闭会计期间失败:', error);
      // 将具体的业务错误信息返回给前端（如"还有N条未过账分录"）
      ResponseHandler.error(
        res,
        error.message || '关闭会计期间失败',
        'PERIOD_CLOSE_ERROR',
        400,
        error
      );
    }
  },

  /**
   * 重新开启会计期间
   * 通过 PeriodEndService 执行，确保：
   *   1. 检查后续期间是否已关闭（若已关闭则阻止反结账）
   *   2. 清理该期间的损益结转分录
   *   3. 清理期末余额快照
   */
  reopenPeriod: async (req, res) => {
    try {
      const { id } = req.params;

      // 检查期间是否存在
      const period = await financeModel.getPeriodById(id);
      if (!period) {
        return ResponseHandler.error(res, '会计期间不存在', 'NOT_FOUND', 404);
      }

      // 检查期间是否已关闭
      if (!period.is_closed) {
        return ResponseHandler.error(res, '会计期间已处于开启状态', 'VALIDATION_ERROR', 400);
      }

      // 使用 PeriodEndService 执行完整反结账流程（含后续期间检查、数据清理）
      const PeriodEndService = require('../../../services/business/PeriodEndService');
      const result = await PeriodEndService.reopenPeriod({
        period_id: parseInt(id),
        reopened_by: req.user?.id || 'system',
      });

      ResponseHandler.success(res, result, '会计期间重新开启成功');
    } catch (error) {
      logger.error('重新开启会计期间失败:', error);
      ResponseHandler.error(
        res,
        error.message || '重新开启会计期间失败',
        'PERIOD_REOPEN_ERROR',
        400,
        error
      );
    }
  },

  // ===== 试算平衡表相关方法 =====

  /**
   * 获取试算平衡表
   */
  getTrialBalance: async (req, res) => {
    try {
      const { period_id } = req.query;
      const periodId = period_id ? parseInt(period_id) : null;

      const result = await financeModel.getTrialBalance(periodId);

      ResponseHandler.success(res, result, '获取试算平衡表成功');
    } catch (error) {
      logger.error('获取试算平衡表失败:', error);
      ResponseHandler.error(res, '获取试算平衡表失败', 'SERVER_ERROR', 500, error);
    }
  },

  // ===== 期末结转相关方法 =====

  /**
   * 获取期末结转预览
   */
  getClosingPreview: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return ResponseHandler.error(res, '会计期间ID为必填项', 'VALIDATION_ERROR', 400);
      }

      const result = await financeModel.getClosingPreview(parseInt(id));

      ResponseHandler.success(res, result, '获取期末结转预览成功');
    } catch (error) {
      logger.error('获取期末结转预览失败:', error);
      const message = error.message || '获取期末结转预览失败';
      ResponseHandler.error(res, message, 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 执行期末结转
   */
  executeClosing: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return ResponseHandler.error(res, '会计期间ID为必填项', 'VALIDATION_ERROR', 400);
      }

      const PeriodEndService = require('../../../services/business/PeriodEndService'); // Lazy require or top level

      // 获取当前登录用户ID
      const operatorName = await getCurrentUserName(req); // PeriodEndService needs name for closed_by

      const result = await PeriodEndService.closePeriod({
        period_id: parseInt(id),
        closed_by: operatorName,
        closing_date: new Date(),
      });

      ResponseHandler.success(res, result, '期末结转执行成功');
    } catch (error) {
      logger.error('执行期末结转失败:', error);
      const message = error.message || '执行期末结转失败';
      ResponseHandler.error(res, message, 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取期末结转历史
   */
  getClosingHistory: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return ResponseHandler.error(res, '会计期间ID为必填项', 'VALIDATION_ERROR', 400);
      }

      const entries = await financeModel.getClosingHistory(parseInt(id));

      ResponseHandler.success(res, { entries }, '获取期末结转历史成功');
    } catch (error) {
      logger.error('获取期末结转历史失败:', error);
      ResponseHandler.error(res, '获取期末结转历史失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = financeController;
