'use strict';

/** Always acquire shared sales-order locks before locking a downstream document. */
async function lockSalesOrders(connection, orderIds) {
  const ids = [...new Set(orderIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].sort((a,b) => a-b);
  if (ids.length) await connection.query(
    'SELECT id FROM sales_orders WHERE id IN (?) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [ids]
  );
  return new Set(ids);
}

module.exports = { lockSalesOrders };
