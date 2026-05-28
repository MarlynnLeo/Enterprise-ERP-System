/**
 * InventoryYearEndService.js
 * @description 仓库年度结存服务
 * @date 2025-12-08
 * @version 1.0.0
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');

/**
 * 仓库年度结存服务
 * 处理年末库存结存、期初余额设置等功能
 */
class InventoryYearEndService {
  static normalizeYear(year) {
    const parsed = parseInt(year, 10);
    if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 9999) {
      throw new Error('会计年度无效');
    }
    return parsed;
  }

  static async calculateYearEndRows(connection, year) {
    const closingYear = this.normalizeYear(year);
    const prevYear = closingYear - 1;
    const yearStart = `${closingYear}-01-01`;
    const yearEnd = `${closingYear}-12-31`;

    const [rows] = await connection.execute(
      `
      WITH prev_frozen AS (
        SELECT material_id, location_id, closing_quantity, closing_value
        FROM inventory_year_end_balances
        WHERE year = ? AND is_frozen = 1
      ),
      prior_ledger AS (
        SELECT
          il.material_id,
          il.location_id,
          SUM(il.quantity) as opening_qty,
          SUM(
            CASE
              WHEN il.quantity >= 0 THEN COALESCE(NULLIF(il.total_value, 0), il.quantity * COALESCE(NULLIF(il.unit_cost, 0), m.cost_price, 0), 0)
              ELSE -COALESCE(NULLIF(il.total_value, 0), ABS(il.quantity) * COALESCE(NULLIF(il.unit_cost, 0), m.cost_price, 0), 0)
            END
          ) as opening_value
        FROM inventory_ledger il
        LEFT JOIN materials m ON il.material_id = m.id
        WHERE COALESCE(il.transaction_date, DATE(il.created_at)) < ?
        GROUP BY il.material_id, il.location_id
      ),
      current_ledger AS (
        SELECT
          il.material_id,
          il.location_id,
          SUM(CASE WHEN il.quantity > 0 THEN il.quantity ELSE 0 END) as inbound_qty,
          SUM(CASE WHEN il.quantity < 0 THEN ABS(il.quantity) ELSE 0 END) as outbound_qty,
          SUM(CASE WHEN il.quantity > 0 THEN COALESCE(NULLIF(il.total_value, 0), il.quantity * COALESCE(NULLIF(il.unit_cost, 0), m.cost_price, 0), 0) ELSE 0 END) as inbound_value,
          SUM(CASE WHEN il.quantity < 0 THEN COALESCE(NULLIF(il.total_value, 0), ABS(il.quantity) * COALESCE(NULLIF(il.unit_cost, 0), m.cost_price, 0), 0) ELSE 0 END) as outbound_value
        FROM inventory_ledger il
        LEFT JOIN materials m ON il.material_id = m.id
        WHERE COALESCE(il.transaction_date, DATE(il.created_at)) BETWEEN ? AND ?
        GROUP BY il.material_id, il.location_id
      ),
      balance_keys AS (
        SELECT material_id, location_id FROM prev_frozen
        UNION
        SELECT material_id, location_id FROM prior_ledger WHERE ABS(opening_qty) > 0.0001
        UNION
        SELECT material_id, location_id FROM current_ledger
      )
      SELECT
        k.material_id,
        k.location_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        u.name as unit_name,
        l.name as location_name,
        COALESCE(pf.closing_quantity, pl.opening_qty, 0) as opening_qty,
        COALESCE(pf.closing_value, pl.opening_value, 0) as opening_value,
        COALESCE(cl.inbound_qty, 0) as inbound_qty,
        COALESCE(cl.inbound_value, 0) as inbound_value,
        COALESCE(cl.outbound_qty, 0) as outbound_qty,
        COALESCE(cl.outbound_value, 0) as outbound_value
      FROM balance_keys k
      LEFT JOIN prev_frozen pf
        ON pf.material_id = k.material_id AND pf.location_id = k.location_id
      LEFT JOIN prior_ledger pl
        ON pl.material_id = k.material_id AND pl.location_id = k.location_id
      LEFT JOIN current_ledger cl
        ON cl.material_id = k.material_id AND cl.location_id = k.location_id
      LEFT JOIN materials m ON k.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN locations l ON k.location_id = l.id
      ORDER BY m.code, l.name
    `,
      [prevYear, yearStart, yearStart, yearEnd]
    );

    return rows.map((row) => {
      const openingQuantity = parseFloat(row.opening_qty) || 0;
      const openingValue = parseFloat(row.opening_value) || 0;
      const inboundQuantity = parseFloat(row.inbound_qty) || 0;
      const inboundValue = parseFloat(row.inbound_value) || 0;
      const outboundQuantity = parseFloat(row.outbound_qty) || 0;
      const outboundValue = parseFloat(row.outbound_value) || 0;

      return {
        ...row,
        openingQuantity,
        openingValue,
        inboundQuantity,
        inboundValue,
        outboundQuantity,
        outboundValue,
        closingQuantity: openingQuantity + inboundQuantity - outboundQuantity,
        closingValue: openingValue + inboundValue - outboundValue,
      };
    });
  }

  static summarizeRows(rows) {
    const sum = (field) => rows.reduce((total, row) => total + (parseFloat(row[field]) || 0), 0);

    return {
      totalRecords: rows.length,
      openingQuantity: sum('openingQuantity'),
      openingValue: sum('openingValue'),
      inboundQuantity: sum('inboundQuantity'),
      inboundValue: sum('inboundValue'),
      outboundQuantity: sum('outboundQuantity'),
      outboundValue: sum('outboundValue'),
      closingQuantity: sum('closingQuantity'),
      closingValue: sum('closingValue'),
    };
  }

  static async previewYearEndClosing(year) {
    const closingYear = this.normalizeYear(year);
    const connection = await db.pool.getConnection();
    try {
      const status = await this.getYearEndStatus(closingYear);
      const rows = await this.calculateYearEndRows(connection, closingYear);
      const negativeRows = rows.filter((row) => row.closingQuantity < -0.0001);
      const zeroValueRows = rows.filter(
        (row) => Math.abs(row.closingQuantity) > 0.0001 && Math.abs(row.closingValue) <= 0.0001
      );

      const checks = [
        {
          key: 'not_frozen',
          name: '年度未冻结',
          passed: !status.isFrozen,
          message: status.isFrozen ? `${closingYear}年度库存已冻结` : '正常',
        },
        {
          key: 'has_rows',
          name: '存在可结存数据',
          passed: rows.length > 0,
          message: rows.length > 0 ? `预计生成 ${rows.length} 条结存记录` : '没有可结存的库存流水或期初记录',
        },
        {
          key: 'negative_closing',
          name: '期末负库存检查',
          passed: negativeRows.length === 0,
          message:
            negativeRows.length === 0
              ? '未发现期末负库存'
              : `发现 ${negativeRows.length} 条期末负库存，建议先处理`,
        },
        {
          key: 'zero_value',
          name: '零金额库存提示',
          passed: true,
          message:
            zeroValueRows.length === 0
              ? '未发现明显零金额库存'
              : `有 ${zeroValueRows.length} 条有数量但金额为0的库存`,
        },
      ];

      return {
        year: closingYear,
        canExecute: checks.filter((item) => item.key !== 'zero_value').every((item) => item.passed),
        hasExistingRecords: status.hasRecords,
        isFrozen: status.isFrozen,
        checks,
        summary: this.summarizeRows(rows),
        differences: status.hasRecords
          ? {
              currentClosingQuantity: status.summary.closingQuantity,
              previewClosingQuantity: this.summarizeRows(rows).closingQuantity,
              currentClosingValue: status.summary.closingValue,
              previewClosingValue: this.summarizeRows(rows).closingValue,
            }
          : null,
        rows: rows.slice(0, 100),
      };
    } finally {
      connection.release();
    }
  }

  /**
   * 执行年度库存结存
   * @param {Object} params 结存参数
   * @param {number} params.year 会计年度
   * @param {string} params.operator 操作人
   * @returns {Object} 结存结果
   */
  static async executeYearEndClosing(params) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const year = this.normalizeYear(params.year);
      const operator = params.operator || 'system';

      if (!year) {
        throw new Error('会计年度不能为空');
      }

      // 1. 检查是否已执行过年度结存
      const [existing] = await connection.execute(
        'SELECT COUNT(*) as count FROM inventory_year_end_balances WHERE year = ? AND is_frozen = 1',
        [year]
      );

      if (existing[0].count > 0) {
        throw new Error(`${year}年度已执行过库存结存且已冻结`);
      }

      // 2. 删除该年度未冻结的旧记录（重新生成）
      const nextYear = year + 1;
      const [nextFrozenRecords] = await connection.execute(
        'SELECT COUNT(*) as count FROM inventory_year_end_balances WHERE year = ? AND is_frozen = 1',
        [nextYear]
      );

      if ((parseInt(nextFrozenRecords[0].count, 10) || 0) > 0) {
        throw new Error(`${nextYear}年度库存结存已冻结，不能重新执行${year}年度库存结存`);
      }

      await connection.execute(
        'DELETE FROM inventory_year_end_balances WHERE year = ? AND is_frozen = 0',
        [year]
      );

      // 3. 以业务日期 transaction_date 为准计算收发存；老数据回退到 created_at。
      //    组合来源包含上年结存、本年前流水和本年流水，避免“有期初无本年发生”漏结。
      const prevYear = year - 1;
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      const [ledgerData] = await connection.execute(
        `
        WITH prev_frozen AS (
          SELECT material_id, location_id, closing_quantity, closing_value
          FROM inventory_year_end_balances
          WHERE year = ? AND is_frozen = 1
        ),
        prior_ledger AS (
          SELECT
            il.material_id,
            il.location_id,
            SUM(il.quantity) as opening_qty,
            SUM(
              CASE
                WHEN il.quantity >= 0 THEN COALESCE(NULLIF(il.total_value, 0), il.quantity * COALESCE(NULLIF(il.unit_cost, 0), m.cost_price, 0), 0)
                ELSE -COALESCE(NULLIF(il.total_value, 0), ABS(il.quantity) * COALESCE(NULLIF(il.unit_cost, 0), m.cost_price, 0), 0)
              END
            ) as opening_value
          FROM inventory_ledger il
          LEFT JOIN materials m ON il.material_id = m.id
          WHERE COALESCE(il.transaction_date, DATE(il.created_at)) < ?
          GROUP BY il.material_id, il.location_id
        ),
        current_ledger AS (
          SELECT
            il.material_id,
            il.location_id,
            SUM(CASE WHEN il.quantity > 0 THEN il.quantity ELSE 0 END) as inbound_qty,
            SUM(CASE WHEN il.quantity < 0 THEN ABS(il.quantity) ELSE 0 END) as outbound_qty,
            SUM(CASE WHEN il.quantity > 0 THEN COALESCE(NULLIF(il.total_value, 0), il.quantity * COALESCE(NULLIF(il.unit_cost, 0), m.cost_price, 0), 0) ELSE 0 END) as inbound_value,
            SUM(CASE WHEN il.quantity < 0 THEN COALESCE(NULLIF(il.total_value, 0), ABS(il.quantity) * COALESCE(NULLIF(il.unit_cost, 0), m.cost_price, 0), 0) ELSE 0 END) as outbound_value
          FROM inventory_ledger il
          LEFT JOIN materials m ON il.material_id = m.id
          WHERE COALESCE(il.transaction_date, DATE(il.created_at)) BETWEEN ? AND ?
          GROUP BY il.material_id, il.location_id
        ),
        balance_keys AS (
          SELECT material_id, location_id FROM prev_frozen
          UNION
          SELECT material_id, location_id FROM prior_ledger WHERE ABS(opening_qty) > 0.0001
          UNION
          SELECT material_id, location_id FROM current_ledger
        )
        SELECT
          k.material_id,
          k.location_id,
          COALESCE(pf.closing_quantity, pl.opening_qty, 0) as opening_qty,
          COALESCE(pf.closing_value, pl.opening_value, 0) as opening_value,
          COALESCE(cl.inbound_qty, 0) as inbound_qty,
          COALESCE(cl.inbound_value, 0) as inbound_value,
          COALESCE(cl.outbound_qty, 0) as outbound_qty,
          COALESCE(cl.outbound_value, 0) as outbound_value
        FROM balance_keys k
        LEFT JOIN prev_frozen pf
          ON pf.material_id = k.material_id AND pf.location_id = k.location_id
        LEFT JOIN prior_ledger pl
          ON pl.material_id = k.material_id AND pl.location_id = k.location_id
        LEFT JOIN current_ledger cl
          ON cl.material_id = k.material_id AND cl.location_id = k.location_id
      `,
        [prevYear, yearStart, yearStart, yearEnd]
      );

      // 4. 插入年度结存记录
      if (ledgerData.length === 0) {
        throw new Error(`${year}年度没有可结存的库存数据`);
      }

      let insertCount = 0;
      for (const row of ledgerData) {
        const openingQty = parseFloat(row.opening_qty) || 0;
        const openingValue = parseFloat(row.opening_value) || 0;
        const inboundQty = parseFloat(row.inbound_qty) || 0;
        const inboundValue = parseFloat(row.inbound_value) || 0;
        const outboundQty = parseFloat(row.outbound_qty) || 0;
        const outboundValue = parseFloat(row.outbound_value) || 0;
        const closingQty = openingQty + inboundQty - outboundQty;
        const closingValue = openingValue + inboundValue - outboundValue;

        if (closingQty < -0.0001) {
          throw new Error(`${year}年度存在期末负库存，不能执行结存`);
        }

        await connection.execute(
          `
          INSERT INTO inventory_year_end_balances
          (year, material_id, location_id, opening_quantity, opening_value,
           inbound_quantity, inbound_value, outbound_quantity, outbound_value,
           closing_quantity, closing_value, is_frozen, frozen_by, frozen_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL)
        `,
          [
            year,
            row.material_id,
            row.location_id,
            openingQty,
            openingValue,
            inboundQty,
            inboundValue,
            outboundQty,
            outboundValue,
            closingQty,
            closingValue,
          ]
        );
        insertCount++;
      }

      // 记录操作日志
      await connection.execute(
        `INSERT INTO operation_logs (module, operation, username, request_data, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          'inventory',
          'year_end_execute',
          operator || 'system',
          JSON.stringify({ year, recordCount: insertCount }),
        ]
      );

      await connection.commit();

      logger.info(`${year}年度库存结存完成，共处理 ${insertCount} 条记录`);

      return {
        year,
        recordCount: insertCount,
        message: `${year}年度库存结存完成，共生成 ${insertCount} 条结存记录`,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('年度库存结存失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 冻结年度库存结存
   * @param {Object} params 冻结参数
   * @param {number} params.year 会计年度
   * @param {string} params.operator 操作人
   * @returns {Object} 冻结结果
   */
  static async freezeYearEndBalance(params) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const year = this.normalizeYear(params.year);
      const operator = params.operator || 'system';

      // 检查是否有结存记录
      const [records] = await connection.execute(
        'SELECT COUNT(*) as count FROM inventory_year_end_balances WHERE year = ?',
        [year]
      );

      if (records[0].count === 0) {
        throw new Error(`${year}年度没有结存记录，请先执行年度结存`);
      }

      // 冻结所有记录
      await connection.execute(
        `UPDATE inventory_year_end_balances
         SET is_frozen = 1, frozen_by = ?, frozen_at = NOW()
         WHERE year = ?`,
        [operator, year]
      );

      // 记录操作日志
      await connection.execute(
        `INSERT INTO operation_logs (module, operation, username, request_data, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        ['inventory', 'year_end_freeze', operator, JSON.stringify({ year })]
      );

      await connection.commit();

      return {
        year,
        message: `${year}年度库存结存已冻结，冻结后无法修改`,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('冻结年度库存结存失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  static async unfreezeYearEndBalance(params) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const year = this.normalizeYear(params.year);
      const operator = params.operator || 'system';

      const [records] = await connection.execute(
        'SELECT COUNT(*) as count, SUM(CASE WHEN is_frozen = 1 THEN 1 ELSE 0 END) as frozen_count FROM inventory_year_end_balances WHERE year = ?',
        [year]
      );

      if (records[0].count === 0) {
        throw new Error(`${year}年度没有结存记录`);
      }

      if ((parseInt(records[0].frozen_count, 10) || 0) === 0) {
        throw new Error(`${year}年度结存未冻结，无需反冻结`);
      }

      const nextYear = year + 1;
      const [nextFrozenRecords] = await connection.execute(
        'SELECT COUNT(*) as count FROM inventory_year_end_balances WHERE year = ? AND is_frozen = 1',
        [nextYear]
      );

      if ((parseInt(nextFrozenRecords[0].count, 10) || 0) > 0) {
        throw new Error(`${nextYear}年度库存结存已冻结，请先反冻结下一年度后再反冻结${year}年度`);
      }

      await connection.execute(
        `UPDATE inventory_year_end_balances
         SET is_frozen = 0, frozen_by = NULL, frozen_at = NULL
         WHERE year = ?`,
        [year]
      );

      await connection.execute(
        `INSERT INTO operation_logs (module, operation, username, request_data, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        ['inventory', 'year_end_unfreeze', operator, JSON.stringify({ year })]
      );

      await connection.commit();

      return {
        year,
        message: `${year}年度库存结存已反冻结`,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('反冻结年度库存结存失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 获取年度库存结存状态
   * @param {number} year 会计年度
   * @returns {Object} 结存状态
   */
  static async getYearEndStatus(year) {
    try {
      // 获取结存记录统计
      const [stats] = await db.pool.execute(
        `
        SELECT
          COUNT(*) as total_records,
          SUM(CASE WHEN is_frozen = 1 THEN 1 ELSE 0 END) as frozen_records,
          SUM(opening_quantity) as total_opening_qty,
          SUM(opening_value) as total_opening_value,
          SUM(inbound_quantity) as total_inbound_qty,
          SUM(inbound_value) as total_inbound_value,
          SUM(outbound_quantity) as total_outbound_qty,
          SUM(outbound_value) as total_outbound_value,
          SUM(closing_quantity) as total_closing_qty,
          SUM(closing_value) as total_closing_value
        FROM inventory_year_end_balances
        WHERE year = ?
      `,
        [year]
      );

      const stat = stats[0];
      const isFrozen = stat.total_records > 0 && stat.frozen_records === stat.total_records;

      return {
        year,
        hasRecords: stat.total_records > 0,
        totalRecords: parseInt(stat.total_records) || 0,
        isFrozen,
        summary: {
          openingQuantity: parseFloat(stat.total_opening_qty) || 0,
          openingValue: parseFloat(stat.total_opening_value) || 0,
          inboundQuantity: parseFloat(stat.total_inbound_qty) || 0,
          inboundValue: parseFloat(stat.total_inbound_value) || 0,
          outboundQuantity: parseFloat(stat.total_outbound_qty) || 0,
          outboundValue: parseFloat(stat.total_outbound_value) || 0,
          closingQuantity: parseFloat(stat.total_closing_qty) || 0,
          closingValue: parseFloat(stat.total_closing_value) || 0,
        },
      };
    } catch (error) {
      logger.error('获取年度库存结存状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取年度库存结存明细
   * @param {Object} params 查询参数
   * @returns {Object} 结存明细列表
   */
  static async getYearEndBalanceList(params) {
    try {
      const { year, location_id, material_code, page = 1, pageSize = 20 } = params;

      let whereClause = 'WHERE yeb.year = ?';
      const queryParams = [year];

      if (location_id) {
        whereClause += ' AND yeb.location_id = ?';
        queryParams.push(location_id);
      }

      if (material_code) {
        whereClause += ' AND m.code LIKE ?';
        queryParams.push(`%${material_code}%`);
      }

      // 获取总数
      const [countResult] = await db.pool.execute(
        `
        SELECT COUNT(*) as total
        FROM inventory_year_end_balances yeb
        LEFT JOIN materials m ON yeb.material_id = m.id
        ${whereClause}
      `,
        queryParams
      );

      const total = countResult[0].total;
      const safePageSize = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 20));
      const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * safePageSize;

      // 获取明细列表
      const [rows] = await db.pool.execute(
        `
        SELECT
          yeb.*,
          m.code as material_code,
          m.name as material_name,
          m.specs as specification,
          u.name as unit_name,
          il.name as location_name
        FROM inventory_year_end_balances yeb
        LEFT JOIN materials m ON yeb.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        LEFT JOIN locations il ON yeb.location_id = il.id
        ${whereClause}
        ORDER BY m.code, il.name
        LIMIT ${safePageSize} OFFSET ${offset}
      `,
        queryParams
      );

      return {
        list: rows,
        total,
        page,
        pageSize,
      };
    } catch (error) {
      logger.error('获取年度库存结存明细失败:', error);
      throw error;
    }
  }

  /**
   * 导出年度库存结存报表
   * @param {number} year 会计年度
   * @returns {Array} 结存数据
   */
  static async exportYearEndReport(year) {
    try {
      const [rows] = await db.pool.execute(
        `
        SELECT
          m.code as '物料编码',
          m.name as '物料名称',
          m.specs as '规格型号',
          u.name as '单位',
          il.name as '仓库',
          yeb.opening_quantity as '期初数量',
          yeb.opening_value as '期初金额',
          yeb.inbound_quantity as '入库数量',
          yeb.inbound_value as '入库金额',
          yeb.outbound_quantity as '出库数量',
          yeb.outbound_value as '出库金额',
          yeb.closing_quantity as '期末数量',
          yeb.closing_value as '期末金额',
          CASE WHEN yeb.is_frozen = 1 THEN '是' ELSE '否' END as '是否冻结'
        FROM inventory_year_end_balances yeb
        LEFT JOIN materials m ON yeb.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        LEFT JOIN locations il ON yeb.location_id = il.id
        WHERE yeb.year = ?
        ORDER BY m.code, il.name
      `,
        [year]
      );

      return rows;
    } catch (error) {
      logger.error('导出年度库存结存报表失败:', error);
      throw error;
    }
  }
}

module.exports = InventoryYearEndService;
