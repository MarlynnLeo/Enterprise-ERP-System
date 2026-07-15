const db = require('../src/config/db');
const InventoryService = require('../src/services/InventoryService');

async function repairInventoryLedgerCosts() {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const sourceJoins = `
      LEFT JOIN materials m ON m.id = l.material_id
      LEFT JOIN purchase_receipts pr ON pr.receipt_no = l.reference_no
      LEFT JOIN purchase_receipt_items pri
        ON pri.receipt_id = pr.id AND pri.material_id = l.material_id
      LEFT JOIN purchase_order_items poi
        ON poi.order_id = pr.order_id AND poi.material_id = l.material_id
      LEFT JOIN (
        SELECT material_id, batch_number,
               SUM(quantity * COALESCE(NULLIF(unit_cost, 0), NULLIF(total_value / NULLIF(quantity, 0), 0), 0))
                 / NULLIF(SUM(quantity), 0) AS batch_unit_cost
        FROM inventory_ledger
        WHERE quantity > 0
          AND batch_number IS NOT NULL
          AND batch_number != ''
          AND (COALESCE(unit_cost, 0) > 0 OR COALESCE(total_value, 0) > 0)
        GROUP BY material_id, batch_number
      ) bc ON bc.material_id = l.material_id AND bc.batch_number = l.batch_number
    `;
    const candidateWhere = `
      WHERE ABS(COALESCE(l.quantity, 0)) > 0.000001
        AND (COALESCE(l.unit_cost, 0) <= 0 OR COALESCE(l.total_value, 0) <= 0)
        AND COALESCE(
          NULLIF(pri.price, 0),
          NULLIF(poi.price, 0),
          NULLIF(bc.batch_unit_cost, 0),
          NULLIF(m.cost_price, 0),
          0
        ) > 0
    `;
    const [affectedMaterials] = await connection.query(`
      SELECT DISTINCT l.material_id
      FROM inventory_ledger l
      ${sourceJoins}
      ${candidateWhere}
    `);

    const [result] = await connection.query(`
      UPDATE inventory_ledger l
      ${sourceJoins}
      SET
        l.unit_cost = COALESCE(
          NULLIF(l.unit_cost, 0),
          NULLIF(pri.price, 0),
          NULLIF(poi.price, 0),
          NULLIF(bc.batch_unit_cost, 0),
          NULLIF(m.cost_price, 0),
          0
        ),
        l.total_value = ROUND(
          ABS(l.quantity) * COALESCE(
            NULLIF(l.unit_cost, 0),
            NULLIF(pri.price, 0),
            NULLIF(poi.price, 0),
            NULLIF(bc.batch_unit_cost, 0),
            NULLIF(m.cost_price, 0),
            0
          ),
          2
        )
      ${candidateWhere}
    `);

    for (const row of affectedMaterials) {
      await InventoryService.rebuildStockBalancesForMaterial(row.material_id, connection);
    }

    await connection.commit();
    console.log(
      `inventory ledger costs repaired: ${result.affectedRows}; stock balance materials rebuilt: ${affectedMaterials.length}`
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await db.pool.end();
  }
}

repairInventoryLedgerCosts().catch((error) => {
  console.error(error);
  process.exit(1);
});
