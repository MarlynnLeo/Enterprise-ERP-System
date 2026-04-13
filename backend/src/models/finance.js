/**
 * finance.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const logger = require('../utils/logger');
const db = require('../config/db');
const { getUserIdByIdentifier } = require('../utils/userUtils');
const { accountingConfig } = require('../config/accountingConfig');

/**
 * 财务模块数据库操作
 */
const financeModel = {
  /**
   * @deprecated 财务模块表结构已迁移至 Knex 迁移文件 20260312000003 管理
   */
  createFinanceTablesIfNotExist: async () => {
    // 表结构由 migrations/20260312000003 管理
    return true;
  },



  // ===== 总账科目相关方法 =====

  /**
   * 获取所有会计科目
   */
  getAllAccounts: async () => {
    try {
      const [accounts] = await db.pool.execute('SELECT * FROM gl_accounts ORDER BY account_code');
      return accounts;
    } catch (error) {
      logger.error('获取会计科目失败:', error);
      throw error;
    }
  },

  /**
   * 获取会计科目列表（支持分页和搜索）
   */
  getAccountsList: async (filters = {}, page = 1, limit = 20) => {
    try {
      // 确保filters是一个对象
      const safeFilters = filters || {};

      // 构建查询条件
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (safeFilters.account_code) {
        whereClause += ' AND account_code LIKE ?';
        params.push(`%${safeFilters.account_code}%`);
      }

      if (safeFilters.account_name) {
        whereClause += ' AND account_name LIKE ?';
        params.push(`%${safeFilters.account_name}%`);
      }

      if (safeFilters.account_type) {
        whereClause += ' AND account_type = ?';
        params.push(safeFilters.account_type);
      }

      // 获取总记录数
      const countQuery = `SELECT COUNT(*) as total FROM gl_accounts ${whereClause}`;
      const [countResult] = await db.pool.query(countQuery, params);
      const total = countResult[0].total;

      // 计算分页参数 - 确保是有效的数字
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.max(1, Math.min(1000, parseInt(limit) || 20));
      const offset = (pageNum - 1) * limitNum;

      // 验证参数类型
      if (isNaN(pageNum) || isNaN(limitNum) || isNaN(offset)) {
        throw new Error('Invalid pagination parameters');
      }

      // 获取分页数据 - 使用 query 而不是 execute 来避免 LIMIT/OFFSET 参数问题
      const dataQuery = `
        SELECT * FROM gl_accounts
        ${whereClause}
        ORDER BY account_code
        LIMIT ${limitNum} OFFSET ${offset}
      `;
      const [accounts] = await db.pool.query(dataQuery, params);

      return {
        accounts,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      logger.error('获取会计科目列表失败:', error);
      throw error;
    }
  },

  /**
   * 按ID获取会计科目
   */
  getAccountById: async (id) => {
    try {
      const [accounts] = await db.pool.execute('SELECT * FROM gl_accounts WHERE id = ?', [id]);
      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      logger.error('按ID获取会计科目失败:', error);
      throw error;
    }
  },

  /**
   * 创建会计科目
   */
  createAccount: async (accountData) => {
    try {
      // 加载财务配置获取默认值
      const { financeConfig } = require('../config/financeConfig');
      await financeConfig.loadFromDatabase(db);

      const [result] = await db.pool.execute(
        'INSERT INTO gl_accounts (account_code, account_name, account_type, parent_id, is_debit, is_active, currency_code, description, has_customer, has_supplier, has_employee, has_department, has_project) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          accountData.account_code,
          accountData.account_name,
          accountData.account_type,
          accountData.parent_id || null,
          accountData.is_debit,
          accountData.is_active !== undefined
            ? accountData.is_active
            : financeConfig.get('account.defaultIsActive', true),
          accountData.currency_code || financeConfig.get('account.defaultCurrency', 'CNY'),
          accountData.description || null,
          accountData.has_customer ? 1 : 0,
          accountData.has_supplier ? 1 : 0,
          accountData.has_employee ? 1 : 0,
          accountData.has_department ? 1 : 0,
          accountData.has_project ? 1 : 0,
        ]
      );
      return result.insertId;
    } catch (error) {
      logger.error('创建会计科目失败:', error);
      throw error;
    }
  },

  /**
   * 更新会计科目
   */
  updateAccount: async (id, accountData) => {
    try {
      const [result] = await db.pool.execute(
        'UPDATE gl_accounts SET account_name = ?, account_type = ?, parent_id = ?, is_debit = ?, is_active = ?, currency_code = ?, description = ?, has_customer = ?, has_supplier = ?, has_employee = ?, has_department = ?, has_project = ? WHERE id = ?',
        [
          accountData.account_name,
          accountData.account_type,
          accountData.parent_id || null,
          accountData.is_debit,
          accountData.is_active !== undefined ? accountData.is_active : true,
          accountData.currency_code || 'CNY',
          accountData.description || null,
          accountData.has_customer ? 1 : 0,
          accountData.has_supplier ? 1 : 0,
          accountData.has_employee ? 1 : 0,
          accountData.has_department ? 1 : 0,
          accountData.has_project ? 1 : 0,
          id,
        ]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新会计科目失败:', error);
      throw error;
    }
  },

  /**
   * 删除会计科目（软删除，设置为非活跃）
   */
  deactivateAccount: async (id) => {
    try {
      const [result] = await db.pool.execute(
        'UPDATE gl_accounts SET is_active = false WHERE id = ?',
        [id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('停用会计科目失败:', error);
      throw error;
    }
  },

  /**
   * 更新会计科目状态
   */
  updateAccountStatus: async (id, isActive) => {
    try {
      const [result] = await db.pool.execute('UPDATE gl_accounts SET is_active = ? WHERE id = ?', [
        isActive,
        id,
      ]);
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新会计科目状态失败:', error);
      throw error;
    }
  },

  /**
   * 设置期初余额
   * @param {number} accountId - 科目ID
   * @param {Object} balanceData - 余额数据 { debit, credit, balanceDate }
   */
  setOpeningBalance: async (accountId, balanceData) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 更新科目期初余额
      await connection.execute(
        `UPDATE gl_accounts SET 
          opening_debit = ?, 
          opening_credit = ?, 
          opening_balance_date = ?,
          opening_balance_set = 1 
        WHERE id = ?`,
        [
          balanceData.debit || 0,
          balanceData.credit || 0,
          balanceData.balanceDate || new Date().toISOString().split('T')[0],
          accountId,
        ]
      );

      // 记录历史
      await connection.execute(
        `INSERT INTO gl_opening_balance_history 
          (account_id, opening_debit, opening_credit, balance_date, set_by, notes)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          accountId,
          balanceData.debit || 0,
          balanceData.credit || 0,
          balanceData.balanceDate || new Date().toISOString().split('T')[0],
          balanceData.setBy || 1,
          balanceData.notes || '设置期初余额',
        ]
      );

      await connection.commit();
      logger.info(`期初余额设置成功: 科目ID=${accountId}`);
      return { success: true };
    } catch (error) {
      await connection.rollback();
      logger.error('设置期初余额失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 批量设置期初余额
   * @param {Array} balances - 余额数组 [{ accountId, debit, credit }]
   * @param {string} balanceDate - 余额日期
   */
  setBatchOpeningBalance: async (balances, balanceDate) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const item of balances) {
        await connection.execute(
          `UPDATE gl_accounts SET 
            opening_debit = ?, 
            opening_credit = ?, 
            opening_balance_date = ?,
            opening_balance_set = 1 
          WHERE id = ?`,
          [item.debit || 0, item.credit || 0, balanceDate, item.accountId]
        );
      }

      await connection.commit();
      logger.info(`批量期初余额设置成功: ${balances.length}个科目`);
      return { success: true, count: balances.length };
    } catch (error) {
      await connection.rollback();
      logger.error('批量设置期初余额失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 获取期初余额列表
   */
  getOpeningBalances: async () => {
    try {
      const [accounts] = await db.pool.execute(`
        SELECT id, account_code, account_name, account_type, is_debit,
          opening_debit, opening_credit, opening_balance_date, opening_balance_set
        FROM gl_accounts 
        WHERE is_active = 1 
        ORDER BY account_code
      `);
      return accounts;
    } catch (error) {
      logger.error('获取期初余额列表失败:', error);
      throw error;
    }
  },

  // ===== 会计分录相关方法 =====

  /**
   * 创建会计分录（包含明细）
   * @deprecated 应该使用 GLService.createEntry() 替代。保留此方法是为了兼容老代码。
   *
   * @param {Object} entryData - 分录头数据
   * @param {Array} entryItems - 分录明细数组
   * @param {Object} connection - 数据库连接（可选，用于事务嵌套）
   * @returns {Promise<number>} 分录ID
   */
  createEntry: async (entryData, entryItems, connection = null) => {
    // 委托给 GLService (实现单一职责)
    // 注意: 这需要引入 GLService，为了避免循环依赖问题，我们在方法内部 require
    const GLService = require('../services/finance/GLService');
    return await GLService.createEntry(entryData, entryItems, connection);
  },

  /**
   * 按ID获取会计分录（包含明细）
   */
  getEntryById: async (id) => {
    try {
      // 获取分录头
      const [entries] = await db.pool.execute('SELECT * FROM gl_entries WHERE id = ?', [id]);
      if (entries.length === 0) return null;

      const entry = entries[0];

      // 获取分录明细
      const [items] = await db.pool.execute('SELECT * FROM gl_entry_items WHERE entry_id = ?', [
        id,
      ]);
      entry.items = items;

      return entry;
    } catch (error) {
      logger.error('获取会计分录失败:', error);
      throw error;
    }
  },

  /**
   * 获取会计分录列表
   */
  getEntries: async (filters = {}, page = 1, pageSize = 20) => {
    let connection;
    try {
      // 获取数据库连接
      connection = await db.pool.getConnection();

      // gl_entries 表由 migrations/20260312000003 管理，无需运行时检查


      // 关联 gl_periods 表获取期间名称，关联 users 表获取创建人姓名
      let query = `
        SELECT
          e.*,
          p.period_name,
          p.fiscal_year,
          u.real_name as creator_name,
          u.username as creator_username,
          (SELECT SUM(debit_amount) FROM gl_entry_items WHERE entry_id = e.id) as total_debit,
          (SELECT SUM(credit_amount) FROM gl_entry_items WHERE entry_id = e.id) as total_credit
        FROM gl_entries e
        LEFT JOIN gl_periods p ON e.period_id = p.id
        LEFT JOIN users u ON e.created_by = u.id
        WHERE 1=1
      `;
      const params = [];

      // 添加过滤条件（使用表别名 e）
      if (filters.entry_number) {
        query += ' AND e.entry_number LIKE ?';
        params.push(`%${filters.entry_number}%`);
      }

      if (filters.start_date && filters.end_date) {
        query += ' AND e.entry_date BETWEEN ? AND ?';
        params.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        query += ' AND e.entry_date >= ?';
        params.push(filters.start_date);
      } else if (filters.end_date) {
        query += ' AND e.entry_date <= ?';
        params.push(filters.end_date);
      }

      if (filters.document_type) {
        query += ' AND e.document_type = ?';
        params.push(filters.document_type);
      }

      // 按凭证字筛选（收/付/转）
      if (filters.voucher_word) {
        query += ' AND e.voucher_word = ?';
        params.push(filters.voucher_word);
      }

      if (filters.period_id) {
        query += ' AND e.period_id = ?';
        params.push(parseInt(filters.period_id));
      }

      if (filters.is_posted !== undefined) {
        query += ' AND e.is_posted = ?';
        params.push(filters.is_posted === 'true' ? 1 : 0);
      }

      // 添加排序和分页（使用表别名 e）
      // 优先按会计期间、凭证字、凭证号排序，符合会计习惯
      const limit = parseInt(pageSize);
      const offset = (parseInt(page) - 1) * limit;
      query += ` ORDER BY e.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      // 执行查询
      const [entries] = await connection.execute(query, params);

      // 获取总记录数
      let countQuery = 'SELECT COUNT(*) as total FROM gl_entries WHERE 1=1';
      const countParams = [];

      // 添加与主查询相同的过滤条件
      if (filters.entry_number) {
        countQuery += ' AND entry_number LIKE ?';
        countParams.push(`%${filters.entry_number}%`);
      }

      if (filters.start_date && filters.end_date) {
        countQuery += ' AND entry_date BETWEEN ? AND ?';
        countParams.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        countQuery += ' AND entry_date >= ?';
        countParams.push(filters.start_date);
      } else if (filters.end_date) {
        countQuery += ' AND entry_date <= ?';
        countParams.push(filters.end_date);
      }

      if (filters.document_type) {
        countQuery += ' AND document_type = ?';
        countParams.push(filters.document_type);
      }

      if (filters.period_id) {
        countQuery += ' AND period_id = ?';
        countParams.push(parseInt(filters.period_id));
      }

      if (filters.is_posted !== undefined) {
        countQuery += ' AND is_posted = ?';
        countParams.push(filters.is_posted === 'true' ? 1 : 0);
      }

      const [countResult] = await connection.execute(countQuery, countParams);
      const total = countResult[0].total;

      const result = {
        entries,
        pagination: {
          total,
          page: parseInt(page),
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
        },
      };

      return result;
    } catch (error) {
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },

  /**
   * 获取会计分录明细
   */
  getEntryItems: async (entryId) => {
    try {
      // 使用JOIN查询获取包含科目信息的明细
      const [items] = await db.pool.execute(
        `
        SELECT 
          ei.*, 
          a.account_code, 
          a.account_name
        FROM 
          gl_entry_items ei
        JOIN 
          gl_accounts a ON ei.account_id = a.id
        WHERE 
          ei.entry_id = ?
        ORDER BY 
          ei.id
      `,
        [entryId]
      );

      return items;
    } catch (error) {
      logger.error('获取会计分录明细失败:', error);
      throw error;
    }
  },

  /**
   * 过账会计分录
   */
  postEntry: async (id) => {
    try {
      const [result] = await db.pool.execute(
        'UPDATE gl_entries SET is_posted = true WHERE id = ?',
        [id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('过账会计分录失败:', error);
      throw error;
    }
  },

  /**
   * 冲销会计分录
   */
  reverseEntry: async (id, reversalData) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 获取原始分录及其明细
      const [entries] = await connection.execute('SELECT * FROM gl_entries WHERE id = ?', [id]);
      if (entries.length === 0) {
        throw new Error('找不到要冲销的分录');
      }

      const originalEntry = entries[0];
      const [items] = await connection.execute('SELECT * FROM gl_entry_items WHERE entry_id = ?', [
        id,
      ]);

      // 使用原始凭证的凭证字，如果没有则默认为 "记"
      const voucherWord = originalEntry.voucher_word || '记';

      // 获取该期间+凭证字的下一个可用凭证号 (使用 FOR UPDATE 锁防止并发冲突)
      const [maxVoucher] = await connection.execute(
        `SELECT MAX(voucher_number) as max_num FROM gl_entries 
         WHERE period_id = ? AND voucher_word = ? FOR UPDATE`,
        [reversalData.period_id, voucherWord]
      );
      const voucherNumber = (maxVoucher[0].max_num || 0) + 1;

      // 自动生成唯一的冲销分录编号（格式: R-{凭证字}-{序号}）
      // 从数据库查询该前缀的最大编号，避免唯一键冲突
      const reversalPrefix = `R-${voucherWord}-`;
      const [maxReversal] = await connection.execute(
        `SELECT entry_number FROM gl_entries 
         WHERE entry_number LIKE ? 
         ORDER BY CAST(SUBSTRING(entry_number, ?) AS UNSIGNED) DESC 
         LIMIT 1 FOR UPDATE`,
        [`${reversalPrefix}%`, reversalPrefix.length + 1]
      );
      let reversalSeq = 1;
      if (maxReversal.length > 0) {
        const lastNum = parseInt(maxReversal[0].entry_number.substring(reversalPrefix.length));
        if (!isNaN(lastNum)) {
          reversalSeq = lastNum + 1;
        }
      }
      const entryNumber = `${reversalPrefix}${reversalSeq}`;

      // 处理创建人 (标准化为用户ID)
      const { getUserIdByIdentifier } = require('../utils/userUtils');
      const createdById = await getUserIdByIdentifier(
        connection,
        reversalData.created_by || 'system'
      );

      // 创建冲销分录头 (包含 voucher_word 和 voucher_number)
      const [entryResult] = await connection.execute(
        `INSERT INTO gl_entries 
         (entry_number, entry_date, posting_date, document_type, document_number, period_id, is_posted, description, created_by, voucher_word, voucher_number) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entryNumber,
          reversalData.entry_date,
          reversalData.posting_date,
          originalEntry.document_type,
          originalEntry.document_number,
          reversalData.period_id,
          false,
          `冲销分录 ${originalEntry.entry_number}: ${reversalData.description || ''}`,
          createdById,
          voucherWord,
          voucherNumber,
        ]
      );

      const reversalEntryId = entryResult.insertId;

      // 创建冲销分录明细（借贷方向相反）
      for (const item of items) {
        await connection.execute(
          'INSERT INTO gl_entry_items (entry_id, account_id, debit_amount, credit_amount, currency_code, exchange_rate, cost_center_id, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            reversalEntryId,
            item.account_id,
            item.credit_amount, // 借贷方向相反
            item.debit_amount, // 借贷方向相反
            item.currency_code,
            item.exchange_rate,
            item.cost_center_id,
            `冲销明细: ${item.description || ''}`,
          ]
        );
      }

      // 更新原始分录为已冲销
      await connection.execute(
        'UPDATE gl_entries SET is_reversed = true, reversal_entry_id = ? WHERE id = ?',
        [reversalEntryId, id]
      );

      await connection.commit();
      return reversalEntryId;
    } catch (error) {
      await connection.rollback();
      logger.error('冲销会计分录失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  // ===== 会计期间相关方法 =====

  /**
   * 获取当前会计期间（未关闭的最新期间）
   */
  getCurrentPeriod: async () => {
    try {
      const [periods] = await db.pool.execute(
        'SELECT *, is_closed FROM gl_periods WHERE is_closed = 0 ORDER BY end_date DESC LIMIT 1'
      );
      return periods.length > 0 ? periods[0] : null;
    } catch (error) {
      logger.error('获取当前会计期间失败:', error);
      throw error;
    }
  },

  /**
   * 获取所有会计期间
   */
  getAllPeriods: async () => {
    try {
      const [periods] = await db.pool.execute(
        'SELECT *, is_closed FROM gl_periods ORDER BY fiscal_year DESC, start_date DESC'
      );
      return periods;
    } catch (error) {
      logger.error('获取会计期间失败:', error);
      throw error;
    }
  },

  /**
   * 按ID获取会计期间
   */
  getPeriodById: async (id) => {
    try {
      const [periods] = await db.pool.execute('SELECT *, is_closed FROM gl_periods WHERE id = ?', [
        id,
      ]);
      return periods.length > 0 ? periods[0] : null;
    } catch (error) {
      logger.error('按ID获取会计期间失败:', error);
      throw error;
    }
  },

  /**
   * 创建会计期间
   */
  createPeriod: async (periodData) => {
    try {
      const [result] = await db.pool.execute(
        'INSERT INTO gl_periods (period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year) VALUES (?, ?, ?, ?, ?, ?)',
        [
          periodData.period_name,
          periodData.start_date,
          periodData.end_date,
          periodData.is_closed ? 1 : 0,
          periodData.is_adjusting !== undefined ? periodData.is_adjusting : false,
          periodData.fiscal_year,
        ]
      );
      return result.insertId;
    } catch (error) {
      logger.error('创建会计期间失败:', error);
      throw error;
    }
  },

  /**
   * 关闭会计期间
   */
  closePeriod: async (id) => {
    try {
      const [result] = await db.pool.execute(
        'UPDATE gl_periods SET is_closed = 1, closed_at = NOW() WHERE id = ?',
        [id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('关闭会计期间失败:', error);
      throw error;
    }
  },

  /**
   * 重新开启会计期间
   */
  reopenPeriod: async (id) => {
    try {
      const [result] = await db.pool.execute(
        'UPDATE gl_periods SET is_closed = 0, closed_at = NULL WHERE id = ?',
        [id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('重新开启会计期间失败:', error);
      throw error;
    }
  },

  // ===== 试算平衡表相关方法 =====

  /**
   * 获取试算平衡表
   * @param {number} periodId - 会计期间ID（可选，不传则查询所有期间）
   * @returns {Object} 试算平衡表数据
   */
  getTrialBalance: async (periodId = null) => {
    try {
      let periodStartDate = null;
      let periodEndDate = null;
      const params = [];

      // 1. 获取期间日期范围
      if (periodId) {
        const [periods] = await db.pool.execute(
          'SELECT start_date, end_date FROM gl_periods WHERE id = ?',
          [periodId]
        );
        if (periods.length > 0) {
          periodStartDate = periods[0].start_date;
          periodEndDate = periods[0].end_date;
        }
      }

      // 2. 构建查询
      // 使用条件聚合分别计算期初余额和本期发生额
      // 期初余额：日期 < 本期开始日期 的所有已过账凭证
      // 本期发生：日期在本期范围内 的所有已过账凭证（使用日期范围而非 period_id）

      const query = `
        SELECT
          a.id,
          a.account_code,
          a.account_name,
          a.account_type,
          a.is_debit,

          -- 期初净额 (借-贷)
          COALESCE(SUM(CASE
            WHEN e.is_posted = 1 AND ${periodStartDate ? 'e.entry_date < ?' : '1=0'} THEN (ei.debit_amount - ei.credit_amount)
            ELSE 0
          END), 0) as opening_net,

          -- 本期发生额（使用日期范围过滤）
          COALESCE(SUM(CASE
            WHEN e.is_posted = 1 AND ${periodStartDate && periodEndDate ? 'e.entry_date >= ? AND e.entry_date <= ?' : '1=1'} THEN ei.debit_amount
            ELSE 0
          END), 0) as period_debit,

          COALESCE(SUM(CASE
            WHEN e.is_posted = 1 AND ${periodStartDate && periodEndDate ? 'e.entry_date >= ? AND e.entry_date <= ?' : '1=1'} THEN ei.credit_amount
            ELSE 0
          END), 0) as period_credit

        FROM gl_accounts a
        LEFT JOIN gl_entry_items ei ON a.id = ei.account_id
        LEFT JOIN gl_entries e ON ei.entry_id = e.id
        WHERE a.is_active = 1
        GROUP BY a.id, a.account_code, a.account_name, a.account_type, a.is_debit
        ORDER BY a.account_code
      `;

      // [M-3] 构建参数列表 — 按 SQL 中占位符顺序依次推入，避免参数错位
      // SQL 中占位符顺序: 1=opening_net(periodStartDate), 2-3=period_debit(start,end), 4-5=period_credit(start,end)
      if (periodStartDate) {
        params.push(periodStartDate);       // 占位符1: opening_net 条件
      }
      if (periodStartDate && periodEndDate) {
        params.push(periodStartDate, periodEndDate); // 占位符2-3: period_debit 条件
        params.push(periodStartDate, periodEndDate); // 占位符4-5: period_credit 条件
      }

      const [rows] = await db.pool.query(query, params);

      // 辅助函数：保留两位小数
      const round2 = (num) => Math.round((parseFloat(num) || 0) * 100) / 100;

      // 3. 计算最终余额
      const accounts = rows.map((row) => {
        const openingNet = round2(row.opening_net);
        const periodDebit = round2(row.period_debit);
        const periodCredit = round2(row.period_credit);

        // 期末净额 = 期初净额 + 本期借方 - 本期贷方
        const endingNet = round2(openingNet + periodDebit - periodCredit);

        return {
          id: row.id,
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: row.account_type,
          is_debit: row.is_debit,

          // 期初余额显示
          opening_balance: row.is_debit ? openingNet : -openingNet,

          // 本期发生
          total_debit: periodDebit,
          total_credit: periodCredit,

          // 期末余额显示 (分借贷列)
          debit_balance: endingNet > 0 ? endingNet : 0,
          credit_balance: endingNet < 0 ? Math.abs(endingNet) : 0,
        };
      });

      // 4. 计算汇总
      const summary = accounts.reduce(
        (acc, item) => {
          acc.total_debit = round2(acc.total_debit + item.total_debit);
          acc.total_credit = round2(acc.total_credit + item.total_credit);
          acc.total_debit_balance = round2(acc.total_debit_balance + item.debit_balance);
          acc.total_credit_balance = round2(acc.total_credit_balance + item.credit_balance);
          return acc;
        },
        { total_debit: 0, total_credit: 0, total_debit_balance: 0, total_credit_balance: 0 }
      );

      // 简单判断平衡 (允许微小误差)
      const isBalanced =
        Math.abs(summary.total_debit_balance - summary.total_credit_balance) < 0.01;

      return {
        trialBalance: accounts,
        summary,
        isBalanced,
      };
    } catch (error) {
      logger.error('获取试算平衡表失败:', error);
      throw error;
    }
  },

  // ===== 期末结转相关方法 =====

  /**
   * 获取期末结转预览
   * @param {number} periodId - 会计期间ID
   * @returns {Object} 结转预览数据
   */
  getClosingPreview: async (periodId) => {
    try {
      // 检查期间是否存在且未关闭
      const [periods] = await db.pool.execute('SELECT * FROM gl_periods WHERE id = ?', [periodId]);
      if (periods.length === 0) {
        throw new Error('会计期间不存在');
      }
      if (periods[0].status === 'closed') {
        throw new Error('会计期间已关闭');
      }

      // 检查是否有未过账凭证
      const [unpostedEntries] = await db.pool.execute(
        'SELECT COUNT(*) as count FROM gl_entries WHERE period_id = ? AND is_posted = 0',
        [periodId]
      );
      const hasUnpostedEntries = parseInt(unpostedEntries[0].count) > 0;

      // 查询损益类科目的发生额（收入类和费用类）
      const [incomeAccounts] = await db.pool.query(
        `
        SELECT 
          a.id as account_id,
          a.account_code,
          a.account_name,
          a.account_type,
          a.is_debit,
          COALESCE(SUM(ei.debit_amount), 0) as total_debit,
          COALESCE(SUM(ei.credit_amount), 0) as total_credit
        FROM gl_accounts a
        LEFT JOIN gl_entry_items ei ON a.id = ei.account_id
        LEFT JOIN gl_entries e ON ei.entry_id = e.id AND e.period_id = ? AND e.is_posted = 1
        WHERE a.is_active = 1 AND a.account_type IN ('收入', '费用', '成本')
        GROUP BY a.id, a.account_code, a.account_name, a.account_type, a.is_debit
        HAVING total_debit > 0 OR total_credit > 0
        ORDER BY a.account_code
      `,
        [periodId]
      );

      // 计算各科目的余额
      const closingItems = incomeAccounts.map((item) => {
        const debit = parseFloat(item.total_debit) || 0;
        const credit = parseFloat(item.total_credit) || 0;
        // 收入类：贷方 - 借方 = 净收入（正数）
        // 费用/成本类：借方 - 贷方 = 净支出（正数）
        let closingAmount = 0;
        let closingDirection = '';

        if (item.account_type === '收入') {
          closingAmount = credit - debit; // 收入净额
          closingDirection = closingAmount >= 0 ? '借方' : '贷方';
        } else {
          closingAmount = debit - credit; // 费用净额
          closingDirection = closingAmount >= 0 ? '贷方' : '借方';
        }

        return {
          ...item,
          total_debit: debit,
          total_credit: credit,
          closing_amount: Math.abs(closingAmount),
          closing_direction: closingDirection,
        };
      });

      // 计算本期利润（收入 - 费用 - 成本）
      let totalIncome = 0;
      let totalExpense = 0;
      closingItems.forEach((item) => {
        if (item.account_type === '收入') {
          totalIncome += item.total_credit - item.total_debit;
        } else {
          totalExpense += item.total_debit - item.total_credit;
        }
      });
      const netProfit = totalIncome - totalExpense;

      return {
        period: periods[0],
        hasUnpostedEntries,
        unpostedCount: parseInt(unpostedEntries[0].count),
        closingItems,
        summary: {
          totalIncome,
          totalExpense,
          netProfit,
        },
        canClose: !hasUnpostedEntries,
      };
    } catch (error) {
      logger.error('获取期末结转预览失败:', error);
      throw error;
    }
  },

  /**
   * 执行期末结转
   * @param {number} periodId - 会计期间ID
   * @param {number} operatorId - 操作人ID
   * @returns {Object} 结转结果
   */
  executeClosing: async (periodId, operatorId) => {
    const conn = await db.pool.getConnection();
    try {
      await conn.beginTransaction();

      // 获取结转预览数据
      const preview = await financeModel.getClosingPreview(periodId);

      if (!preview.canClose) {
        throw new Error('存在未过账凭证，无法结转');
      }

      if (preview.closingItems.length === 0) {
        // 没有需要结转的科目，直接关闭期间
        await conn.execute('UPDATE gl_periods SET is_closed = 1, closed_at = NOW() WHERE id = ?', [
          periodId,
        ]);
        await conn.commit();
        return {
          success: true,
          message: '没有需要结转的损益科目，已关闭会计期间',
          entryId: null,
        };
      }

      // 查找"本年利润"科目
      const profitAccountCode = accountingConfig.getAccountCode('CURRENT_YEAR_PROFIT') || '3103';
      const [profitAccounts] = await conn.execute(
        `SELECT id FROM gl_accounts WHERE account_code = ? OR account_name LIKE '%本年利润%' LIMIT 1`,
        [profitAccountCode]
      );

      if (profitAccounts.length === 0) {
        throw new Error(
          `未找到"本年利润"科目，请先创建科目编码为${profitAccountCode}的本年利润科目`
        );
      }
      const profitAccountId = profitAccounts[0].id;

      // 生成结转凭证编号
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const [maxEntry] = await conn.execute(
        'SELECT MAX(entry_number) as max_entry FROM gl_entries WHERE entry_number LIKE ? FOR UPDATE',
        [`JE${dateStr}%`]
      );
      let sequence = 1;
      if (maxEntry[0].max_entry) {
        sequence = parseInt(maxEntry[0].max_entry.slice(-4), 10) + 1;
      }
      const entryNumber = `JE${dateStr}${sequence.toString().padStart(4, '0')}`;

      // 创建结转凭证头
      const today = new Date().toISOString().slice(0, 10);
      const [entryResult] = await conn.execute(
        `INSERT INTO gl_entries (entry_number, entry_date, posting_date, document_type, period_id, description, is_posted, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entryNumber,
          today,
          today,
          '期末结转',
          periodId,
          `${preview.period.period_name}期末损益结转`,
          1,
          operatorId,
        ]
      );
      const entryId = entryResult.insertId;

      // [H-5] 创建规范的复式簿记结转分录
      // 每个损益科目都与"本年利润"配对，生成完整的借贷对
      let totalDebit = 0;
      let totalCredit = 0;

      for (const item of preview.closingItems) {
        if (item.closing_amount > 0) {
          if (item.account_type === '收入') {
            // 收入类结转：借记收入科目（清零），贷记本年利润（转入利润）
            // 第1行：借 收入科目
            await conn.execute(
              'INSERT INTO gl_entry_items (entry_id, account_id, debit_amount, credit_amount, description) VALUES (?, ?, ?, ?, ?)',
              [entryId, item.account_id, item.closing_amount, 0, `结转${item.account_name}`]
            );
            // 第2行：贷 本年利润
            await conn.execute(
              'INSERT INTO gl_entry_items (entry_id, account_id, debit_amount, credit_amount, description) VALUES (?, ?, ?, ?, ?)',
              [entryId, profitAccountId, 0, item.closing_amount, `结转${item.account_name}至本年利润`]
            );
            totalDebit += item.closing_amount;
            totalCredit += item.closing_amount;
          } else {
            // 费用/成本类结转：借记本年利润（扣减利润），贷记费用科目（清零）
            // 第1行：借 本年利润
            await conn.execute(
              'INSERT INTO gl_entry_items (entry_id, account_id, debit_amount, credit_amount, description) VALUES (?, ?, ?, ?, ?)',
              [entryId, profitAccountId, item.closing_amount, 0, `结转${item.account_name}至本年利润`]
            );
            // 第2行：贷 费用科目
            await conn.execute(
              'INSERT INTO gl_entry_items (entry_id, account_id, debit_amount, credit_amount, description) VALUES (?, ?, ?, ?, ?)',
              [entryId, item.account_id, 0, item.closing_amount, `结转${item.account_name}`]
            );
            totalDebit += item.closing_amount;
            totalCredit += item.closing_amount;
          }
        }
      }

      // 借贷平衡校验（规范的复式簿记结转凭证必然自平衡）
      const balanceDiff = Math.abs(Math.round(totalDebit * 100) - Math.round(totalCredit * 100));
      if (balanceDiff > 1) {
        throw new Error(`期末结转凭证借贷不平衡: 借方=${totalDebit}, 贷方=${totalCredit}`);
      }

      // 关闭会计期间
      await conn.execute('UPDATE gl_periods SET is_closed = 1, closed_at = NOW() WHERE id = ?', [
        periodId,
      ]);

      await conn.commit();

      return {
        success: true,
        message: '期末结转完成',
        entryId,
        entryNumber,
        netProfit: preview.summary.netProfit,
      };
    } catch (error) {
      await conn.rollback();
      logger.error('执行期末结转失败:', error);
      throw error;
    } finally {
      conn.release();
    }
  },

  /**
   * 获取期末结转历史
   * @param {number} periodId - 会计期间ID
   * @returns {Array} 结转历史记录
   */
  getClosingHistory: async (periodId) => {
    try {
      const [entries] = await db.pool.execute(
        `
        SELECT 
          e.*,
          u.real_name as operator_name
        FROM gl_entries e
        LEFT JOIN users u ON e.created_by = u.id
        WHERE e.period_id = ? 
          AND (e.description LIKE '%结转%' 
               OR e.document_type LIKE '%结转%'
               OR e.document_number LIKE 'PL-%')
        ORDER BY e.created_at DESC
      `,
        [periodId]
      );

      return entries;
    } catch (error) {
      logger.error('获取期末结转历史失败:', error);
      throw error;
    }
  },

  // ===== 系统初始化方法 =====

  /**
   * 初始化会计科目和会计期间
   */
  initializeGLAccounts: async () => {
    const conn = await db.pool.getConnection();
    try {
      await conn.beginTransaction();

      // 检查基本会计科目是否存在
      const requiredAccounts = [
        { id: 1001, code: '1001', name: '现金', type: '资产' },
        { id: 1002, code: '1002', name: '银行存款', type: '资产' },
        { id: 2202, code: '2202', name: '应付账款', type: '负债' },
      ];

      logger.info('开始检查和创建基本会计科目...');

      for (const account of requiredAccounts) {
        const [existingAccount] = await conn.execute('SELECT id FROM gl_accounts WHERE id = ?', [
          account.id,
        ]);

        if (existingAccount.length === 0) {
          logger.info(`创建会计科目: ${account.code} ${account.name}`);
          await conn.execute(
            'INSERT INTO gl_accounts (id, account_code, account_name, account_type, is_active) VALUES (?, ?, ?, ?, ?)',
            [account.id, account.code, account.name, account.type, true]
          );
        } else {
          logger.info(`会计科目已存在: ${account.code} ${account.name}`);
        }
      }

      // 检查基本会计期间是否存在
      const [existingPeriod] = await conn.execute('SELECT id FROM gl_periods WHERE id = ?', [1]);

      if (existingPeriod.length === 0) {
        const currentYear = new Date().getFullYear();
        logger.info(`创建会计期间: ${currentYear}年`);
        await conn.execute(
          'INSERT INTO gl_periods (id, period_name, start_date, end_date, is_closed, fiscal_year) VALUES (?, ?, ?, ?, ?, ?)',
          [1, `${currentYear}年`, `${currentYear}-01-01`, `${currentYear}-12-31`, 0, currentYear]
        );
      } else {
        logger.info('会计期间已存在');
      }

      await conn.commit();
      logger.info('会计科目和会计期间初始化完成');
      return true;
    } catch (error) {
      await conn.rollback();
      logger.error('初始化会计科目和会计期间失败:', error);
      throw error;
    } finally {
      conn.release();
    }
  },

  /**
   * 创建财务系统所需的表格
   * @deprecated 表结构已迁移至 Knex migration 文件管理，此方法保留为空操作以兼容旧调用
   */
  createTables: async () => {
    logger.info('财务系统表格已由 Knex migration 管理，跳过运行时创建');
    return true;
  },
};

module.exports = financeModel;
