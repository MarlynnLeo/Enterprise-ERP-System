const db = require('../config/db');
const InventoryService = require('./InventoryService');

/**
 * 库存预留服务
 * 处理销售订单的库存锁定和预留逻辑
 */
class InventoryReservationService {
  /**
   * 为订单预留库存
   * @param {number} orderId - 订单ID
   * @param {string} orderNo - 订单编号
   * @param {Array} items - 订单物料项
   * @param {number} userId - 操作用户ID
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<Object>} 预留结果
   */
  async reserveInventoryForOrder(orderId, orderNo, items, userId, connection = null) {
    const conn = connection || (await db.pool.getConnection());
    const shouldReleaseConnection = !connection;

    try {
      if (!connection) {
        await conn.beginTransaction();
      }

      const reservations = [];
      const insufficientItems = [];

      // ✅ 批量预取物料基础信息（消除循环内 N 次 getMaterialInfo SQL）
      const materialIds = items.map(i => i.material_id);
      const materialInfoMap = await InventoryService.getBatchMaterialInfo(materialIds, conn);

      for (const item of items) {
        // 从预取结果获取物料信息（0 次 SQL）
        const matInfo = materialInfoMap.get(item.material_id);
        if (!matInfo) {
          throw new Error(`物料 ${item.material_id} 不存在或未配置默认仓库`);
        }
        const material = { id: item.material_id, code: matInfo.code || matInfo.materialCode, name: matInfo.name || matInfo.materialName };
        const locationId = matInfo.locationId;

        // 检查当前可用库存（使用 FOR UPDATE 锁，必须逐行以防止超卖）
        const availableStock = await this.getAvailableStock(item.material_id, locationId, conn);
        const requiredQuantity = parseFloat(item.quantity);

        // 计算实际可以预留的数量（取需求量和可用库存的最小值）
        const reservableQuantity = Math.min(availableStock, requiredQuantity);

        if (reservableQuantity > 0) {
          // 创建预留记录（预留实际可用的数量）
          const [reservationResult] = await conn.execute(
            `
            INSERT INTO inventory_reservations (
              order_id, order_no, material_id, material_code, material_name,
              location_id, reserved_quantity, status, created_by, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
          `,
            [
              orderId,
              orderNo,
              item.material_id,
              material.code,
              material.name,
              locationId,
              reservableQuantity,
              userId,
              `订单${orderNo}库存预留`,
            ]
          );

          reservations.push({
            id: reservationResult.insertId,
            materialId: item.material_id,
            materialCode: material.code,
            materialName: material.name,
            locationId: locationId,
            reservedQuantity: reservableQuantity,
            requiredQuantity: requiredQuantity,
          });
        }

        // 如果库存不足，记录不足信息
        if (availableStock < requiredQuantity) {
          insufficientItems.push({
            materialId: item.material_id,
            materialCode: material.code,
            materialName: material.name,
            required: requiredQuantity,
            available: availableStock,
            reserved: reservableQuantity,
            shortage: requiredQuantity - availableStock,
          });
        }
      }

      if (!connection) {
        await conn.commit();
      }

      const isFullyReserved = insufficientItems.length === 0;
      const isPartiallyReserved = reservations.length > 0 && insufficientItems.length > 0;
      const hasReservations = reservations.length > 0;

      return {
        success: hasReservations, // 只要有预留就算成功
        fullSuccess: isFullyReserved,
        partialSuccess: isPartiallyReserved,
        reservations,
        insufficientItems,
        message: isFullyReserved
          ? `成功预留${reservations.length}个物料的全部库存`
          : isPartiallyReserved
            ? `部分预留成功：已预留可用库存，${insufficientItems.length}个物料库存不足`
            : `${insufficientItems.length}个物料库存不足，无法预留库存`,
      };
    } catch (error) {
      if (!connection) {
        await conn.rollback();
      }
      throw error;
    } finally {
      if (shouldReleaseConnection) {
        conn.release();
      }
    }
  }

