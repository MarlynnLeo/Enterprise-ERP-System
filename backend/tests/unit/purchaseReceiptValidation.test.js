jest.mock('../../src/services/business/PurchaseOrderQuantityService', () => ({ read: jest.fn() }));

const QuantityService = require('../../src/services/business/PurchaseOrderQuantityService');
const ValidationService = require('../../src/services/business/PurchaseReceiptValidationService');

function fixture({ inspection = {}, pending = false } = {}) {
  const source = {
    id: 7, inspection_type: 'incoming', source_type: 'purchase_order', reference_id: 2,
    supplier_id: 5, material_id: 3, purchase_order_item_id: 4, batch_no: 'B-7',
    status: pending ? 'pending' : 'partial', quantity: 10, qualified_quantity: 6,
    unqualified_quantity: 4, ...inspection,
  };
  const orderItem = { id: 4, material_id: 3, quantity: 20, price: 8, tax_rate: 0.13, unit_id: 1 };
  const line = { item: orderItem, reserved: 0 };
  QuantityService.read.mockResolvedValue({ lines: new Map([[4, line]]), resolve: () => line });
  const connection = { query: jest.fn(async (sql) => {
    if (sql.includes('FROM purchase_orders')) return [[{ id: 2, status: 'approved', supplier_id: 5 }]];
    if (sql.includes('FROM quality_inspections')) return [[source]];
    throw new Error(`Unexpected query: ${sql}`);
  }) };
  const input = {
    orderId: 2, supplierId: 5, inspectionId: 7, allowPendingInspection: pending,
    items: [{ order_item_id: 4, material_id: 3, received_quantity: 10, qualified_quantity: pending ? 0 : 6 }],
  };
  return { connection, input };
}

test.each([null, 7])('rejects a multi-line draft at the domain boundary, inspection=%s', async (inspectionId) => {
  const { connection, input } = fixture({ pending: true });
  input.inspectionId = inspectionId;
  input.items.push({ order_item_id: 8, material_id: 9, received_quantity: 5, qualified_quantity: 0 });
  await expect(ValidationService.validateItems(connection, input)).rejects.toThrow('一条采购订单明细');
  expect(connection.query).not.toHaveBeenCalled();
});

test('pending receipt records arrival only; completion uses exactly the accepted inspection quantity', async () => {
  const pending = fixture({ pending: true });
  expect(await ValidationService.validateItems(pending.connection, pending.input)).toEqual([
    expect.objectContaining({ quantity: 10, qualified_quantity: 0, batch_number: 'B-7', order_item_id: 4 }),
  ]);
  const terminal = fixture();
  expect(await ValidationService.validateItems(terminal.connection, terminal.input)).toEqual([
    expect.objectContaining({ quantity: 10, qualified_quantity: 6, batch_number: 'B-7', order_item_id: 4 }),
  ]);
});

test.each([
  [{ received_quantity: 8 }, '收货数量必须与关联检验数量一致'],
  [{ qualified_quantity: 4 }, '收货合格数量必须与关联检验结果一致'],
  [{ qualified_quantity: 7 }, '超过检验合格数量'],
])('one inspection cannot be consumed by a receipt that drops or invents quantities: %j', async (changes, message) => {
  const { connection, input } = fixture();
  Object.assign(input.items[0], changes);
  await expect(ValidationService.validateItems(connection, input)).rejects.toThrow(message);
});

test.each([
  [{ supplier_id: 6 }, '供应商与采购订单不一致'],
  [{ supplier_id: null }, '供应商与采购订单不一致'],
  [{ batch_no: ' ' }, '缺少可追溯批次'],
  [{ purchase_order_item_id: 8 }, '不属于所选检验单'],
])('rejects incomplete or mismatched inspection provenance: %j', async (inspection, message) => {
  const { connection, input } = fixture({ inspection });
  await expect(ValidationService.validateItems(connection, input)).rejects.toThrow(message);
});

test('a separately approved concession may release part of the rejected quantity', async () => {
  const { connection, input } = fixture();
  input.releaseContext = { orderItemId: 4, materialId: 3, qualifiedQuantityLimit: 4 };
  input.items[0] = { order_item_id: 4, material_id: 3, received_quantity: 3, qualified_quantity: 3 };
  expect(await ValidationService.validateItems(connection, input)).toEqual([
    expect.objectContaining({ quantity: 3, qualified_quantity: 3, batch_number: 'B-7' }),
  ]);
  expect(QuantityService.read).toHaveBeenLastCalledWith(connection, 2, { receiptId: null, inspectionId: null });
});
