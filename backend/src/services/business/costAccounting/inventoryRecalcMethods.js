/**
 * CostAccountingService — inventoryRecalc methods (mixin)
 * Attached via Object.assign so `this` resolves to CostAccountingService.
 * @module services/business/costAccounting/inventoryRecalcMethods
 */

const {
  logger,
  db,
  InventoryService,
} = require('./runtime');

module.exports = {
  /**
     * 库存成本重新计算（月结/全量校准用途）
     *
     * ⚠️ 职责边界说明：
     *   - 本方法用于 **月结** 或 **手动校准** 场景，遍历所有历史台账全量重算 cost_price
     *   - 实时增量场景（采购入库、调整入库等）由 InventoryCostService.generateInboundCostEntry() 的 MAC 算法负责
     *   - 两者是互补关系：InventoryCostService 提供实时准确性，本方法提供事后校验能力
     *   - 若两者计算结果不一致，以本方法的全量重算为准（因为它基于完整历史数据）
     *
     * @param {number} materialId 物料ID（可选，不传则计算所有物料）
     * @param {string} method 成本计算方法
     * @returns {Object} 重新计算结果
     */
    async recalculateInventoryCost(
      materialId = null,
      method = this.COSTING_METHOD.WEIGHTED_AVERAGE
    ) {
      const normalizedMethod = this.normalizeInventoryCostingMethod(method);
      const connection = await db.pool.getConnection();
      try {
        await connection.beginTransaction();
  
        let materials = [];
        if (materialId) {
          const [materialInfo] = await connection.execute(
            'SELECT id, code, name FROM materials WHERE id = ? AND deleted_at IS NULL',
            [materialId]
          );
          materials = materialInfo;
        } else {
          // 尝试查询所有活跃物料，如果is_active字段不存在则查询所有物料
          try {
            const [allMaterials] = await connection.execute(
              'SELECT id, code, name FROM materials WHERE is_active = true'
            );
            materials = allMaterials;
          } catch (error) {
            if (error.message.includes('Unknown column')) {
              const [allMaterials] = await connection.execute('SELECT id, code, name FROM materials');
              materials = allMaterials;
            } else {
              throw error;
            }
          }
        }
  
        const results = [];
  
        for (const material of materials) {
          const result = await this.recalculateMaterialCost(connection, material.id, normalizedMethod);
          results.push({
            materialId: material.id,
            materialCode: material.code,
            materialName: material.name,
            ...result,
          });
        }
  
        await connection.commit();
  
        return {
          method: normalizedMethod,
          processedCount: results.length,
          results,
        };
      } catch (error) {
        await connection.rollback();
        logger.error('重新计算库存成本失败:', error);
        throw error;
      } finally {
        connection.release();
      }
    },

  /**
     * 重新计算单个物料成本
     * @param {Object} connection 数据库连接
     * @param {number} materialId 物料ID
     * @param {string} method 成本计算方法
     * @returns {Object} 计算结果
     */
    async recalculateMaterialCost(connection, materialId, method) {
      const normalizedMethod = this.normalizeInventoryCostingMethod(method);
      // 获取库存交易记录（按时间排序，处理字段名兼容性）
      let transactions;
      try {
        const [result] = await connection.execute(
          `SELECT id, material_id, location_id, transaction_type, transaction_no, reference_no, reference_type, quantity, before_quantity, after_quantity, unit_id, batch_number, operator, remark, created_at, updated_at, unit_cost, total_value, supplier_id, supplier_name, production_date, expiry_date, warehouse_name, issue_reason, is_excess, bom_required_qty, total_issued_qty, purchase_order_id, purchase_order_no, receipt_id, receipt_no, transaction_date FROM inventory_ledger
           WHERE material_id = ?
           ORDER BY transaction_date, created_at`,
          [materialId]
        );
        transactions = result;
      } catch (error) {
        if (error.message.includes('Unknown column')) {
          // 尝试使用created_at字段排序
          const [result] = await connection.execute(
            `SELECT id, material_id, location_id, transaction_type, transaction_no, reference_no, reference_type, quantity, before_quantity, after_quantity, unit_id, batch_number, operator, remark, created_at, updated_at, unit_cost, total_value, supplier_id, supplier_name, production_date, expiry_date, warehouse_name, issue_reason, is_excess, bom_required_qty, total_issued_qty, purchase_order_id, purchase_order_no, receipt_id, receipt_no, transaction_date FROM inventory_ledger
             WHERE material_id = ?
             ORDER BY created_at`,
            [materialId]
          );
          transactions = result;
        } else {
          throw error;
        }
      }
  
      let currentQuantity = 0;
      let currentValue = 0;
      let currentUnitCost = 0;
  
      for (const transaction of transactions) {
        const signedQuantity = this.toNumber(transaction.quantity, 0);
        if (signedQuantity > 0) {
          // 入库处理
          const inboundQuantity = Math.abs(signedQuantity);
          // 尝试从不同字段获取单位成本
          const inboundUnitCost =
            transaction.unit_cost ||
            (transaction.amount && transaction.quantity
              ? transaction.amount / transaction.quantity
              : 0) ||
            0;
          const inboundValue = inboundQuantity * inboundUnitCost;
  
          if (normalizedMethod === this.COSTING_METHOD.WEIGHTED_AVERAGE) {
            // 加权平均法
            const totalValue = currentValue + inboundValue;
            const totalQuantity = currentQuantity + inboundQuantity;
  
            if (totalQuantity > 0) {
              currentUnitCost = totalValue / totalQuantity;
            }
  
            currentQuantity = totalQuantity;
            currentValue = totalValue;
          } else if (normalizedMethod === this.COSTING_METHOD.FIFO) {
            // 先进先出法（简化处理）
            currentQuantity += inboundQuantity;
            currentValue += inboundValue;
            if (currentQuantity > 0) {
              currentUnitCost = currentValue / currentQuantity;
            }
          }
        } else if (signedQuantity < 0) {
          // 出库处理
          const outboundQuantity = Math.abs(signedQuantity);
          const outboundValue = outboundQuantity * currentUnitCost;
  
          currentQuantity -= outboundQuantity;
          currentValue -= outboundValue;
  
          // 确保不出现负值
          if (currentQuantity < 0) currentQuantity = 0;
          if (currentValue < 0) currentValue = 0;
        }
  
        // 更新交易记录的单位成本（尝试不同的字段名）
        try {
          await connection.execute(
            'UPDATE inventory_ledger SET unit_cost = ?, total_value = ROUND(ABS(quantity) * ?, 2) WHERE id = ?',
            [currentUnitCost, currentUnitCost, transaction.id]
          );
        } catch (error) {
          if (error.message.includes('Unknown column')) {
            // 如果unit_cost字段不存在，尝试更新amount字段
            try {
              const newAmount = transaction.quantity * currentUnitCost;
              await connection.execute('UPDATE inventory_ledger SET amount = ? WHERE id = ?', [
                newAmount,
                transaction.id,
              ]);
            } catch {
              // 如果amount字段也不存在，记录警告但不抛出错误
            }
          } else {
            throw error;
          }
        }
      }
  
      // 更新物料的当前成本（写入 cost_price 成本价字段，严禁污染 price 销售价字段）
      await connection.execute('UPDATE materials SET cost_price = ? WHERE id = ? AND deleted_at IS NULL', [
        currentUnitCost,
        materialId,
      ]);
      await InventoryService.rebuildStockBalancesForMaterial(materialId, connection);
  
      return {
        finalQuantity: currentQuantity,
        transactionCount: transactions.length,
      };
    },
};
