const TARGET = Object.freeze({
  orderId: 78,
  orderItemId: 94,
  receiptId: 69,
  receiptItemId: 79,
  materialId: 110512,
  materialCode: '3013001283',
  receiptNo: 'RCV202607130001',
  batchNumber: 'PUR-G104-260713-002',
});

function assertSingleRow(rows, label) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`${label}: expected exactly one matching row, found ${rows?.length || 0}`);
  }
  return rows[0];
}

function assertNear(actual, expected, label, tolerance = 0.000001) {
  if (Math.abs(Number(actual) - Number(expected)) > tolerance) {
    throw new Error(`${label}: expected ${expected}, found ${actual}`);
  }
}

function assertZeroOrNear(actual, expected, label) {
  const value = Number(actual || 0);
  if (value > 0 && Math.abs(value - Number(expected)) > 0.000001) {
    throw new Error(`${label}: existing value ${actual} conflicts with proven cost ${expected}`);
  }
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const [ledgerRows] = await trx.raw(
      `SELECT id, quantity, unit_cost, total_value, batch_number
         FROM inventory_ledger
        WHERE receipt_id = ?
          AND material_id = ?
          AND transaction_no = ?
          AND quantity > 0
        FOR UPDATE`,
      [TARGET.receiptId, TARGET.materialId, TARGET.receiptNo]
    );
    if (ledgerRows.length === 0) {
      const targetReceipt = await trx('purchase_receipts')
        .where({ id: TARGET.receiptId, receipt_no: TARGET.receiptNo })
        .first('id');
      if (!targetReceipt) return;
    }
    const ledger = assertSingleRow(ledgerRows, 'Proven receipt ledger evidence');
    assertNear(ledger.quantity, 1000, 'Receipt ledger quantity');
    assertNear(ledger.unit_cost, 85.9, 'Receipt ledger unit cost');
    assertNear(ledger.total_value, 85900, 'Receipt ledger total value', 0.01);
    if (ledger.batch_number !== TARGET.batchNumber) {
      throw new Error(
        `Receipt ledger batch: expected ${TARGET.batchNumber}, found ${ledger.batch_number}`
      );
    }

    const [outboundRows] = await trx.raw(
      `SELECT id, quantity, unit_cost, total_value
         FROM inventory_ledger
        WHERE material_id = ?
          AND batch_number = ?
          AND quantity < 0
        FOR UPDATE`,
      [TARGET.materialId, TARGET.batchNumber]
    );
    const outbound = assertSingleRow(outboundRows, 'Matching outbound ledger evidence');
    assertNear(outbound.quantity, -1000, 'Outbound ledger quantity');
    assertNear(outbound.unit_cost, ledger.unit_cost, 'Outbound ledger unit cost');
    assertNear(outbound.total_value, ledger.total_value, 'Outbound ledger total value', 0.01);

    const [materialRows] = await trx.raw(
      `SELECT id, code, price, cost_price
         FROM materials
        WHERE id = ?
          AND code = ?
        FOR UPDATE`,
      [TARGET.materialId, TARGET.materialCode]
    );
    const material = assertSingleRow(materialRows, 'Target material');
    assertNear(material.price, ledger.unit_cost, 'Material historical price');
    assertZeroOrNear(material.cost_price, ledger.unit_cost, 'Material cost price');

    const [orderItemRows] = await trx.raw(
      `SELECT id, order_id, material_id, quantity, price, tax_rate
         FROM purchase_order_items
        WHERE id = ?
          AND order_id = ?
          AND material_id = ?
        FOR UPDATE`,
      [TARGET.orderItemId, TARGET.orderId, TARGET.materialId]
    );
    const orderItem = assertSingleRow(orderItemRows, 'Target purchase order item');
    assertNear(orderItem.quantity, ledger.quantity, 'Purchase order item quantity');
    assertZeroOrNear(orderItem.price, ledger.unit_cost, 'Purchase order item price');

    const [receiptItemRows] = await trx.raw(
      `SELECT id, receipt_id, material_id, quantity, received_quantity,
              qualified_quantity, price, tax_rate, order_item_id
         FROM purchase_receipt_items
        WHERE id = ?
          AND receipt_id = ?
          AND material_id = ?
        FOR UPDATE`,
      [TARGET.receiptItemId, TARGET.receiptId, TARGET.materialId]
    );
    const receiptItem = assertSingleRow(receiptItemRows, 'Target purchase receipt item');
    assertNear(receiptItem.quantity, ledger.quantity, 'Purchase receipt item quantity');
    assertNear(receiptItem.received_quantity, ledger.quantity, 'Purchase receipt received quantity');
    assertNear(receiptItem.qualified_quantity, ledger.quantity, 'Purchase receipt qualified quantity');
    assertZeroOrNear(receiptItem.price, ledger.unit_cost, 'Purchase receipt item price');
    if (receiptItem.order_item_id && Number(receiptItem.order_item_id) !== TARGET.orderItemId) {
      throw new Error(
        `Purchase receipt order item link conflicts with target item ${TARGET.orderItemId}`
      );
    }

    const taxRate = Number(receiptItem.tax_rate || orderItem.tax_rate || 0);
    if (taxRate <= 0) {
      throw new Error('Target purchase receipt has no positive tax rate');
    }
    const normalizedTaxRate = taxRate > 1 ? taxRate / 100 : taxRate;
    const subtotal = Math.round(Number(ledger.quantity) * Number(ledger.unit_cost) * 100) / 100;
    const taxAmount = Math.round(subtotal * normalizedTaxRate * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

    await trx('materials')
      .where({ id: TARGET.materialId, code: TARGET.materialCode })
      .update({ cost_price: ledger.unit_cost, updated_at: trx.fn.now() });

    await trx('purchase_order_items')
      .where({ id: TARGET.orderItemId, order_id: TARGET.orderId, material_id: TARGET.materialId })
      .update({
        price: ledger.unit_cost,
        total: subtotal,
        amount_excluding_tax: subtotal,
        tax_rate: normalizedTaxRate,
        tax_amount: taxAmount,
        received_quantity: ledger.quantity,
        updated_at: trx.fn.now(),
      });

    await trx('purchase_orders')
      .where({ id: TARGET.orderId })
      .whereNull('deleted_at')
      .update({
        subtotal,
        tax_rate: normalizedTaxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        updated_at: trx.fn.now(),
      });

    await trx('purchase_receipt_items')
      .where({ id: TARGET.receiptItemId, receipt_id: TARGET.receiptId })
      .update({
        order_item_id: TARGET.orderItemId,
        price: ledger.unit_cost,
        tax_rate: normalizedTaxRate,
        amount_excluding_tax: subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        updated_at: trx.fn.now(),
      });

    await trx('purchase_receipts')
      .where({ id: TARGET.receiptId, receipt_no: TARGET.receiptNo })
      .whereNull('deleted_at')
      .update({
        total_amount: totalAmount,
        total_tax_amount: taxAmount,
        updated_at: trx.fn.now(),
      });
  });
};

exports.down = async function down() {
  // Historical monetary repairs are not rolled back because downstream invoices
  // and vouchers can legitimately be generated from the corrected source data.
};
