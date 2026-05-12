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
  /**
   * 初始化年度结存相关表
   * @deprecated 表结构已迁移至 Knex migration 文件管理，此方法保留为空操作以兼容旧调用
   */
  static async initializeTables() {
    logger.info('年度库存结存表已由 Knex migration 管理，跳过运行时创建');
    return true;
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

      const { year, operator } = params;

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
      await connection.execute(
        'DELETE FROM inventory_year_end_balances WHERE year = ? AND is_frozen = 0',
        [year]
      );

      // 3. 获取上一年度期末余额作为本年期初
      const prevYear = year - 1;
      const [prevBalances] = await connection.execute(
        `SELECT material_id, location_id, closing_quantity, closing_value
         FROM inventory_year_end_balances
         WHERE year = ? AND is_frozen = 1`,
        [prevYear]
      );

      // 构建期初余额映射
      const openingMap = {};
      for (const balance of prevBalances) {
        const key = `${balance.material_id}_${balance.location_id}`;
        openingMap[key] = {
          quantity: parseFloat(balance.closing_quantity) || 0,
          value: parseFloat(balance.closing_value) || 0,
        };
      }

      // 4. 计算本年度各物料在各仓库的收发存
      const yearStart = `${year}-01-01 00:00:00`;
      const yearEnd = `${year}-12-31 23:59:59`;

      // 获取本年度所有涉及的物料和仓库组合
      const [ledgerData] = await connection.execute(
        `
        SELECT
          il.material_id,
          il.location_id,
          SUM(CASE WHEN il.quantity > 0 THEN il.quantity ELSE 0 END) as inbound_qty,
          SUM(CASE WHEN il.quantity < 0 THEN ABS(il.quantity) ELSE 0 END) as outbound_qty,
          SUM(il.quantity) as net_qty
        FROM inventory_ledger il
        WHERE il.created_at >= ? AND il.created_at <= ?
        GROUP BY il.material_id, il.location_id
      `,
        [yearStart, yearEnd]
      );

      // 5. 获取物料单价用于计算金额
      const [materials] = await connection.execute(
        'SELECT id, price FROM materials WHERE id IN (SELECT DISTINCT material_id FROM inventory_ledger)'
      );
      const priceMap = {};
      for (const m of materials) {
        priceMap[m.id] = parseFloat(m.price) || 0;
      }

      // 6. 插入年度结存记录
      let insertCount = 0;
      for (const row of ledgerData) {
        const key = `${row.material_id}_${row.location_id}`;
        const opening = openingMap[key] || { quantity: 0, value: 0 };
        const price = priceMap[row.material_id] || 0;

        const inboundQty = parseFloat(row.inbound_qty) || 0;
        const outboundQty = parseFloat(row.outbound_qty) || 0;
        const closingQty = opening.quantity + inboundQty - outboundQty;

        await connection.execute(
          `
          INSERT INTO inventory_year_end_balances
          (year, material_id, location_id, opening_quantity, opening_value,
           inbound_quantity, inbound_value, outbound_quantity, outbound_value,
           closing_quantity, closing_value, is_frozen, frozen_by, frozen_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW())
        `,
          [
            year,
            row.material_id,
            row.location_id,
            opening.quantity,
            opening.value,
            inboundQty,
            inboundQty * price,
            outboundQty,
            outboundQty * price,
            closingQty,
            closingQty * price,
            operator || 'system',
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

      const { year, operator } = params;

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
        [operator || 'system', year]
      );

      // 记录操作日志
      await connection.execute(
        `INSERT INTO operation_logs (module, operation, username, request_data, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        ['inventory', 'year_end_freeze', operator || 'system', JSON.stringify({ year })]
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

  /**
   * 获取年度库存结存状态
   * @param {number} year 会计年度
   * @returns {Object} 结存状态
   */
  static async getYearEndStatus(year) {
    try {
      // 检查表是否存在
      await this.initializeTables();

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
      const safePageSize = Math.max(1, Math.min(10000, parseInt(pageSize, 10) || 20));
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