  /**
   * 释放订单的库存预留
   * @param {number} orderId - 订单ID
   * @param {number} userId - 操作用户ID
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<Object>} 释放结果
   */
  async releaseInventoryReservation(orderId, userId, connection = null) {
    const conn = connection || (await db.pool.getConnection());
    const shouldReleaseConnection = !connection;

    try {
      if (!connection) {
        await conn.beginTransaction();
      }

      // 获取活跃的预留记录
      const [reservations] = await conn.execute(
        'SELECT * FROM inventory_reservations WHERE order_id = ? AND status = "active"',
        [orderId]
      );

      if (reservations.length === 0) {
        return {
          success: true,
          message: '没有找到需要释放的库存预留',
          releasedCount: 0,
        };
      }

      // 更新预留状态为已释放
      const [updateResult] = await conn.execute(
        `
        UPDATE inventory_reservations 
        SET status = 'released', released_at = NOW(), updated_at = NOW()
        WHERE order_id = ? AND status = 'active'
      `,
        [orderId]
      );

      if (!connection) {
        await conn.commit();
      }

      return {
        success: true,
        message: `成功释放${updateResult.affectedRows}条库存预留`,
        releasedCount: updateResult.affectedRows,
      };
    } catch (error) {
      if (!connection) {
        await conn.rollback();
      }
      throw error;
    } finally {
      if (shouldReleaseConnection) {
        conn.release();
      }
    }
  }

  /**
   * 获取可用库存（总库存 - 已预留库存）
   * @param {number} materialId - 物料ID
   * @param {number} locationId - 仓库位置ID
   * @param {Object} connection - 数据库连接
   * @returns {Promise<number>} 可用库存数量
   */
  async getAvailableStock(materialId, locationId, connection) {
    // 获取总库存，强制开启使用 FOR UPDATE 排他锁，防止并发超卖和死锁
    const totalStock = await InventoryService.getCurrentStock(materialId, locationId, connection, true, false);

    // 获取已预留库存
    const [reservedResult] = await connection.execute(
      `
      SELECT COALESCE(SUM(reserved_quantity), 0) as reserved_quantity
      FROM inventory_reservations 
      WHERE material_id = ? AND location_id = ? AND status = 'active'
    `,
      [materialId, locationId]
    );

    const reservedStock = parseFloat(reservedResult[0].reserved_quantity) || 0;

    return Math.max(0, totalStock - reservedStock);
  }

  /**
   * 获取订单的预留记录
   * @param {number} orderId - 订单ID
   * @returns {Promise<Array>} 预留记录列表
   */
  async getOrderReservations(orderId) {
    const [reservations] = await db.pool.execute(
      `
      SELECT ir.*, m.name as material_name, l.name as location_name
      FROM inventory_reservations ir
      LEFT JOIN materials m ON ir.material_id = m.id
      LEFT JOIN locations l ON ir.location_id = l.id
      WHERE ir.order_id = ?
      ORDER BY ir.created_at DESC
    `,
      [orderId]
    );

    return reservations;
  }

  /**
   * 检查订单是否有活跃的库存预留
   * @param {number} orderId - 订单ID
   * @returns {Promise<boolean>} 是否有活跃预留
   */
  async hasActiveReservations(orderId) {
    const [result] = await db.pool.execute(
      'SELECT COUNT(*) as count FROM inventory_reservations WHERE order_id = ? AND status = "active"',
      [orderId]
    );

    return result[0].count > 0;
  }

  /**
   * 消费预留库存（出库时调用）
   * @param {number} orderId - 订单ID
   * @param {Array} consumedItems - 消费的物料项
   * @param {number} userId - 操作用户ID
   * @returns {Promise<Object>} 消费结果
   */
  async consumeReservation(orderId, consumedItems, userId) {
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

      // ✅ 批量 UPDATE 替代逐条循环
      if (consumedItems.length > 0) {
        const materialIds = consumedItems.map(item => item.material_id);
        const placeholders = materialIds.map(() => '?').join(',');
        await connection.execute(
          `UPDATE inventory_reservations 
           SET status = 'consumed', updated_at = NOW()
           WHERE order_id = ? AND material_id IN (${placeholders}) AND status = 'active'`,
          [orderId, ...materialIds]
        );
      }

      await connection.commit();

      return {
        success: true,
        message: `成功消费${consumedItems.length}个物料的预留库存`,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new InventoryReservationService();
