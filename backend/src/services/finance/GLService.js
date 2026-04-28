/**
 * GLService.js
 * @description 总账服务 - 提供GL分录相关的业务逻辑
 * @date 2025-12-27
 * @version 1.0.0
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');

/**
 * 总账服务类
 */
class GLService {
  /**
   * 获取当前会计期间
   * @returns {Promise<Object|null>} 当前期间
   */
  static async getCurrentPeriod() {
    try {
      const [periods] = await db.pool.execute(`
        SELECT * FROM gl_periods 
        WHERE is_closed = 0 
        ORDER BY end_date DESC 
        LIMIT 1
      `);
      return periods.length > 0 ? periods[0] : null;
    } catch (error) {
      logger.error('获取当前会计期间失败:', error);
      throw error;
    }
  }

  /**
   * 根据日期获取会计期间ID
   * @param {string} date - 日期 (YYYY-MM-DD)
   * @returns {Promise<number|null>} 期间ID
   */
  static async getPeriodIdByDate(date) {
    try {
      const [periods] = await db.pool.execute(
        `
        SELECT id FROM gl_periods 
        WHERE start_date <= ? AND end_date >= ? AND is_closed = 0
        ORDER BY start_date DESC 
        LIMIT 1
      `,
        [date, date]
      );
      return periods.length > 0 ? periods[0].id : null;
    } catch (error) {
      logger.error('根据日期获取期间ID失败:', error);
      throw error;
    }
  }

  /**
   * 根据年月获取会计期间ID
   * @param {number} year - 年份
   * @param {number} month - 月份
   * @returns {Promise<number|null>} 期间ID
   */
  static async getPeriodIdByYearMonth(year, month) {
    try {
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-01`;

      const [periods] = await db.pool.execute(
        `
        SELECT id FROM gl_periods 
        WHERE YEAR(start_date) = ? AND MONTH(start_date) = ?
        LIMIT 1
      `,
        [year, month]
      );

      if (periods.length > 0) {
        return periods[0].id;
      }

      const [altPeriods] = await db.pool.execute(
        `
        SELECT id FROM gl_periods 
        WHERE start_date <= ? AND end_date >= ?
        LIMIT 1
      `,
        [dateStr, dateStr]
      );

      return altPeriods.length > 0 ? altPeriods[0].id : null;
    } catch (error) {
      logger.error('根据年月获取期间ID失败:', error);
      throw error;
    }
  }

  /**
   * 创建会计分录 (专业级实现)
   * 包含: 事务管理、借贷平衡校验、并发锁(FOR UPDATE)、自动编号
   * @param {Object} entryData - 分录数据 (包含: entry_date, posting_date, period_id, voucher_word 等)
   * @param {Array} items - 分录明细
   * @param {Object} connection - 数据库连接（可选，用于事务复用）
   * @returns {Promise<number>} 分录ID
   */
  static async createEntry(entryData, items, connection = null) {
    // 自动重试机制 (最多3次)
    let retries = 3;
    while (retries > 0) {
      try {
        return await this._createEntryInternal(entryData, items, connection);
      } catch (error) {
        // 如果是死锁错误，且还有重试次数，则等待随机时间后重试
        if (error.code === 'ER_LOCK_DEADLOCK' && retries > 1 && !connection) {
          logger.warn(`检测到死锁，准备重试 (剩余 ${retries - 1} 次) - 单据: ${entryData.document_number || '未知'}...`);
          retries--;
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 200 + 100)); // 等待 100-300ms
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * 内部创建会计分录方法
   * @private
   */
  static async _createEntryInternal(entryData, items, connection = null) {
    // 1. 数据完整性基本校验
    if (!items || items.length === 0) {
      throw new Error('分录明细不能为空');
    }

    const conn = connection || (await db.pool.getConnection());
    const shouldManageTransaction = !connection;

    try {
      if (shouldManageTransaction) {
        await conn.beginTransaction();
      }

      // 2. 借贷平衡校验 (精确到分)
      const totalDebit = items.reduce(
        (sum, item) => sum + Math.round((parseFloat(item.debit_amount) || 0) * 100),
        0
      );
      const totalCredit = items.reduce(
        (sum, item) => sum + Math.round((parseFloat(item.credit_amount) || 0) * 100),
        0
      );

      // 允许1分钱以内的误差 (浮点数容错), 但上面已经转为整数了, 所以必须相等
      if (Math.abs(totalDebit - totalCredit) > 1) {
        // > 0.01
        const debit = totalDebit / 100;
        const credit = totalCredit / 100;
        throw new Error(`借贷不平衡: 借方 ${debit.toFixed(2)}, 贷方 ${credit.toFixed(2)}`);
      }

      // 3. 期间状态校验 (不允许在已关闭期间创建分录)
      if (entryData.period_id) {
        const [periods] = await conn.execute(
          'SELECT is_closed, period_name FROM gl_periods WHERE id = ?',
          [entryData.period_id]
        );
        if (periods.length > 0 && periods[0].is_closed === 1) {
          throw new Error(`不能在已关闭的会计期间 [${periods[0].period_name}] 创建分录`);
        }
      }

      // 4. 处理创建人 (标准化为用户ID)
      const { getUserIdByIdentifier } = require('../../utils/userUtils');
      const createdById = await getUserIdByIdentifier(conn, entryData.created_by || 'system');

      // 5. 自动生成凭证字号 (核心并发控制逻辑)
      // 默认凭证字统一为 "记"
      const voucherWord = entryData.voucher_word || '记';
      let voucherNumber = entryData.voucher_number;

      // 如果没有指定凭证号，则自动生成 (使用 FOR UPDATE 锁)
      if (!voucherNumber) {
        // 锁定该期间+凭证字的最大号，防止并发导致跳号或重号
        const [maxVoucher] = await conn.execute(
          `SELECT MAX(voucher_number) as max_num FROM gl_entries 
                     WHERE period_id = ? AND voucher_word = ? FOR UPDATE`,
          [entryData.period_id || 0, voucherWord]
        );
        voucherNumber = (maxVoucher[0].max_num || 0) + 1;
      }

      // 6. 生成技术主键编号 (内部使用)
      const entryNumber = await this.generateEntryNumber(conn);

      // 7. 插入分录头
      const [result] = await conn.execute(
        `
                INSERT INTO gl_entries 
                (entry_number, entry_date, posting_date, period_id, document_type, document_number, description, created_by, transaction_type, voucher_word, voucher_number, status, is_posted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
        [
          entryNumber,
          entryData.entry_date || new Date().toISOString().split('T')[0],
          entryData.posting_date || entryData.entry_date || new Date().toISOString().split('T')[0],
          entryData.period_id,
          entryData.document_type || null,
          entryData.document_number || null,
          entryData.description || null,
          createdById,
          entryData.transaction_type || entryData.document_type || null,
          voucherWord,
          voucherNumber,
          entryData.status || 'draft',
          entryData.is_posted || 0,
        ]
      );

      const entryId = result.insertId;

      // 8. 批量插入分录明细（1次SQL替代N次）
      const itemValues = items.map((item, index) => [
        entryId,
        index + 1,
        item.account_id,
        item.debit_amount || 0,
        item.credit_amount || 0,
        item.currency_code || 'CNY',
        item.exchange_rate || 1,
        item.cost_center_id || null,
        item.description || null,
      ]);
      await conn.query(
        `INSERT INTO gl_entry_items 
         (entry_id, line_number, account_id, debit_amount, credit_amount, currency_code, exchange_rate, cost_center_id, description)
         VALUES ?`,
        [itemValues]
      );

      if (shouldManageTransaction) {
        await conn.commit();
      }

      return entryId;
    } catch (error) {
      if (shouldManageTransaction) {
        await conn.rollback();
      }
      // 区分错误类型日志 - 如果不是死锁 (死锁由外层捕获重试)
      if (error.code === 'ER_DUP_ENTRY') {
        logger.warn(`创建会计分录失败(重复): ${error.message}`);
      } else if (error.code !== 'ER_LOCK_DEADLOCK') {
        logger.error('创建会计分录失败:', error);
      }
      throw error;
    } finally {
      if (shouldManageTransaction && conn) {
        conn.release();
      }
    }
  }

