/** Refresh derived inventory costs from the immutable, posted valuation. */
const { logger, db, InventoryService, BusinessError, Precision } = require('./runtime');

module.exports = {
  assertInventoryRecalculationMethod(method) {
    const normalized = this.normalizeInventoryCostingMethod(method);
    if (normalized !== this.COSTING_METHOD.WEIGHTED_AVERAGE) {
      throw new BusinessError(
        '库存成本校准仅支持按已入账金额恢复加权成本；切换先进先出需要成本层及财务调整凭证，不能直接重算历史台账',
        null,
        'INVENTORY_REVALUATION_REQUIRED',
        409
      );
    }
    return normalized;
  },

  /** Rebuild cached balances without repricing approved historical movements. */
  async recalculateInventoryCost(materialId = null, method = this.COSTING_METHOD.WEIGHTED_AVERAGE) {
    const normalizedMethod = this.assertInventoryRecalculationMethod(method);
    const connection = await db.pool.getConnection();
    try {
      // The ledger range lock must also protect against newly inserted rows
      // while the balances are rebuilt. Scope this setting to this transaction.
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.beginTransaction();
      const [materials] = await connection.execute(
        `SELECT id, code, name FROM materials WHERE deleted_at IS NULL
          ${materialId ? 'AND id = ?' : ''} ORDER BY id`,
        materialId ? [materialId] : []
      );
      if (materialId && !materials.length) {
        throw new BusinessError('物料不存在', null, 'MATERIAL_NOT_FOUND', 404);
      }
      const results = [];
      for (const material of materials) {
        const result = await this.recalculateMaterialCost(
          connection,
          material.id,
          normalizedMethod
        );
        results.push({
          materialId: material.id,
          materialCode: material.code,
          materialName: material.name,
          ...result,
        });
      }
      await connection.commit();
      return { method: normalizedMethod, processedCount: results.length, results };
    } catch (error) {
      await connection.rollback();
      logger.error('重新计算库存成本失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  async recalculateMaterialCost(connection, materialId, method) {
    this.assertInventoryRecalculationMethod(method);
    // Match rebuildStockBalancesForMaterial's valuation exactly, including
    // frozen amount rounding and existing append-only valuation adjustments.
    // Lock ledger rows first, matching the valuation-adjustment writer.
    const [transactions] = await connection.execute(
      `SELECT il.id, il.quantity, il.total_value
         FROM inventory_ledger il
        WHERE il.material_id = ? AND il.location_id IS NOT NULL
        ORDER BY il.id FOR UPDATE`,
      [materialId]
    );
    let currentQuantity = 0;
    let currentValue = 0;
    for (const row of transactions) {
      const quantity = Number(row.quantity);
      const amount = Number(row.total_value);
      if (row.total_value == null || ![quantity, amount].every(Number.isFinite)) {
        throw new BusinessError(
          '库存台账缺少有效入账金额，请先核对原始凭据',
          null,
          'INVALID_POSTED_VALUATION',
          409
        );
      }
      currentQuantity = Precision.add(currentQuantity, quantity);
      currentValue = Precision.add(currentValue, (quantity < 0 ? -1 : 1) * Math.abs(amount));
    }
    // An outer FOR UPDATE does not make a nested SUM a current read. The
    // material-list query may already have established an older RR snapshot,
    // so read adjustments explicitly under lock as well.
    const [adjustments] = await connection.execute(
      `SELECT va.ledger_id, va.value_delta
         FROM inventory_valuation_adjustments va
         JOIN inventory_ledger il ON il.id = va.ledger_id
        WHERE il.material_id = ? AND il.location_id IS NOT NULL
        ORDER BY va.id FOR UPDATE`,
      [materialId]
    );
    for (const adjustment of adjustments) {
      if (adjustment.value_delta == null || !Number.isFinite(Number(adjustment.value_delta))) {
        throw new BusinessError(
          '库存估值调整金额无效，请先核对原始凭据',
          null,
          'INVALID_POSTED_VALUATION',
          409
        );
      }
      currentValue = Precision.add(currentValue, Number(adjustment.value_delta));
    }
    if (
      currentQuantity < -0.000001 ||
      currentValue < -0.000001 ||
      (Math.abs(currentQuantity) <= 0.000001 && Math.abs(currentValue) > 0.000001)
    ) {
      throw new BusinessError(
        '库存数量与入账金额不一致，请先核对原始凭据及估值调整',
        null,
        'INCONSISTENT_POSTED_VALUATION',
        409
      );
    }
    const currentUnitCost =
      currentQuantity > 0.000001
        ? Precision.round(Precision.div(currentValue, currentQuantity), 6)
        : 0;
    await connection.execute(
      'UPDATE materials SET cost_price = ? WHERE id = ? AND deleted_at IS NULL',
      [currentUnitCost, materialId]
    );
    await InventoryService.rebuildStockBalancesForMaterial(materialId, connection);
    return {
      finalQuantity: currentQuantity,
      finalValue: currentValue,
      unitCost: currentUnitCost,
      transactionCount: transactions.length,
    };
  },
};
