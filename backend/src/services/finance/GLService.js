/**
 * GLService.js
 * @description 总账服务 - 提供GL分录相关的业务逻辑
 * @date 2025-12-27
 * @version 1.0.0
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');
const crypto = require('crypto');
const { financeConfig } = require('../../config/financeConfig');
const {
  currentDateString,
  normalizeDateInput,
  isClosedFlag,
  isDateWithinPeriod,
} = require('../../models/finance/helpers');

function shouldPostEntry(entryData) {
  return (
    entryData.status === 'posted' ||
    entryData.is_posted === true ||
    entryData.is_posted === 1 ||
    entryData.is_posted === '1'
  );
}

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
        SELECT id, period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods
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
          logger.warn(
            `检测到死锁，准备重试 (剩余 ${retries - 1} 次) - 单据: ${entryData.document_number || '未知'}...`
          );
          retries--;
          await new Promise((resolve) => setTimeout(resolve, crypto.randomInt(100, 301)));
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

    const defaultDate = currentDateString();
    const entryDate = normalizeDateInput(entryData.entry_date || defaultDate, 'entry_date');
    const postingDate = normalizeDateInput(
      entryData.posting_date || entryData.entry_date || defaultDate,
      'posting_date'
    );

    const lengthLimits = [
      ['entry_number', entryData.entry_number, 50],
      ['document_type', entryData.document_type, 50],
      ['document_number', entryData.document_number, 50],
      ['voucher_word', entryData.voucher_word, 10],
    ];

    for (const [fieldName, value, maxLength] of lengthLimits) {
      if (value !== null && value !== undefined && String(value).length > maxLength) {
        throw new Error(`${fieldName}长度不能超过${maxLength}个字符`);
      }
    }

    const conn = connection || (await db.pool.getConnection());
    const shouldManageTransaction = !connection;

    try {
      if (shouldManageTransaction) {
        await conn.beginTransaction();
      }

      // 2. 分录明细校验与借贷平衡校验 (精确到分)
      const normalizedItems = items.map((item, index) => {
        const accountId = Number.parseInt(item.account_id, 10);
        if (!Number.isInteger(accountId) || accountId <= 0) {
          throw new Error(`第${index + 1}行分录科目不能为空`);
        }

        const debitCents = Math.round((parseFloat(item.debit_amount) || 0) * 100);
        const creditCents = Math.round((parseFloat(item.credit_amount) || 0) * 100);
        if (debitCents < 0 || creditCents < 0) {
          throw new Error(`第${index + 1}行借贷金额不能为负数`);
        }
        if (debitCents > 0 && creditCents > 0) {
          throw new Error(`第${index + 1}行不能同时填写借方和贷方金额`);
        }
        if (debitCents === 0 && creditCents === 0) {
          throw new Error(`第${index + 1}行借方和贷方金额不能同时为0`);
        }

        const currencyCode = String(
          item.currency_code || financeConfig.get('invoice.defaultCurrency', 'CNY')
        ).toUpperCase();
        const exchangeRate = Number(item.exchange_rate ?? 1);
        if (currencyCode !== 'CNY') {
          throw new Error(
            `第${index + 1}行币种 ${currencyCode} 暂未启用本位币换算，禁止直接写入总账以免报表错计`
          );
        }
        if (!Number.isFinite(exchangeRate) || exchangeRate <= 0 || Math.abs(exchangeRate - 1) > 0.000001) {
          throw new Error(`第${index + 1}行人民币汇率必须为1`);
        }

        return {
          ...item,
          account_id: accountId,
          debit_amount: debitCents / 100,
          credit_amount: creditCents / 100,
          currency_code: currencyCode,
          exchange_rate: exchangeRate,
        };
      });

      const totalDebit = normalizedItems.reduce(
        (sum, item) => sum + Math.round((parseFloat(item.debit_amount) || 0) * 100),
        0
      );
      const totalCredit = normalizedItems.reduce(
        (sum, item) => sum + Math.round((parseFloat(item.credit_amount) || 0) * 100),
        0
      );

      // 分录入账必须精确借贷平衡。金额已经转为分，不能保留 0.01 的尾差进总账。
      if (totalDebit !== totalCredit) {
        const debit = totalDebit / 100;
        const credit = totalCredit / 100;
        throw new Error(`借贷不平衡: 借方 ${debit.toFixed(2)}, 贷方 ${credit.toFixed(2)}`);
      }

      const accountIds = [...new Set(normalizedItems.map((item) => item.account_id))];

      // 3. 期间状态校验（只读，禁止 FOR UPDATE：长事务+FOR UPDATE 易造成锁等待 50s+）
      let resolvedPeriodId = entryData.period_id || null;
      if (resolvedPeriodId) {
        const [periods] = await conn.execute(
          `SELECT id, is_closed, is_locked, period_name, start_date, end_date, status
           FROM gl_periods
           WHERE id = ?
           LIMIT 1`,
          [resolvedPeriodId]
        );
        if (periods.length === 0) {
          throw new Error('Accounting period not found');
        }
        if (
          !isDateWithinPeriod(entryDate, periods[0]) ||
          !isDateWithinPeriod(postingDate, periods[0])
        ) {
          throw new Error(
            `entry_date ${entryDate} or posting_date ${postingDate} is outside accounting period ${periods[0].period_name}`
          );
        }
        if (
          (Number(periods[0].is_locked) === 1 || periods[0].status === 'locked') &&
          !entryData.allow_closed_period
        ) {
          throw new Error(`不能在已锁定的会计期间 [${periods[0].period_name}] 创建分录`);
        }
        if (isClosedFlag(periods[0].is_closed) && !entryData.allow_closed_period) {
          throw new Error(`不能在已关闭的会计期间 [${periods[0].period_name}] 创建分录`);
        }
      }

      // 4. 按日期解析开放期间（只读）
      if (!resolvedPeriodId && shouldPostEntry(entryData)) {
        const [periods] = await conn.execute(
          `SELECT id, is_closed, is_locked, period_name, start_date, end_date, status
           FROM gl_periods
           WHERE ? BETWEEN start_date AND end_date
             AND ? BETWEEN start_date AND end_date
           ORDER BY start_date DESC
           LIMIT 1`,
          [entryDate, postingDate]
        );

        if (periods.length === 0) {
          throw new Error(
            `Posted entry date ${entryDate} and posting date ${postingDate} must belong to an open accounting period`
          );
        }

        if (
          (Number(periods[0].is_locked) === 1 || periods[0].status === 'locked') &&
          !entryData.allow_closed_period
        ) {
          throw new Error(`不能在已锁定的会计期间 [${periods[0].period_name}] 创建分录`);
        }
        if (isClosedFlag(periods[0].is_closed) && !entryData.allow_closed_period) {
          throw new Error(`不能在已关闭的会计期间 [${periods[0].period_name}] 创建分录`);
        }

        resolvedPeriodId = periods[0].id;
      }

      const { resolveActorUserId } = require('../../utils/userUtils');
      // resolveActorUserId 是 async，必须 await；否则 createdById 为 Promise，写入会异常/挂起
      const createdById = await resolveActorUserId(
        conn,
        entryData.created_by,
        entryData.posted_by
      );
      const isPosted = shouldPostEntry(entryData);
      const postingMethod = entryData.posting_method || (isPosted ? 'automatic' : null);
      const postedBy = entryData.posted_by ? Number.parseInt(entryData.posted_by, 10) || null : null;
      const postedAt = isPosted ? (entryData.posted_at || new Date()) : null;

      const accountPlaceholders = accountIds.map(() => '?').join(',');
      const [activeAccounts] = await conn.query(
        `SELECT id FROM gl_accounts WHERE id IN (${accountPlaceholders}) AND is_active = 1`,
        accountIds
      );
      const activeAccountIds = new Set(activeAccounts.map((account) => Number(account.id)));
      const missingAccountIds = accountIds.filter((accountId) => !activeAccountIds.has(accountId));
      if (missingAccountIds.length > 0) {
        throw new Error(`会计科目不存在或未启用: ${missingAccountIds.join(', ')}`);
      }

      // 5. 凭证字号：禁止对 gl_entries 做 MAX...FOR UPDATE（间隙锁会拖死合并长事务）
      const voucherWord = entryData.voucher_word || '记';
      let voucherNumber = entryData.voucher_number;
      if (!voucherNumber) {
        voucherNumber = await this.nextVoucherNumber(
          conn,
          resolvedPeriodId || 0,
          voucherWord
        );
      }

      // 6. 凭证编号
      const entryNumber = entryData.entry_number
        ? String(entryData.entry_number).trim()
        : await this.generateEntryNumber(conn);
      if (!entryNumber) {
        throw new Error('entry_number不能为空');
      }
      if (entryData.entry_number) {
        const [existingEntries] = await conn.execute(
          'SELECT id FROM gl_entries WHERE entry_number = ? LIMIT 1',
          [entryNumber]
        );
        if (existingEntries.length > 0) {
          throw new Error(`凭证编号已存在: ${entryNumber}`);
        }
      }

      // 7. 插入分录头
      const [result] = await conn.execute(
        `
                INSERT INTO gl_entries
                (entry_number, entry_date, posting_date, period_id, document_type, document_number,
                 description, created_by, transaction_type, transaction_id, voucher_word,
                 voucher_number, status, is_posted, posted_by, posted_at, posting_method, approved_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
        [
          entryNumber,
          entryDate,
          postingDate,
          resolvedPeriodId,
          entryData.document_type || null,
          entryData.document_number || null,
          entryData.description || null,
          createdById,
          entryData.transaction_type || entryData.document_type || null,
          entryData.transaction_id || null,
          voucherWord,
          voucherNumber,
          isPosted ? 'posted' : (entryData.status || 'draft'),
          isPosted ? 1 : 0,
          postedBy,
          postedAt,
          postingMethod,
          entryData.approved_at || null,
        ]
      );

      const entryId = result.insertId;

      // 8. 批量插入分录明细（1次SQL替代N次）
      const itemValues = normalizedItems.map((item, index) => [
        entryId,
        index + 1,
        item.account_id,
        item.debit_amount || 0,
        item.credit_amount || 0,
        item.currency_code,
        item.exchange_rate,
        item.cost_center_id || null,
        item.project_id || null,
        item.customer_id || null,
        item.supplier_id || null,
        item.employee_id || null,
        item.description || null,
      ]);
      await conn.query(
        `INSERT INTO gl_entry_items
         (entry_id, line_number, account_id, debit_amount, credit_amount, currency_code, exchange_rate, cost_center_id, project_id, customer_id, supplier_id, employee_id, description)
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
   * 读出现有最大凭证字号（无锁），作为序列下限，避免与历史数据冲突
   */
  static async peekMaxVoucherNumber(connection, periodId, voucherWord) {
    const [rows] = await connection.execute(
      `SELECT MAX(voucher_number) AS max_num FROM gl_entries
       WHERE period_id = ? AND voucher_word = ?`,
      [periodId || 0, voucherWord || '记']
    );
    return Number(rows[0]?.max_num) || 0;
  }

  /**
   * 读出当日最大 JE 序号（无锁）
   */
  static async peekMaxEntrySeq(connection, prefix) {
    const [rows] = await connection.execute(
      `SELECT entry_number FROM gl_entries
       WHERE entry_number LIKE ?
       ORDER BY entry_number DESC LIMIT 1`,
      [`${prefix}%`]
    );
    if (!rows.length) return 0;
    const lastNum = parseInt(String(rows[0].entry_number).substring(prefix.length), 10);
    return Number.isNaN(lastNum) ? 0 : lastNum;
  }

  /**
   * 期间+凭证字 下一凭证号（无表级 FOR UPDATE）
   * coding_sequences 原子自增，并用 gl_entries 现有 MAX 作下限，防重复
   */
  static async nextVoucherNumber(connection, periodId, voucherWord) {
    const word = voucherWord || '记';
    const floor = await this.peekMaxVoucherNumber(connection, periodId, word);
    const periodKey = `P${periodId || 0}:${word}`.slice(0, 20);
    try {
      const [res] = await connection.query(
        `INSERT INTO coding_sequences (business_type, period_key, current_value)
         VALUES ('gl_voucher_no', ?, ?)
         ON DUPLICATE KEY UPDATE current_value = LAST_INSERT_ID(GREATEST(current_value, ?) + 1)`,
        [periodKey, floor + 1, floor]
      );
      if (res.affectedRows === 1) return floor + 1;
      const [[seq]] = await connection.query('SELECT LAST_INSERT_ID() AS current_value');
      return Number(seq.current_value) || floor + 1;
    } catch {
      return floor + 1;
    }
  }

  /**
   * 生成分录技术编号 (内部唯一标识)
   * 格式: JE + 日期(YYYYMMDD) + 4位递增序号
   * coding_sequences 原子自增 + 现有 MAX 作下限，避免 FOR UPDATE 与重复号
   */
  static async generateEntryNumber(connection) {
    const dateStr = currentDateString().replace(/-/g, '');
    const prefix = `JE${dateStr}`;
    const periodKey = dateStr;
    const floor = await this.peekMaxEntrySeq(connection, prefix);

    try {
      const [res] = await connection.query(
        `INSERT INTO coding_sequences (business_type, period_key, current_value)
         VALUES ('gl_entry_number', ?, ?)
         ON DUPLICATE KEY UPDATE current_value = LAST_INSERT_ID(GREATEST(current_value, ?) + 1)`,
        [periodKey, floor + 1, floor]
      );
      let seq;
      if (res.affectedRows === 1) {
        seq = floor + 1;
      } else {
        const [[row]] = await connection.query('SELECT LAST_INSERT_ID() AS current_value');
        seq = Number(row.current_value) || floor + 1;
      }
      return `${prefix}${String(seq).padStart(4, '0')}`;
    } catch {
      return `${prefix}${String(floor + 1).padStart(4, '0')}`;
    }
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
