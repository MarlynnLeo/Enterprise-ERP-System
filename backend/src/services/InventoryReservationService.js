const db = require('../config/db');
const InventoryService = require('./InventoryService');

/**
 * Inventory reservation service for sales orders.
 *
 * The important rule here is that an order can be marked ready to ship only
 * after its own active reservations cover every order line. Re-running the
 * reservation flow is idempotent for the same order: existing active
 * reservations count toward the requirement and only the remaining quantity is
 * reserved.
 */
class InventoryReservationService {
  async reserveInventoryForOrder(orderId, orderNo, items, userId, connection = null) {
    const conn = connection || (await db.pool.getConnection());
    const shouldReleaseConnection = !connection;

    try {
      if (!connection) {
        await conn.beginTransaction();
      }

      const reservations = [];
      const insufficientItems = [];
      const materialIds = [...new Set(items.map(i => i.material_id).filter(Boolean))];
      const materialInfoMap = await InventoryService.getBatchMaterialInfo(materialIds, conn);

      for (const item of items) {
        const matInfo = materialInfoMap.get(item.material_id);
        if (!matInfo) {
          throw new Error(`Material ${item.material_id} does not exist or has no default location`);
        }

        const material = {
          id: item.material_id,
          code: matInfo.code || matInfo.materialCode,
          name: matInfo.name || matInfo.materialName,
        };
        const locationId = matInfo.locationId;
        const requiredQuantity = parseFloat(item.quantity || item.ordered_quantity || 0);

        const [existingRows] = await conn.execute(
          `SELECT COALESCE(SUM(reserved_quantity), 0) as reserved_quantity
           FROM inventory_reservations
           WHERE order_id = ? AND material_id = ? AND location_id = ? AND status = 'active'`,
          [orderId, item.material_id, locationId]
        );
        const alreadyReserved = parseFloat(existingRows[0]?.reserved_quantity || 0);

        const availableForOrder = await this.getAvailableStock(item.material_id, locationId, conn, orderId);
        const remainingQuantity = Math.max(0, requiredQuantity - alreadyReserved);
        const availableForNewReservation = Math.max(0, availableForOrder - alreadyReserved);
        const reservableQuantity = Math.min(availableForNewReservation, remainingQuantity);

        if (reservableQuantity > 0) {
          const [reservationResult] = await conn.execute(
            `INSERT INTO inventory_reservations (
              order_id, order_no, material_id, material_code, material_name,
              location_id, reserved_quantity, status, created_by, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
            [
              orderId,
              orderNo,
              item.material_id,
              material.code,
              material.name,
              locationId,
              reservableQuantity,
              userId || null,
              `Order ${orderNo} inventory reservation`,
            ]
          );

          reservations.push({
            id: reservationResult.insertId,
            materialId: item.material_id,
            materialCode: material.code,
            materialName: material.name,
            locationId,
            reservedQuantity: reservableQuantity,
            requiredQuantity,
            alreadyReserved,
          });
        } else if (alreadyReserved > 0) {
          reservations.push({
            id: null,
            materialId: item.material_id,
            materialCode: material.code,
            materialName: material.name,
            locationId,
            reservedQuantity: alreadyReserved,
            requiredQuantity,
            alreadyReserved,
          });
        }

        const totalReservedForOrder = alreadyReserved + reservableQuantity;
        if (totalReservedForOrder < requiredQuantity) {
          insufficientItems.push({
            materialId: item.material_id,
            materialCode: material.code,
            materialName: material.name,
            required: requiredQuantity,
            available: availableForOrder,
            reserved: totalReservedForOrder,
            shortage: requiredQuantity - totalReservedForOrder,
          });
        }
      }

      if (!connection) {
        await conn.commit();
      }

      const fullSuccess = insufficientItems.length === 0;
      const partialSuccess = reservations.length > 0 && insufficientItems.length > 0;

      return {
        success: reservations.length > 0,
        fullSuccess,
        partialSuccess,
        reservations,
        insufficientItems,
        message: fullSuccess
          ? `Reserved all inventory for ${reservations.length} items`
          : partialSuccess
            ? `Partially reserved inventory; ${insufficientItems.length} items remain short`
            : `${insufficientItems.length} items have no reservable inventory`,
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

  async releaseInventoryReservation(orderId, userId, connection = null) {
    const conn = connection || (await db.pool.getConnection());
    const shouldReleaseConnection = !connection;

    try {
      if (!connection) {
        await conn.beginTransaction();
      }

      const [reservations] = await conn.execute(
        'SELECT * FROM inventory_reservations WHERE order_id = ? AND status = "active"',
        [orderId]
      );

      if (reservations.length === 0) {
        return {
          success: true,
          message: 'No active inventory reservations to release',
          releasedCount: 0,
        };
      }

      const [updateResult] = await conn.execute(
        `UPDATE inventory_reservations
         SET status = 'released', released_at = NOW(), updated_at = NOW()
         WHERE order_id = ? AND status = 'active'`,
        [orderId]
      );

      if (!connection) {
        await conn.commit();
      }

      return {
        success: true,
        message: `Released ${updateResult.affectedRows} inventory reservations`,
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

  async getAvailableStock(materialId, locationId, connection, excludeOrderId = null) {
    const totalStock = await InventoryService.getCurrentStock(
      materialId,
      locationId,
      connection,
      true,
      false
    );

    let reservedSql = `
      SELECT COALESCE(SUM(reserved_quantity), 0) as reserved_quantity
      FROM inventory_reservations
      WHERE material_id = ? AND location_id = ? AND status = 'active'
    `;
    const reservedParams = [materialId, locationId];

    if (excludeOrderId) {
      reservedSql += ' AND order_id != ?';
      reservedParams.push(excludeOrderId);
    }

    const [reservedResult] = await connection.execute(reservedSql, reservedParams);
    const reservedStock = parseFloat(reservedResult[0].reserved_quantity) || 0;

    return Math.max(0, totalStock - reservedStock);
  }

  async getOrderReservations(orderId) {
    const [reservations] = await db.pool.execute(
      `SELECT ir.*, m.name as material_name, l.name as location_name
       FROM inventory_reservations ir
       LEFT JOIN materials m ON ir.material_id = m.id
       LEFT JOIN locations l ON ir.location_id = l.id
       WHERE ir.order_id = ?
       ORDER BY ir.created_at DESC`,
      [orderId]
    );

    return reservations;
  }

  async hasActiveReservations(orderId) {
    const [result] = await db.pool.execute(
      'SELECT COUNT(*) as count FROM inventory_reservations WHERE order_id = ? AND status = "active"',
      [orderId]
    );

    return result[0].count > 0;
  }

  async consumeReservation(orderId, consumedItems) {
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

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
        message: `Consumed reservations for ${consumedItems.length} items`,
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
