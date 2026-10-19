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
const BusinessError = require('../../utils/BusinessError');
const { sumMoney } = require('../../utils/money');
const {
  assertManualAccountCurrency,
  isManualVoucherSource,
} = require('../../utils/finance/manualAccountCurrency');
const {
  normalizeDateInput,
  isClosedFlag,
  isDateWithinPeriod,
  getEntryPostingDiagnostics,
  resolveOpenPeriodForDates,
} = require('./helpers');

// 延迟获取 entriesModel 引用，以解决 reverseEntry 中的自引用
let _self = null;
function getSelf() {
  if (!_self) _self = module.exports;
  return _self;
}

function entryListFilter(filters) {
  const scope = filters.scopeClause || { join: '', where: '', params: [] };
  const conditions = ['1=1'];
  const params = [];
  if (filters.entry_number) {
    conditions.push('e.entry_number LIKE ?');
    params.push(`%${filters.entry_number}%`);
  }
  if (filters.search) {
    // Match the number shown by toGlEntryApi as well as the technical ID and summary.
    conditions.push(`(e.entry_number LIKE ? OR
      (CASE WHEN e.voucher_word <> '' AND e.voucher_number <> 0
        THEN CONCAT(e.voucher_word, '-', e.voucher_number)
        ELSE e.entry_number END) LIKE ? OR e.description LIKE ?)`);
    const keyword = `%${filters.search}%`;
    params.push(keyword, keyword, keyword);
  }
  if (filters.start_date && filters.end_date) {
    conditions.push('e.entry_date BETWEEN ? AND ?');
    params.push(filters.start_date, filters.end_date);
  } else if (filters.start_date) {
    conditions.push('e.entry_date >= ?');
    params.push(filters.start_date);
  } else if (filters.end_date) {
    conditions.push('e.entry_date <= ?');
    params.push(filters.end_date);
  }
  for (const key of ['document_type', 'voucher_word']) {
    if (filters[key]) {
      conditions.push(`e.${key} = ?`);
      params.push(filters[key]);
    }
  }
  if (filters.period_id) {
    conditions.push('e.period_id = ?');
    params.push(parseInt(filters.period_id));
  }
  if (filters.is_posted !== undefined) {
    conditions.push('e.is_posted = ?');
    params.push(filters.is_posted ? 1 : 0);
  }
  if (scope.where) params.push(...(scope.params || []));
  return {
    join: scope.join || '',
    where: `WHERE ${conditions.join(' AND ')}${scope.where || ''}`,
    params,
  };
}

function entryItemsQuery(placeholders) {
  return `
    SELECT ei.*,
           a.account_code,
           a.account_name,
           a.is_active AS account_is_active,
           cc.name AS cost_center_name,
           COALESCE(ei.department_id, cc.department_id) AS department_id,
           d.name AS department_name,
           c.name AS customer_name,
           s.name AS supplier_name,
           CASE WHEN ei.employee_source = 'user' THEN COALESCE(NULLIF(employee.real_name, ''), employee.username)
                WHEN ei.employee_source = 'hr' THEN hr_employee.name
                ELSE NULL END AS employee_name
      FROM gl_entry_items ei
      LEFT JOIN gl_accounts a ON ei.account_id = a.id
      LEFT JOIN cost_centers cc ON ei.cost_center_id = cc.id
      LEFT JOIN departments d ON COALESCE(ei.department_id, cc.department_id) = d.id
      LEFT JOIN customers c ON ei.customer_id = c.id
      LEFT JOIN suppliers s ON ei.supplier_id = s.id
      LEFT JOIN users employee ON ei.employee_source = 'user' AND ei.employee_id = employee.id
      LEFT JOIN hr_employees hr_employee ON ei.employee_source = 'hr' AND ei.employee_id = hr_employee.id
     WHERE ei.entry_id IN (${placeholders})
     ORDER BY ei.entry_id, ei.line_number, ei.id
  `;
}

