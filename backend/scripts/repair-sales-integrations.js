#!/usr/bin/env node

const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');
const InventoryService = require('../src/services/InventoryService');
const SalesOrderStatusService = require('../src/services/business/SalesOrderStatusService');

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

async function repairCompletedOutboundLedger(connection, counters) {
  const [rows] = await connection.query(
    `SELECT so.id AS outbound_id, so.outbound_no, so.order_id, so.delivery_date, so.created_by,
            soi.product_id, SUM(COALESCE(soi.quantity, 0)) AS outbound_quantity,
            COALESCE(soi.price, m.cost_price, m.price, 0) AS unit_cost,
            m.location_id, m.unit_id, m.code AS material_code, m.name AS material_name
       FROM sales_outbound so
       JOIN sales_outbound_items soi ON soi.outbound_id = so.id
       JOIN materials m ON m.id = soi.product_id AND m.deleted_at IS NULL
      WHERE so.deleted_at IS NULL
        AND so.status = 'completed'
      GROUP BY so.id, so.outbound_no, so.order_id, so.delivery_date, so.created_by,
               soi.product_id, COALESCE(soi.price, m.cost_price, m.price, 0),
               m.location_id, m.unit_id, m.code, m.name
      HAVING ABS(outbound_quantity - ABS(COALESCE((
        SELECT SUM(il.quantity)
          FROM inventory_ledger il
         WHERE il.reference_type = 'sales_outbound'
           AND il.reference_no = so.outbound_no
           AND il.material_id = soi.product_id
           AND il.transaction_type = 'sales_outbound'
      ), 0))) > 0.01
      FOR UPDATE`
  );

  for (const row of rows) {
    const quantity = toNumber(row.outbound_quantity);
    if (quantity <= 0) continue;

    await InventoryService.updateStock(
      {
        materialId: row.product_id,
        locationId: row.location_id,
        quantity: -quantity,
        transactionType: 'sales_outbound',
        referenceNo: row.outbound_no,
        referenceType: 'sales_outbound',
        operator: 'system',
        remark: `Repair sales outbound ledger: ${row.outbound_no}`,
        unitId: row.unit_id || null,
        transactionDate: row.delivery_date,
        unitCost: toNumber(row.unit_cost),
      },
      connection
    );
    counters.outboundLedgerRowsCreated += 1;
  }
}

async function repairOrderShippingStatuses(connection, counters) {
  const [rows] = await connection.query(
    `SELECT x.id, x.order_no, x.status, x.expected_status
       FROM (
        SELECT so.id, so.order_no, so.status,
               ROUND(COALESCE(SUM(soi.quantity), 0), 2) AS ordered_quantity,
               ROUND(COALESCE(SUM(GREATEST(COALESCE(ship.shipped_quantity, 0) - COALESCE(ret.returned_quantity, 0), 0)), 0), 2) AS shipped_quantity,
               CASE
                 WHEN COALESCE(SUM(GREATEST(COALESCE(ship.shipped_quantity, 0) - COALESCE(ret.returned_quantity, 0), 0)), 0) <= 0 THEN 'ready_to_ship'
                 WHEN COALESCE(SUM(GREATEST(COALESCE(ship.shipped_quantity, 0) - COALESCE(ret.returned_quantity, 0), 0)), 0) + 0.01 >= COALESCE(SUM(soi.quantity), 0) THEN 'shipped'
                 ELSE 'partial_shipped'
               END AS expected_status
          FROM sales_orders so
          JOIN sales_order_items soi ON soi.order_id = so.id
          LEFT JOIN (
            SELECT COALESCE(sobi.source_order_id, sob.order_id) AS order_id, sobi.product_id,
                   SUM(COALESCE(sobi.quantity, 0)) AS shipped_quantity
              FROM sales_outbound_items sobi
              JOIN sales_outbound sob ON sob.id = sobi.outbound_id
             WHERE sob.deleted_at IS NULL
               AND sob.status IN ('processing', 'completed')
               AND COALESCE(sobi.source_order_id, sob.order_id) IS NOT NULL
             GROUP BY COALESCE(sobi.source_order_id, sob.order_id), sobi.product_id
          ) ship ON ship.order_id = so.id AND ship.product_id = soi.material_id
          LEFT JOIN (
            SELECT sr.order_id, sri.product_id,
                   SUM(COALESCE(sri.quantity, 0)) AS returned_quantity
              FROM sales_return_items sri
              JOIN sales_returns sr ON sr.id = sri.return_id
             WHERE sr.deleted_at IS NULL
               AND sr.status NOT IN ('rejected', 'cancelled', 'draft')
             GROUP BY sr.order_id, sri.product_id
          ) ret ON ret.order_id = so.id AND ret.product_id = soi.material_id
         WHERE so.deleted_at IS NULL
           AND so.status NOT IN ('draft', 'pending', 'confirmed', 'in_production', 'in_procurement', 'shortage', 'ready_to_ship', 'cancelled', 'completed')
         GROUP BY so.id, so.order_no, so.status
       ) x
      WHERE (expected_status = 'ready_to_ship' AND status IN ('partial_shipped', 'shipped', 'delivered'))
         OR (expected_status = 'partial_shipped' AND status <> 'partial_shipped')
         OR (expected_status = 'shipped' AND status NOT IN ('shipped', 'delivered'))
      FOR UPDATE`
  );

  for (const row of rows) {
    if (row.expected_status === 'shipped' || row.expected_status === 'partial_shipped') {
      await SalesOrderStatusService.updateOrderStatus(row.id, connection);
      counters.orderStatusesReconciled += 1;
    }
  }
}

async function main() {
  const connection = await mysql.createConnection(getPoolConfig());
  const counters = {
    outboundLedgerRowsCreated: 0,
    orderStatusesReconciled: 0,
  };

  try {
    await connection.beginTransaction();
    await repairCompletedOutboundLedger(connection, counters);
    await repairOrderShippingStatuses(connection, counters);
    await connection.commit();
    console.log(JSON.stringify({ salesRepair: counters }, null, 2));
    process.exit(0);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors.
    }
    console.error('Sales integration repair failed:', error.stack || error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main();
