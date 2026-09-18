const PurchaseOrderQuantityService = require('../../src/services/business/PurchaseOrderQuantityService');

const connectionFor = ({ orders, inspections = [], receipts = [], returns = [] }) => ({
  query: jest.fn(async sql => {
    if (sql.includes('SELECT * FROM purchase_order_items')) return [orders];
    if (sql.includes('FROM quality_inspections WHERE')) return [inspections];
    if (sql.includes('FROM purchase_receipt_items ri JOIN purchase_receipts')) return [receipts];
    if (sql.includes('FROM purchase_return_items rti')) return [returns];
    throw new Error(`Unexpected query: ${sql}`);
  }),
});

describe('purchase quantity sources', () => {
  test('counts a delivery once and keeps repeated material lines separate', async () => {
    const result = await PurchaseOrderQuantityService.read(connectionFor({
      orders: [{ id: 1, material_id: 10, quantity: 4 }, { id: 2, material_id: 10, quantity: 6 }],
      inspections: [
        { id: 7, material_id: 10, purchase_order_item_id: 1, status: 'passed', quantity: 4, qualified_quantity: 4, unqualified_quantity: 0 },
        { id: 8, material_id: 10, purchase_order_item_id: 2, status: 'pending', quantity: 5, qualified_quantity: 0 },
      ],
      receipts: [{ order_item_id: 1, material_id: 10, inspection_id: 7, status: 'completed', qualified_quantity: 4 }],
      returns: [{ order_item_id: 1, material_id: 10, return_quantity: 1 }],
    }), 20);
    expect(result.lines.get(1)).toMatchObject({ received: 3, reserved: 3, inspected: 4, qualified: 4, returned: 1 });
    expect(result.lines.get(2)).toMatchObject({ received: 5, reserved: 5, inspected: 0, qualified: 0 });
  });

  test('failed inspection releases quantity while manual drafts reserve without counting as received', async () => {
    const result = await PurchaseOrderQuantityService.read(connectionFor({
      orders: [{ id: 1, material_id: 10, quantity: 5 }],
      inspections: [{ id: 7, material_id: 10, purchase_order_item_id: 1, status: 'failed', quantity: 3, qualified_quantity: 0, unqualified_quantity: 3 }],
      receipts: [
        { order_item_id: 1, material_id: 10, status: 'draft', qualified_quantity: 1 },
        { order_item_id: 1, material_id: 10, status: 'confirmed', qualified_quantity: 2 },
      ],
    }), 20);
    expect(result.lines.get(1)).toMatchObject({ received: 2, reserved: 3, inspected: 3, qualified: 0, unqualified: 3 });
  });

  test('ambiguous legacy inspections cannot silently update all matching order lines', async () => {
    await expect(PurchaseOrderQuantityService.read(connectionFor({
      orders: [{ id: 1, material_id: 10 }, { id: 2, material_id: 10 }],
      inspections: [{ id: 7, material_id: 10, status: 'pending', quantity: 2 }],
    }), 20)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  });
});
