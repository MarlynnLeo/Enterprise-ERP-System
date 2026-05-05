/**
 * InventoryConsistencyService.js
 * @description 库存数据一致性检查和修复服务
 * @date 2024-12-08
 * @version 1.0.0
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');
const { CodeGenerators } = require('../../utils/codeGenerator');

class InventoryConsistencyService {
  /**
   * 检查库存是否充足（出库前必须调用）
   * @param {number} materialId - 物料ID
   * @param {number} locationId - 库位ID
   * @param {number} requiredQuantity - 需要的数量
   * @param {Object} connection - 数据库连接（可选，用于事务）
   * @param {boolean} withLock - 是否使用行级锁
   * @returns {Promise<Object>} 校验结果
   */
  static async checkStockSufficiency(
    materialId,
    locationId,
    requiredQuantity,
    connection = null,
    withLock = false
  ) {
    const conn = connection || db.pool;

    try {
      const lockSql = withLock ? ' FOR UPDATE' : '';

      const [result] = await conn.execute(
        `SELECT COALESCE(SUM(quantity), 0) as current_stock
         FROM inventory_ledger
         WHERE material_id = ? AND location_id = ?${lockSql}`,
        [materialId, locationId]
      );

      const currentStock = parseFloat(result[0].current_stock) || 0;
      const required = parseFloat(requiredQuantity) || 0;
      const isEnough = currentStock >= required;

      return {
        isEnough,
        currentStock,
        requiredQuantity: required,
        shortage: isEnough ? 0 : required - currentStock,
        message: isEnough
          ? '库存充足'
          : `库存不足，当前: ${currentStock}, 需要: ${required}, 差额: ${required - currentStock}`,
      };
    } catch (error) {
      logger.error('检查库存充足性失败:', error);
      throw error;
    }
  }

  /**
   * 批量检查多个物料的库存充足性
   * @param {Array} items - [{material_id, location_id, quantity}, ...]
   * @param {Object} connection - 数据库连接
   * @returns {Promise<Object>} 批量校验结果
   */
  static async batchCheckStockSufficiency(items, connection = null) {
    const conn = connection || db.pool;
    const insufficientItems = [];

    try {
      for (const item of items) {
        const result = await this.checkStockSufficiency(
          item.material_id,
          item.location_id,
          item.quantity,
          conn,
          false
        );

        if (!result.isEnough) {
          // 获取物料信息
          const [materialInfo] = await conn.execute(
            'SELECT code, name FROM materials WHERE id = ?',
            [item.material_id]
          );

          insufficientItems.push({
            material_id: item.material_id,
            material_code: materialInfo[0]?.code || '',
            material_name: materialInfo[0]?.name || '未知物料',
            location_id: item.location_id,
            currentStock: result.currentStock,
            requiredQuantity: result.requiredQuantity,
            shortage: result.shortage,
          });
        }
      }

      return {
        allSufficient: insufficientItems.length === 0,
        insufficientItems,
        message:
          insufficientItems.length === 0
            ? '所有物料库存充足'
            : `${insufficientItems.length}个物料库存不足`,
      };
    } catch (error) {
      logger.error('批量检查库存充足性失败:', error);
      throw error;
    }
  }

  /**
   * 检查负库存
   * @returns {Promise<Array>} 负库存列表
   */
  static async checkNegativeStock() {
    try {
      const [results] = await db.pool.execute(`
        SELECT 
          il.material_id, 
          m.code as material_code, 
          m.name as material_name,
          il.location_id,
          l.name as location_name,
          SUM(il.quantity) as current_stock
        FROM inventory_ledger il
        JOIN materials m ON il.material_id = m.id
        JOIN locations l ON il.location_id = l.id
        GROUP BY il.material_id, il.location_id
        HAVING SUM(il.quantity) < 0
        ORDER BY SUM(il.quantity) ASC
      `);

      return results;
    } catch (error) {
      logger.error('检查负库存失败:', error);
      throw error;
    }
  }

  /**
   * 检查before_quantity/after_quantity一致性
   * @returns {Promise<Array>} 不一致的记录
   */
  static async checkQuantityConsistency() {
    try {
      const [results] = await db.pool.execute(`
        SELECT 
          id, material_id, location_id, transaction_type,
          quantity, before_quantity, after_quantity,
          (before_quantity + quantity) as expected_after
        FROM inventory_ledger
        WHERE ABS(after_quantity - (before_quantity + quantity)) > 0.001
        LIMIT 100
      `);

      return results;
    } catch (error) {
      logger.error('检查数量一致性失败:', error);
      throw error;
    }
  }

  /**
   * 修复after_quantity不一致的记录
   * @returns {Promise<Object>} 修复结果
   */
  static async fixQuantityConsistency() {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(`
        UPDATE inventory_ledger
        SET after_quantity = before_quantity + quantity
        WHERE ABS(after_quantity - (before_quantity + quantity)) > 0.001
      `);

      await connection.commit();

      logger.info(`修复了 ${result.affectedRows} 条数量不一致的记录`);

      return {
        success: true,
        fixedCount: result.affectedRows,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('修复数量一致性失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 生成库存调整单修复负库存
   * @param {string} operator - 操作人
   * @returns {Promise<Object>} 调整结果
   */
  static async generateAdjustmentForNegativeStock(operator = 'system') {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 获取负库存列表
      const negativeStocks = await this.checkNegativeStock();

      if (negativeStocks.length === 0) {
        await connection.commit();
        return { success: true, adjustedCount: 0, message: '没有负库存需要调整' };
      }

      const adjustmentNo = await CodeGenerators.generateAdjustmentCode(connection);

      let adjustedCount = 0;

      for (const item of negativeStocks) {
        const adjustQuantity = Math.abs(parseFloat(item.current_stock));

        // 插入库存调整记录
        await connection.execute(
          `
          INSERT INTO inventory_ledger (
            material_id, location_id, transaction_type, transaction_no,
            reference_no, reference_type, quantity, before_quantity, after_quantity,
            operator, remark
          ) VALUES (?, ?, 'adjustment_in', ?, ?, 'inventory_adjustment', ?, ?, ?, ?, ?)
        `,
          [
            item.material_id,
            item.location_id,
            adjustmentNo,
            adjustmentNo,
            adjustQuantity,
            parseFloat(item.current_stock),
            0, // 调整后库存为0
            operator,
            `系统自动调整负库存，原库存: ${item.current_stock}`,
          ]
        );

        adjustedCount++;
      }

      await connection.commit();

      logger.info(`生成库存调整单 ${adjustmentNo}，调整了 ${adjustedCount} 个物料的负库存`);

      return {
        success: true,
        adjustmentNo,
        adjustedCount,
        message: `成功调整 ${adjustedCount} 个物料的负库存`,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('生成负库存调整单失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 执行完整的数据一致性检查
   * @returns {Promise<Object>} 检查报告
   */
  static async runFullConsistencyCheck() {
    try {
      const negativeStock = await this.checkNegativeStock();
      const quantityIssues = await this.checkQuantityConsistency();

      const report = {
        checkTime: new Date().toISOString(),
        negativeStock: {
          count: negativeStock.length,
          items: negativeStock,
        },
        quantityConsistency: {
          issueCount: quantityIssues.length,
          items: quantityIssues,
        },
        overallStatus:
          negativeStock.length === 0 && quantityIssues.length === 0 ? 'HEALTHY' : 'ISSUES_FOUND',
      };

      logger.info('库存数据一致性检查完成:', {
        negativeStockCount: negativeStock.length,
        quantityIssueCount: quantityIssues.length,
        status: report.overallStatus,
      });

      return report;
    } catch (error) {
      logger.error('执行数据一致性检查失败:', error);
      throw error;
    }
  }
}

module.exports = InventoryConsistencyService;
