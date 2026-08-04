/**
 * finance/entries.js
 * @description 会计分录相关方法
 *              从 models/finance.js L812-1427 提取
 * @date 2026-06-11
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const { financeConfig } = require('../../config/financeConfig');
const { parsePagination } = require('../../utils/safePagination');
const {
  normalizeDateInput,
  isClosedFlag,
  isDateWithinPeriod,
  getEntryPostingDiagnostics,
  assertEntryCanBePosted,
  resolveOpenPeriodForDates,
} = require('./helpers');

// 延迟获取 entriesModel 引用，以解决 reverseEntry 中的自引用
let _self = null;
function getSelf() {
  if (!_self) _self = module.exports;
  return _self;
}

module.exports = {
  /**
   * 创建会计分录（包含明细）
   * 兼容入口，内部统一委托 GLService.createEntry() 执行。
   */
  createEntry: async (entryData, entryItems, connection = null) => {
    const GLService = require('../../services/finance/GLService');
    return await GLService.createEntry(entryData, entryItems, connection);
  },

  /**
   * 按ID获取会计分录（包含明细）
   */
  getEntryById: async (id) => {
    try {
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

      const [items] = await db.pool.execute('SELECT id, entry_id, line_number, account_id, debit_amount, credit_amount, description, cost_center_id, project_id, created_at, updated_at, currency_code, exchange_rate, customer_id, supplier_id, employee_id FROM gl_entry_items WHERE entry_id = ?', [
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
      connection = await db.pool.getConnection();

      const scopeClause = filters.scopeClause || { join: '', where: '', params: [] };

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
          COALESCE(entry_totals.total_debit, 0) as total_debit,
          COALESCE(entry_totals.total_credit, 0) as total_credit
        FROM gl_entries e
        LEFT JOIN gl_periods p ON e.period_id = p.id
        LEFT JOIN users u ON e.created_by = u.id
        LEFT JOIN (
          SELECT
            entry_id,
            SUM(debit_amount) as total_debit,
            SUM(credit_amount) as total_credit
          FROM gl_entry_items
          GROUP BY entry_id
        ) entry_totals ON entry_totals.entry_id = e.id
        ${scopeClause.join || ''}
        WHERE 1=1
      `;
      const params = [];

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

      if (scopeClause.where) {
        query += scopeClause.where;
        params.push(...(scopeClause.params || []));
      }

      const pagination = parsePagination(page, pageSize, {
        defaultPageSize: 20,
        maxPageSize: 100,
      });
      const limit = pagination.limit;
      const offset = pagination.offset;
      query += ` ORDER BY e.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      const [entries] = await connection.execute(query, params);

      let countQuery = `SELECT COUNT(*) as total FROM gl_entries e ${scopeClause.join || ''} WHERE 1=1`;
      const countParams = [];

      if (filters.entry_number) {
        countQuery += ' AND e.entry_number LIKE ?';
        countParams.push(`%${filters.entry_number}%`);
      }

      if (filters.start_date && filters.end_date) {
        countQuery += ' AND e.entry_date BETWEEN ? AND ?';
        countParams.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        countQuery += ' AND e.entry_date >= ?';
        countParams.push(filters.start_date);
      } else if (filters.end_date) {
        countQuery += ' AND e.entry_date <= ?';
        countParams.push(filters.end_date);
      }

      if (filters.document_type) {
        countQuery += ' AND e.document_type = ?';
        countParams.push(filters.document_type);
      }

      if (filters.voucher_word) {
        countQuery += ' AND e.voucher_word = ?';
        countParams.push(filters.voucher_word);
      }

      if (filters.period_id) {
        countQuery += ' AND e.period_id = ?';
        countParams.push(parseInt(filters.period_id));
      }

      if (filters.is_posted !== undefined) {
        countQuery += ' AND e.is_posted = ?';
        countParams.push(filters.is_posted ? 1 : 0);
      }

      if (scopeClause.where) {
        countQuery += scopeClause.where;
        countParams.push(...(scopeClause.params || []));
      }

      const [countResult] = await connection.execute(countQuery, countParams);
      const total = countResult[0].total;

      // 统计与列表同过滤（含 DataScope）
      let statsQuery = `SELECT
        SUM(CASE WHEN e.is_posted = 1 THEN 1 ELSE 0 END) as posted_count,
        SUM(CASE WHEN e.is_posted = 0 THEN 1 ELSE 0 END) as unposted_count,
        COALESCE((SELECT SUM(ei.debit_amount) FROM gl_entry_items ei
          INNER JOIN gl_entries se ON ei.entry_id = se.id WHERE 1=1`;
      const statsParams = [];

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

      statsQuery += `), 0) as total_amount FROM gl_entries e ${scopeClause.join || ''} WHERE 1=1`;

      if (filters.entry_number) {
        statsQuery += ' AND e.entry_number LIKE ?';
        statsParams.push(`%${filters.entry_number}%`);
      }
      if (filters.start_date && filters.end_date) {
        statsQuery += ' AND e.entry_date BETWEEN ? AND ?';
        statsParams.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        statsQuery += ' AND e.entry_date >= ?';
        statsParams.push(filters.start_date);
      } else if (filters.end_date) {
        statsQuery += ' AND e.entry_date <= ?';
        statsParams.push(filters.end_date);
      }
      if (filters.document_type) {
        statsQuery += ' AND e.document_type = ?';
        statsParams.push(filters.document_type);
      }
      if (filters.voucher_word) {
        statsQuery += ' AND e.voucher_word = ?';
        statsParams.push(filters.voucher_word);
      }
      if (filters.period_id) {
        statsQuery += ' AND e.period_id = ?';
        statsParams.push(parseInt(filters.period_id));
      }
      if (filters.is_posted !== undefined) {
        statsQuery += ' AND e.is_posted = ?';
        statsParams.push(filters.is_posted ? 1 : 0);
      }
      if (scopeClause.where) {
        statsQuery += scopeClause.where;
        statsParams.push(...(scopeClause.params || []));
      }

      const [statsResult] = await connection.execute(statsQuery, statsParams);

      const result = {
        entries,
        pagination: {
          total,
          page: pagination.page,
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
      const [items] = await db.pool.execute(
        `
        SELECT
          ei.*,
          a.account_code,
          a.account_name,
          a.is_active AS account_is_active
        FROM
          gl_entry_items ei
        LEFT JOIN
          gl_accounts a ON ei.account_id = a.id
        WHERE
          ei.entry_id = ?
        ORDER BY
          ei.line_number, ei.id
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
   * 获取凭证过账前明细诊断
   */
  getEntryPostingDiagnostics: async (entryIds, connection = null, options = {}) => {
    const normalizedEntryIds = Array.isArray(entryIds) ? entryIds : [entryIds];
    const shouldRelease = !connection;
    const conn = connection || (await db.pool.getConnection());

    try {
      const diagnostics = await getEntryPostingDiagnostics(conn, normalizedEntryIds, options);
      return Object.fromEntries(diagnostics.entries());
    } finally {
      if (shouldRelease) {
        conn.release();
      }
    }
  },

  /**
   * 删除会计分录（仅允许删除未过账且未冲销的凭证）
   */
  deleteEntry: async (id) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [entries] = await connection.execute(
        'SELECT id, is_posted, is_reversed, entry_number FROM gl_entries WHERE id = ? FOR UPDATE',
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
   */
  postEntry: async (id, userId) => {
    const normalizedUserId = Number.parseInt(userId, 10);
    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
      throw new Error('无法识别当前过账用户');
    }
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [entries] = await connection.execute(
        `SELECT e.id, e.is_posted, e.is_reversed, e.entry_date, e.posting_date, e.period_id,
                e.created_by, p.is_closed, p.is_locked, p.period_name, p.start_date, p.end_date
         FROM gl_entries e
         LEFT JOIN gl_periods p ON e.period_id = p.id
         WHERE e.id = ?
         FOR UPDATE`,
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

      if (Number(entry.created_by) === normalizedUserId) {
        throw new Error('制单人与过账人必须分离，不能过账自己创建的凭证');
      }

      const entryDate = normalizeDateInput(entry.entry_date, '记账日期');
      const postingDate = normalizeDateInput(entry.posting_date || entry.entry_date, '过账日期');
      let resolvedPeriodId = entry.period_id;

      if (resolvedPeriodId && isDateWithinPeriod(entryDate, entry) && isDateWithinPeriod(postingDate, entry)) {
        // 凭证日期在所属期间内，直接使用当前期间
      } else {
        const [periods] = await connection.execute(
          `SELECT id, is_closed, is_locked, period_name, start_date, end_date
           FROM gl_periods
           WHERE ? BETWEEN start_date AND end_date
             AND ? BETWEEN start_date AND end_date
           ORDER BY start_date DESC
           LIMIT 1
           FOR UPDATE`,
          [entryDate, postingDate]
        );

        if (periods.length === 0) {
          throw new Error(`凭证日期 ${entryDate} 和过账日期 ${postingDate} 未匹配到会计期间`);
        }

        if (resolvedPeriodId) {
          logger.info(
            `凭证 ${id} 从期间 [${entry.period_name}] 自动重新匹配到期间 [${periods[0].period_name}]`
          );
        }
        resolvedPeriodId = periods[0].id;
        entry.is_closed = periods[0].is_closed;
        entry.is_locked = periods[0].is_locked;
        entry.period_name = periods[0].period_name;
      }

      if (isClosedFlag(entry.is_closed)) {
        throw new Error(`不能在已关闭的会计期间 [${entry.period_name}] 过账凭证`);
      }
      if (Number(entry.is_locked) === 1 || entry.is_locked === true) {
        throw new Error(`不能在已锁定的会计期间 [${entry.period_name}] 过账凭证`);
      }

      await assertEntryCanBePosted(connection, id);

      const [result] = await connection.execute(
        `UPDATE gl_entries
            SET is_posted = 1,
                status = 'posted',
                period_id = ?,
                approved_by = ?,
                approved_at = NOW(),
                posted_by = ?,
                posted_at = NOW(),
                posting_method = 'manual'
          WHERE id = ? AND COALESCE(is_posted, 0) = 0`,
        [resolvedPeriodId, String(normalizedUserId), normalizedUserId, id]
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
   * @param {number} id 原凭证 ID
   * @param {Object} reversalData 冲销参数
   * @param {Object|null} connection 可选：复用外层事务连接
   */
  reverseEntry: async (id, reversalData, connection = null) => {
    const shouldManageTransaction = !connection;
    const conn = connection || (await db.pool.getConnection());

    try {
      if (shouldManageTransaction) {
        await conn.beginTransaction();
      }

      const [entries] = await conn.execute(
        'SELECT id, entry_number, entry_date, posting_date, document_type, document_number, active_document_number, period_id, is_posted, is_reversed, reversal_entry_id, description, created_by, approved_by, created_at, updated_at, voucher_word, voucher_number, status, transaction_type, transaction_id FROM gl_entries WHERE id = ? FOR UPDATE',
        [id]
      );
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

      const [sourceEntries] = await conn.execute(
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
        conn,
        reversalData.period_id,
        entryDate,
        postingDate
      );

      const [items] = await conn.execute(
        'SELECT id, entry_id, line_number, account_id, debit_amount, credit_amount, description, cost_center_id, project_id, created_at, updated_at, currency_code, exchange_rate, customer_id, supplier_id, employee_id FROM gl_entry_items WHERE entry_id = ? FOR UPDATE',
        [id]
      );

      if (items.length === 0) {
        throw new Error('原凭证没有明细，不能冲销');
      }

      const voucherWord = originalEntry.voucher_word || '记';

      const originalDocumentNumber = originalEntry.document_number || originalEntry.entry_number;
      const documentBase = `R-${originalDocumentNumber}`;
      let reversalDocumentNumber = documentBase.slice(0, 50);

      for (let suffix = 2; suffix <= 100; suffix++) {
        const [existingDocuments] = await conn.execute(
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

      const { resolveActorUserId } = require('../../utils/userUtils');
      const actorId = await resolveActorUserId(
        conn,
        reversalData.created_by,
        originalEntry.created_by
      );

      const reversalEntryId = await getSelf().createEntry(
        {
          entry_date: entryDate,
          posting_date: postingDate,
          document_type: originalEntry.document_type,
          document_number: reversalDocumentNumber,
          period_id: reversalPeriod.id,
          description: `冲销分录 ${originalEntry.entry_number}: ${reversalData.description || ''}`,
          created_by: actorId,
          voucher_word: voucherWord,
          status: 'posted',
          is_posted: 1,
        },
        items.map((item) => ({
          account_id: item.account_id,
          debit_amount: item.credit_amount,
          credit_amount: item.debit_amount,
          currency_code: item.currency_code || financeConfig.get('invoice.defaultCurrency', 'CNY'),
          exchange_rate: item.exchange_rate || 1,
          cost_center_id: item.cost_center_id,
          project_id: item.project_id,
          customer_id: item.customer_id,
          supplier_id: item.supplier_id,
          employee_id: item.employee_id,
          description: `冲销明细: ${item.description || ''}`,
        })),
        conn
      );

      await conn.execute(
        "UPDATE gl_entries SET is_reversed = true, reversal_entry_id = ?, status = 'reversed' WHERE id = ?",
        [reversalEntryId, id]
      );

      if (shouldManageTransaction) {
        await conn.commit();
      }
      return reversalEntryId;
    } catch (error) {
      if (shouldManageTransaction) {
        await conn.rollback();
      }
      logger.error('冲销会计分录失败:', error);
      throw error;
    } finally {
      if (shouldManageTransaction) {
        conn.release();
      }
    }
  },
};
