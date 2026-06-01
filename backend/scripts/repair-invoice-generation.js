#!/usr/bin/env node

const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');

async function repairInvoiceItems(connection, tableName, headerTable, foreignKey) {
  const [rows] = await connection.query(`
    SELECT i.id, i.${foreignKey} AS invoice_id, i.quantity, i.unit_price, i.amount,
           ROUND(COALESCE(i.quantity, 0) * COALESCE(i.unit_price, 0), 2) AS expected_amount
    FROM ${tableName} i
    WHERE ABS(ROUND(COALESCE(i.amount, 0), 2)
      - ROUND(COALESCE(i.quantity, 0) * COALESCE(i.unit_price, 0), 2)) > 0.01
  `);

  for (const row of rows) {
    await connection.execute(`UPDATE ${tableName} SET amount = ? WHERE id = ?`, [
      row.expected_amount,
      row.id,
    ]);
  }

  const invoiceIds = [...new Set(rows.map((row) => row.invoice_id))];
  for (const invoiceId of invoiceIds) {
    const [totals] = await connection.query(
      `SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS item_total
       FROM ${tableName}
       WHERE ${foreignKey} = ?`,
      [invoiceId]
    );
    const total = totals[0]?.item_total || 0;
    await connection.execute(
      `UPDATE ${headerTable}
       SET total_amount = ?,
           balance_amount = ROUND(? - COALESCE(paid_amount, 0), 2),
           updated_at = NOW()
       WHERE id = ?`,
      [total, total, invoiceId]
    );
  }

  return { itemCount: rows.length, invoiceCount: invoiceIds.length };
}

async function main() {
  const connection = await mysql.createConnection(getPoolConfig());
  try {
    await connection.beginTransaction();
    const ar = await repairInvoiceItems(connection, 'ar_invoice_items', 'ar_invoices', 'invoice_id');
    const ap = await repairInvoiceItems(connection, 'ap_invoice_items', 'ap_invoices', 'invoice_id');
    await connection.commit();
    console.log(`AR repaired: ${ar.itemCount} items, ${ar.invoiceCount} invoices`);
    console.log(`AP repaired: ${ap.itemCount} items, ${ap.invoiceCount} invoices`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
