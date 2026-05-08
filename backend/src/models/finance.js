/**
 * finance.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const logger = require('../utils/logger');
const db = require('../config/db');

function requirePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(value).trim() !== String(parsed)) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

function toDateString(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function normalizeDateInput(value, fieldName) {
  const dateString = toDateString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`${fieldName}格式必须为YYYY-MM-DD`);
  }

  const [year, month, day] = dateString.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName}不是有效日期`);
  }

  return dateString;
}

function isClosedFlag(value) {
  return value === true || value === 1 || value === '1';
}

function parseOptionalBoolean(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  if (value === false || value === 0 || value === '0' || value === 'false') return 0;
  throw new Error(`${fieldName} must be true or false`);
}

function isDateWithinPeriod(date, period) {
  const startDate = toDateString(period.start_date);
  const endDate = toDateString(period.end_date);
  return date >= startDate && date <= endDate;
}

async function resolveOpenPeriodForDates(connection, periodId, entryDate, postingDate) {
  if (periodId) {
    const resolvedPeriodId = requirePositiveInteger(periodId, '会计期间');
    const [periods] = await connection.execute(
      `SELECT id, is_closed, period_name, start_date, end_date
       FROM gl_periods
       WHERE id = ?
       FOR UPDATE`,
      [resolvedPeriodId]
    );

    if (periods.length === 0) {
      throw new Error('会计期间不存在');
    }

    const period = periods[0];
    if (!isDateWithinPeriod(entryDate, period) || !isDateWithinPeriod(postingDate, period)) {
      throw new Error(
        `冲销日期 ${entryDate} 或过账日期 ${postingDate} 不在会计期间[${period.period_name} ${toDateString(period.start_date)} 至 ${toDateString(period.end_date)}]内`
      );
    }

    if (isClosedFlag(period.is_closed)) {
      throw new Error(`不能在已关闭的会计期间[${period.period_name}]冲销凭证`);
    }

    return period;
  }

  const [periods] = await connection.execute(
    `SELECT id, is_closed, period_name, start_date, end_date
     FROM gl_periods
     WHERE ? BETWEEN start_date AND end_date
       AND ? BETWEEN start_date AND end_date
     ORDER BY start_date DESC
     LIMIT 1
     FOR UPDATE`,
    [entryDate, postingDate]
  );

  if (periods.length === 0) {
    throw new Error(`冲销日期 ${entryDate} 和过账日期 ${postingDate} 未匹配到同一个会计期间`);
  }

  if (isClosedFlag(periods[0].is_closed)) {
    throw new Error(`不能在已关闭的会计期间[${periods[0].period_name}]冲销凭证`);
  }

  return periods[0];
}

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
      const setBy = requirePositiveInteger(balanceData.setBy, 'setBy');

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
          setBy,
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
      const [entries] = await db.pool.execute(
        `SELECT
          e.*,
          EXISTS(
            SELECT 1
            FROM gl_entries source_entry
            WHERE source_entry.reversal_entry_id = e.id
          ) AS is_reversal_entry,
          (
            SELECT source_entry.id
            FROM gl_entries source_entry
            WHERE source_entry.reversal_entry_id = e.id
            LIMIT 1
          ) AS reversal_of_entry_id
         FROM gl_entries e
         WHERE e.id = ?
         LIMIT 1`,
        [id]
      );
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
          EXISTS(
            SELECT 1
            FROM gl_entries source_entry
            WHERE source_entry.reversal_entry_id = e.id
          ) AS is_reversal_entry,
          (
            SELECT source_entry.id
            FROM gl_entries source_entry
            WHERE source_entry.reversal_entry_id = e.id
            LIMIT 1
          ) AS reversal_of_entry_id,
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
        params.push(filters.is_posted ? 1 : 0);
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

      // 凭证字筛选（与主查询保持一致）
      if (filters.voucher_word) {
        countQuery += ' AND voucher_word = ?';
        countParams.push(filters.voucher_word);
      }

      if (filters.period_id) {
        countQuery += ' AND period_id = ?';
        countParams.push(parseInt(filters.period_id));
      }

      if (filters.is_posted !== undefined) {
        countQuery += ' AND is_posted = ?';
        countParams.push(filters.is_posted ? 1 : 0);
      }

      const [countResult] = await connection.execute(countQuery, countParams);
      const total = countResult[0].total;

      // 统计查询：已过账/未过账数量 和 总金额（基于相同筛选条件）
      let statsQuery = `SELECT 
        SUM(CASE WHEN is_posted = 1 THEN 1 ELSE 0 END) as posted_count,
        SUM(CASE WHEN is_posted = 0 THEN 1 ELSE 0 END) as unposted_count,
        COALESCE((SELECT SUM(ei.debit_amount) FROM gl_entry_items ei 
          INNER JOIN gl_entries se ON ei.entry_id = se.id WHERE 1=1`;
      const statsParams = [];

      // 复用与 countQuery 相同的筛选条件
      if (filters.entry_number) {
        statsQuery += ' AND se.entry_number LIKE ?';
        statsParams.push(`%${filters.entry_number}%`);
      }
      if (filters.start_date && filters.end_date) {
        statsQuery += ' AND se.entry_date BETWEEN ? AND ?';
        statsParams.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        statsQuery += ' AND se.entry_date >= ?';
        statsParams.push(filters.start_date);
      } else if (filters.end_date) {
        statsQuery += ' AND se.entry_date <= ?';
        statsParams.push(filters.end_date);
      }
      if (filters.document_type) {
        statsQuery += ' AND se.document_type = ?';
        statsParams.push(filters.document_type);
      }
      if (filters.voucher_word) {
        statsQuery += ' AND se.voucher_word = ?';
        statsParams.push(filters.voucher_word);
      }
      if (filters.period_id) {
        statsQuery += ' AND se.period_id = ?';
        statsParams.push(parseInt(filters.period_id));
      }
      if (filters.is_posted !== undefined) {
        statsQuery += ' AND se.is_posted = ?';
        statsParams.push(filters.is_posted ? 1 : 0);
      }

      statsQuery += '), 0) as total_amount FROM gl_entries WHERE 1=1';

      // 外层 FROM gl_entries 也需要相同的筛选条件
      if (filters.entry_number) {
        statsQuery += ' AND entry_number LIKE ?';
        statsParams.push(`%${filters.entry_number}%`);
      }
      if (filters.start_date && filters.end_date) {
        statsQuery += ' AND entry_date BETWEEN ? AND ?';
        statsParams.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        statsQuery += ' AND entry_date >= ?';
        statsParams.push(filters.start_date);
      } else if (filters.end_date) {
        statsQuery += ' AND entry_date <= ?';
        statsParams.push(filters.end_date);
      }
      if (filters.document_type) {
        statsQuery += ' AND document_type = ?';
        statsParams.push(filters.document_type);
      }
      if (filters.voucher_word) {
        statsQuery += ' AND voucher_word = ?';
        statsParams.push(filters.voucher_word);
      }
      if (filters.period_id) {
        statsQuery += ' AND period_id = ?';
        statsParams.push(parseInt(filters.period_id));
      }
      if (filters.is_posted !== undefined) {
        statsQuery += ' AND is_posted = ?';
        statsParams.push(filters.is_posted ? 1 : 0);
      }

      const [statsResult] = await connection.execute(statsQuery, statsParams);

      const result = {
        entries,
        pagination: {
          total,
          page: parseInt(page),
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
        },
        statistics: {
          total,
          posted: parseInt(statsResult[0].posted_count) || 0,
          unposted: parseInt(statsResult[0].unposted_count) || 0,
          totalAmount: parseFloat(statsResult[0].total_amount) || 0,
        },
      };

      return result;
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
   * 删除会计分录（仅允许删除未过账且未冲销的凭证）
   * @param {number} id - 分录ID
   * @returns {Promise<boolean>} 是否删除成功
   * @throws {Error} 当凭证已过账或已冲销时抛出错误
   */
  deleteEntry: async (id) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 检查凭证状态
      const [entries] = await connection.execute(
        'SELECT id, is_posted, is_reversed, entry_number FROM gl_entries WHERE id = ?',
        [id]
      );

      if (entries.length === 0) {
        throw new Error('凭证不存在');
      }

      const entry = entries[0];

      if (entry.is_posted) {
        throw new Error('已过账的凭证不能删除，请使用冲销功能');
      }

      if (entry.is_reversed) {
        throw new Error('已冲销的凭证不能删除');
      }

      // 先删除明细，再删除凭证头
      await connection.execute('DELETE FROM gl_entry_items WHERE entry_id = ?', [id]);
      const [result] = await connection.execute('DELETE FROM gl_entries WHERE id = ?', [id]);

      await connection.commit();

      logger.info(`凭证删除成功: ID=${id}, 编号=${entry.entry_number}`);
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('删除会计分录失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 过账会计分录
   * 安全约束：检查凭证状态和所属期间状态
   */
  postEntry: async (id) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 获取凭证及其所属期间状态
      const [entries] = await connection.execute(
        `SELECT e.id, e.is_posted, e.is_reversed, p.is_closed, p.period_name
         FROM gl_entries e
         LEFT JOIN gl_periods p ON e.period_id = p.id
         WHERE e.id = ?`,
        [id]
      );

      if (entries.length === 0) {
        throw new Error('凭证不存在');
      }

      const entry = entries[0];

      if (entry.is_posted) {
        throw new Error('凭证已过账，无需重复操作');
      }

      if (entry.is_reversed) {
        throw new Error('已冲销的凭证不能过账');
      }

      if (entry.is_closed) {
        throw new Error(`不能在已关闭的会计期间 [${entry.period_name}] 过账凭证`);
      }

      const [result] = await connection.execute(
        "UPDATE gl_entries SET is_posted = 1, status = 'posted' WHERE id = ?",
        [id]
      );

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('过账会计分录失败:', error);
      throw error;
    } finally {
      connection.release();
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

      if (!originalEntry.is_posted) {
        throw new Error('未过账的凭证不能冲销，请直接删除或修改草稿凭证');
      }

      if (originalEntry.is_reversed) {
        throw new Error('凭证已冲销，不能重复冲销');
      }

      const [sourceEntries] = await connection.execute(
        `SELECT id, entry_number
         FROM gl_entries
         WHERE reversal_entry_id = ?
         LIMIT 1
         FOR UPDATE`,
        [id]
      );
      if (sourceEntries.length > 0) {
        throw new Error('冲销凭证不能再次冲销，请查看原凭证或按审批流程做红字更正');
      }

      const entryDate = normalizeDateInput(reversalData.entry_date, '冲销日期');
      const postingDate = normalizeDateInput(
        reversalData.posting_date || reversalData.entry_date,
        '过账日期'
      );
      const reversalPeriod = await resolveOpenPeriodForDates(
        connection,
        reversalData.period_id,
        entryDate,
        postingDate
      );

      const [items] = await connection.execute('SELECT * FROM gl_entry_items WHERE entry_id = ?', [
        id,
      ]);

      if (items.length === 0) {
        throw new Error('原凭证没有明细，不能冲销');
      }

      // 使用原始凭证的凭证字，如果没有则默认为 "记"
      const voucherWord = originalEntry.voucher_word || '记';

      const originalDocumentNumber = originalEntry.document_number || originalEntry.entry_number;
      const documentBase = `R-${originalDocumentNumber}`;
      let reversalDocumentNumber = documentBase.slice(0, 50);

      for (let suffix = 2; suffix <= 100; suffix++) {
        const [existingDocuments] = await connection.execute(
          `SELECT id FROM gl_entries
           WHERE document_type <=> ?
             AND document_number = ?
           LIMIT 1 FOR UPDATE`,
          [originalEntry.document_type, reversalDocumentNumber]
        );

        if (existingDocuments.length === 0) {
          break;
        }

        const suffixText = `-${suffix}`;
        reversalDocumentNumber = `${documentBase.slice(0, 50 - suffixText.length)}${suffixText}`;

        if (suffix === 100) {
          throw new Error('冲销单据号生成失败，请稍后重试');
        }
      }

      const reversalEntryId = await financeModel.createEntry(
        {
          entry_date: entryDate,
          posting_date: postingDate,
          document_type: originalEntry.document_type,
          document_number: reversalDocumentNumber,
          period_id: reversalPeriod.id,
          description: `冲销分录 ${originalEntry.entry_number}: ${reversalData.description || ''}`,
          created_by: reversalData.created_by || 'system',
          voucher_word: voucherWord,
          status: 'posted',
          is_posted: 1,
        },
        items.map((item) => ({
          account_id: item.account_id,
          debit_amount: item.credit_amount,
          credit_amount: item.debit_amount,
          currency_code: item.currency_code || 'CNY',
          exchange_rate: item.exchange_rate || 1,
          cost_center_id: item.cost_center_id,
          description: `冲销明细: ${item.description || ''}`,
        })),
        connection
      );

      // 更新原始分录为已冲销
      await connection.execute(
        "UPDATE gl_entries SET is_reversed = true, reversal_entry_id = ?, status = 'reversed' WHERE id = ?",
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
  getAllPeriods: async (filters = {}) => {
    try {
      const where = [];
      const params = [];

      if (filters.fiscalYear !== undefined && filters.fiscalYear !== null && filters.fiscalYear !== '') {
        const fiscalYear = Number.parseInt(filters.fiscalYear, 10);
        if (!Number.isInteger(fiscalYear)) {
          throw new Error('fiscalYear must be an integer');
        }
        where.push('fiscal_year = ?');
        params.push(fiscalYear);
      }

      const isClosed = parseOptionalBoolean(filters.isClosed, 'isClosed');
      if (isClosed !== null) {
        where.push('is_closed = ?');
        params.push(isClosed);
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const [countRows] = await db.pool.execute(
        `SELECT COUNT(*) AS total FROM gl_periods ${whereClause}`,
        params
      );

      const page = Number.parseInt(filters.page, 10);
      const limit = Number.parseInt(filters.limit || filters.pageSize, 10);
      const shouldPaginate = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
      const safeLimit = shouldPaginate ? Math.min(limit, 500) : null;
      const offset = shouldPaginate ? (page - 1) * safeLimit : null;

      let query = `SELECT *, is_closed FROM gl_periods ${whereClause} ORDER BY fiscal_year DESC, start_date DESC`;
      if (shouldPaginate) {
        query += ` LIMIT ${safeLimit} OFFSET ${offset}`;
      }

      const [periods] = await db.pool.query(query, params);
      return {
        periods,
        total: Number(countRows[0]?.total || 0),
        page: shouldPaginate ? page : 1,
        pageSize: shouldPaginate ? safeLimit : periods.length,
      };
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
      const [overlaps] = await db.pool.execute(
        `SELECT id FROM gl_periods
         WHERE start_date <= ? AND end_date >= ?
         LIMIT 1`,
        [periodData.end_date, periodData.start_date]
      );

      if (overlaps.length > 0) {
        throw new Error('Accounting period date range overlaps an existing period');
      }

      const [result] = await db.pool.execute(
        'INSERT INTO gl_periods (period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year) VALUES (?, ?, ?, ?, ?, ?)',
        [
          periodData.period_name,
          periodData.start_date,
          periodData.end_date,
          0,
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
  /**
   * Update an open accounting period.
   */
  updatePeriod: async (id, periodData) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [periods] = await connection.execute(
        'SELECT id, is_closed FROM gl_periods WHERE id = ? FOR UPDATE',
        [id]
      );

      if (periods.length === 0) {
        throw new Error('Accounting period not found');
      }

      if (periods[0].is_closed) {
        throw new Error('Closed accounting periods cannot be edited');
      }

      const [overlaps] = await connection.execute(
        `SELECT id FROM gl_periods
         WHERE id <> ? AND start_date <= ? AND end_date >= ?
         LIMIT 1`,
        [id, periodData.end_date, periodData.start_date]
      );

      if (overlaps.length > 0) {
        throw new Error('Accounting period date range overlaps an existing period');
      }

      const [result] = await connection.execute(
        `UPDATE gl_periods SET
          period_name = ?,
          start_date = ?,
          end_date = ?,
          is_adjusting = ?,
          fiscal_year = ?
         WHERE id = ?`,
        [
          periodData.period_name,
          periodData.start_date,
          periodData.end_date,
          periodData.is_adjusting ? 1 : 0,
          periodData.fiscal_year,
          id,
        ]
      );

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('Update accounting period failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  closePeriod: async (id) => {
    try {
      const PeriodEndService = require('../services/business/PeriodEndService');
      const result = await PeriodEndService.closePeriod({
        period_id: Number.parseInt(id, 10),
        closed_by: 'system',
        closing_date: new Date().toISOString().slice(0, 10),
      });
      return Boolean(result?.periodId);
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
      const PeriodEndService = require('../services/business/PeriodEndService');
      const result = await PeriodEndService.reopenPeriod({
        period_id: Number.parseInt(id, 10),
        reopened_by: 'system',
      });
      return Boolean(result?.periodId);
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
  // 注意：期末结转的实际执行由 PeriodEndService.closePeriod() 负责
  // 以下仅保留结转历史查询方法


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