  /**
   * 生成分录技术编号 (内部唯一标识)
   * 格式: JE + 日期(YYYYMMDD) + 4位递增序号
   * 使用 FOR UPDATE 锁保证并发安全，避免编号碰撞
   * @param {Object} connection - 数据库连接（需在事务内调用）
   * @returns {Promise<string>} 分录编号
   */
  static async generateEntryNumber(connection) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `JE${dateStr}`;

    // 使用 FOR UPDATE 锁获取当天最大编号
    const [maxEntry] = await connection.execute(
      `SELECT entry_number FROM gl_entries 
       WHERE entry_number LIKE ? 
       ORDER BY entry_number DESC LIMIT 1 FOR UPDATE`,
      [`${prefix}%`]
    );

    let seq = 1;
    if (maxEntry.length > 0) {
      const lastNum = parseInt(maxEntry[0].entry_number.substring(prefix.length));
      if (!isNaN(lastNum)) {
        seq = lastNum + 1;
      }
    }

    return `${prefix}${seq.toString().padStart(4, '0')}`;
  }

  /**
   * 获取科目ID
   * @param {string} accountCode - 科目编码
   * @returns {Promise<number|null>} 科目ID
   */
  static async getAccountId(accountCode) {
    try {
      const [accounts] = await db.pool.execute(
        'SELECT id FROM gl_accounts WHERE account_code = ?',
        [accountCode]
      );
      return accounts.length > 0 ? accounts[0].id : null;
    } catch (error) {
      logger.error('获取科目ID失败:', error);
      throw error;
    }
  }

  /**
   * 批量获取科目ID
   * @param {Array<string>} accountCodes - 科目编码数组
   * @returns {Promise<Object>} 科目编码到ID的映射
   */
  static async getAccountIds(accountCodes) {
    try {
      if (!accountCodes || accountCodes.length === 0) {
        return {};
      }

      const placeholders = accountCodes.map(() => '?').join(',');
      const [accounts] = await db.pool.execute(
        `SELECT id, account_code FROM gl_accounts WHERE account_code IN (${placeholders})`,
        accountCodes
      );

      const result = {};
      for (const account of accounts) {
        result[account.account_code] = account.id;
      }
      return result;
    } catch (error) {
      logger.error('批量获取科目ID失败:', error);
      throw error;
    }
  }
}

module.exports = GLService;