module.exports = {
  /**
   * 创建会计分录（包含明细）
   * 兼容入口，内部统一委托 GLService.createEntry() 执行。
   */
  createEntry: async (entryData, entryItems, connection = null, options = {}) => {
    const GLService = require('../../services/finance/GLService');
    return await GLService.createEntry(entryData, entryItems, connection, options);
  },

  /**
   * 按ID获取会计分录（包含明细）
   */
  getEntryById: async (id) => {
    try {
      const [entries] = await db.pool.execute(
        `SELECT
          e.*,
          p.period_name,
          p.fiscal_year,
          creator.real_name AS creator_name,
          creator.username AS creator_username,
          approver.real_name AS approver_name,
          approver.username AS approver_username,
          poster.real_name AS poster_name,
          poster.username AS poster_username,
          (EXISTS(SELECT 1 FROM document_links link
             WHERE link.target_type = 'finance_voucher' AND link.target_id = e.id)
           OR EXISTS(SELECT 1 FROM document_links link
             WHERE link.source_type = 'finance_voucher' AND link.source_id = e.id)) AS has_business_links,
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
         LEFT JOIN gl_periods p ON e.period_id = p.id
         LEFT JOIN users creator ON e.created_by = creator.id
         LEFT JOIN users approver ON approver.id = CASE
           WHEN e.approved_by REGEXP '^[0-9]+$' THEN CAST(e.approved_by AS UNSIGNED)
           ELSE NULL END
         LEFT JOIN users poster ON poster.id = e.posted_by
         WHERE e.id = ?
         LIMIT 1`,
        [id]
      );
      if (entries.length === 0) return null;

      const entry = entries[0];

      const [items] = await db.pool.execute(entryItemsQuery('?'), [id]);
      entry.items = items;
      entry.total_debit = sumMoney(items.map((item) => item.debit_amount));
      entry.total_credit = sumMoney(items.map((item) => item.credit_amount));

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
      const filter = entryListFilter(filters);
      const pagination = parsePagination(page, pageSize, {
        defaultPageSize: 20,
        maxPageSize: 100,
      });
      const limit = pagination.limit;
      const offset = pagination.offset;

      // Page the headers before reading voucher lines or reverse-entry metadata.
      const [entries] = await connection.execute(
        `
        SELECT
          e.*,
          p.period_name,
          p.fiscal_year,
          u.real_name as creator_name,
          u.username as creator_username
        FROM gl_entries e
        LEFT JOIN gl_periods p ON e.period_id = p.id
        LEFT JOIN users u ON e.created_by = u.id
        ${filter.join}
        ${filter.where}
        ORDER BY e.created_at DESC, e.id DESC LIMIT ${limit} OFFSET ${offset}
      `,
        filter.params
      );

      if (entries.length) {
        const ids = entries.map((entry) => entry.id);
        const placeholders = ids.map(() => '?').join(',');
        const [details] = await connection.execute(
          `
          SELECT page.id,
                 COALESCE(amounts.total_debit, 0) AS total_debit,
                 COALESCE(amounts.total_credit, 0) AS total_credit,
                 CASE WHEN reversal.source_id IS NULL THEN 0 ELSE 1 END AS is_reversal_entry,
                 reversal.source_id AS reversal_of_entry_id,
                 approver.real_name AS approver_name,
                 approver.username AS approver_username,
                 poster.real_name AS poster_name,
                 poster.username AS poster_username,
                 (EXISTS(SELECT 1 FROM document_links link
                    WHERE link.target_type = 'finance_voucher' AND link.target_id = page.id)
                  OR EXISTS(SELECT 1 FROM document_links link
                    WHERE link.source_type = 'finance_voucher' AND link.source_id = page.id)) AS has_business_links
            FROM gl_entries page
            LEFT JOIN users approver ON approver.id = CASE
              WHEN page.approved_by REGEXP '^[0-9]+$'
              THEN CAST(page.approved_by AS UNSIGNED)
              ELSE NULL
            END
            LEFT JOIN users poster ON poster.id = page.posted_by
            LEFT JOIN (
              SELECT entry_id, SUM(debit_amount) AS total_debit, SUM(credit_amount) AS total_credit
                FROM gl_entry_items
               WHERE entry_id IN (${placeholders})
               GROUP BY entry_id
            ) amounts ON amounts.entry_id = page.id
            LEFT JOIN (
              SELECT reversal_entry_id, MIN(id) AS source_id
                FROM gl_entries
               WHERE reversal_entry_id IN (${placeholders})
               GROUP BY reversal_entry_id
            ) reversal ON reversal.reversal_entry_id = page.id
           WHERE page.id IN (${placeholders})
        `,
          [...ids, ...ids, ...ids]
        );
        const byId = new Map(details.map((detail) => [Number(detail.id), detail]));
        for (const entry of entries) {
          const detail = byId.get(Number(entry.id));
          entry.total_debit = detail?.total_debit ?? 0;
          entry.total_credit = detail?.total_credit ?? 0;
          entry.is_reversal_entry = detail?.is_reversal_entry ?? 0;
          entry.reversal_of_entry_id = detail?.reversal_of_entry_id ?? null;
          entry.approver_name = detail?.approver_name ?? null;
          entry.approver_username = detail?.approver_username ?? null;
          entry.poster_name = detail?.poster_name ?? null;
          entry.poster_username = detail?.poster_username ?? null;
          entry.has_business_links = detail?.has_business_links ?? 0;
        }

        if (filters.include_items === true) {
          // Reuse the already scoped page IDs; never fan out one request per voucher.
          const [items] = await connection.execute(entryItemsQuery(placeholders), ids);
          const itemsByEntry = new Map(entries.map((entry) => [Number(entry.id), []]));
          for (const item of items) {
            itemsByEntry.get(Number(item.entry_id))?.push(item);
          }
          for (const entry of entries) {
            entry.items = itemsByEntry.get(Number(entry.id));
          }
        }
      }

      // Counts and amount share the exact list filters and scope. Count headers
      // once even when a voucher has many lines; totals cover every matching page.
      const [statsResult] = await connection.execute(
        `
        SELECT COUNT(DISTINCT e.id) AS total,
               COUNT(DISTINCT CASE WHEN e.is_posted = 1 THEN e.id END) AS posted_count,
               COUNT(DISTINCT CASE WHEN e.is_posted = 0 THEN e.id END) AS unposted_count,
               COALESCE(SUM(ei.debit_amount), 0) AS total_amount
          FROM gl_entries e
          ${filter.join}
          LEFT JOIN gl_entry_items ei ON ei.entry_id = e.id
          ${filter.where}
      `,
        filter.params
      );
      const total = Number(statsResult[0].total) || 0;

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
      const [items] = await db.pool.execute(entryItemsQuery('?'), [entryId]);

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
      throw new BusinessError('无法识别当前过账用户');
    }
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [entries] = await connection.execute(
        `SELECT e.id, e.is_posted, e.is_reversed, e.entry_date, e.posting_date, e.period_id,
                e.created_by, e.document_type, e.transaction_type, e.transaction_id, e.posting_method,
                (EXISTS(SELECT 1 FROM document_links link WHERE link.source_type = 'finance_voucher' AND link.source_id = e.id)
                 OR EXISTS(SELECT 1 FROM document_links link WHERE link.target_type = 'finance_voucher' AND link.target_id = e.id)) AS has_business_links,
                p.is_closed, p.is_locked, p.period_name, p.start_date, p.end_date
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
        throw new BusinessError('凭证已过账，无需重复操作', null, 'INVALID_STATUS', 409);
      }

      if (entry.is_reversed) {
        throw new BusinessError('已冲销的凭证不能过账', null, 'INVALID_STATUS', 409);
      }

      if (Number(entry.created_by) === normalizedUserId) {
        throw new BusinessError(
          '制单人与过账人必须分离，不能过账自己创建的凭证',
          null,
          'SEPARATION_OF_DUTIES',
          403
        );
      }

      const entryDate = normalizeDateInput(entry.entry_date, '记账日期');
      const postingDate = normalizeDateInput(entry.posting_date || entry.entry_date, '过账日期');
      let resolvedPeriodId = entry.period_id;

      if (
        resolvedPeriodId &&
        isDateWithinPeriod(entryDate, entry) &&
        isDateWithinPeriod(postingDate, entry)
      ) {
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
          throw new BusinessError(
            `凭证日期 ${entryDate} 和过账日期 ${postingDate} 未匹配到会计期间`
          );
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
        throw new BusinessError(`不能在已关闭的会计期间 [${entry.period_name}] 过账凭证`);
      }
      if (Number(entry.is_locked) === 1 || entry.is_locked === true) {
        throw new BusinessError(`不能在已锁定的会计期间 [${entry.period_name}] 过账凭证`);
      }

      // Re-read the stored voucher under the posting lock. Draft-time checks
      // cannot establish that its currency evidence and masters are still valid.
      const [storedItems] = await connection.execute(
        `SELECT ei.*, a.id AS active_account_id, a.account_code, a.currency_code AS account_currency_code,
                a.has_customer, a.has_supplier, a.has_employee, a.has_department, a.has_project
         FROM gl_entry_items ei
         LEFT JOIN gl_accounts a ON a.id = ei.account_id AND a.is_active = 1
         WHERE ei.entry_id = ?
         ORDER BY ei.line_number, ei.id
         FOR UPDATE`,
        [id]
      );
      if (storedItems.some((item) => !item.active_account_id)) {
        throw new BusinessError('会计科目不存在或未启用，请修复凭证后再过账');
      }
      const {
        normalizeEntryItems,
        assertEntryAuxiliaries,
      } = require('../../utils/finance/entryDataIntegrity');
      const normalizedItems = normalizeEntryItems(storedItems, {
        // Only a trusted source document can have saved this explicit residual;
        // the HTTP entry endpoint cannot enable that write option.
        allowFxRoundingAdjustment: true,
      });
      const accounts = storedItems.map((item) => ({
        ...item,
        id: item.account_id,
        currency_code: item.account_currency_code,
      }));
      if (isManualVoucherSource(entry)) assertManualAccountCurrency(normalizedItems, accounts);
      await assertEntryAuxiliaries(connection, normalizedItems, accounts);

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

      const [entries] = await conn.execute('SELECT * FROM gl_entries WHERE id = ? FOR UPDATE', [
        id,
      ]);
      if (entries.length === 0) {
        throw new Error('找不到要冲销的分录');
      }

      const originalEntry = entries[0];

      // HTTP 总账红冲仅处理手工凭证。业务凭证须由原业务撤销流程同步子账和库存。
      // 在行锁内检查，避免读到旧来源后绕过业务闭环。
      if (reversalData.requireManualSource) {
        const manualTypes = [null, undefined, '', 'manual', 'manual_entry', '手工凭证', '记账凭证'];
        if (
          !manualTypes.includes(originalEntry.document_type) ||
          originalEntry.transaction_id ||
          !manualTypes.includes(originalEntry.transaction_type)
        ) {
          throw new BusinessError(
            '业务或结转凭证不能从总账直接冲销，请通过原业务撤销或期间反结账流程处理'
          );
        }
        const [businessLinks] = await conn.execute(
          `SELECT id FROM document_links
           WHERE (target_type = 'finance_voucher' AND target_id = ?)
              OR (source_type = 'finance_voucher' AND source_id = ?)
           LIMIT 1 FOR UPDATE`,
          [id, id]
        );
        if (businessLinks.length > 0) {
          throw new BusinessError('该凭证已关联业务单据，请通过原业务撤销流程处理');
        }
      }

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
        'SELECT * FROM gl_entry_items WHERE entry_id = ? ORDER BY line_number, id FOR UPDATE',
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
          attachment_count: originalEntry.attachment_count,
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
          employee_source: item.employee_source,
          department_id: item.department_id,
          project_name: item.project_name,
          quantity: item.quantity,
          unit_name: item.unit_name,
          unit_price: item.unit_price,
          foreign_amount: item.foreign_amount,
          base_rounding_adjustment: item.base_rounding_adjustment,
          settlement_method: item.settlement_method,
          invoice_number: item.invoice_number,
          description: `冲销明细: ${item.description || ''}`,
        })),
        conn,
        { allowHistoricalAuxiliaries: true, allowFxRoundingAdjustment: true }
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
