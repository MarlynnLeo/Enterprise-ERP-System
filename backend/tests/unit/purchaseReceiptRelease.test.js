jest.mock('../../src/services/business/PurchaseOrderQuantityService', () => ({ read: jest.fn() }));
jest.mock('../../src/services/InventoryService', () => ({
  getMaterialLocation: jest.fn(async () => 5),
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateReceiptCode: jest.fn(async () => 'RCV-20260920-0001') },
}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ createLink: jest.fn() }));
jest.mock('../../src/services/business/nonconformingProduct/runtime', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
  firstValidUserId: (...values) => values.find((value) => Number(value) > 0),
  resolveActorLabel: jest.fn(async () => '检验主管'),
  STATUS: { NCP: {} },
}));

const ReleaseService = require('../../src/services/business/PurchaseReceiptReleaseService');
const QuantityService = require('../../src/services/business/PurchaseOrderQuantityService');
const DocumentLinkService = require('../../src/services/business/DocumentLinkService');
const { CodeGenerators } = require('../../src/utils/codeGenerator');
const disposition = require('../../src/services/business/nonconformingProduct/dispositionMethods');

function fixture(overrides = {}) {
  const ncp = {
    id: 50,
    ncp_no: 'NCP-50',
    inspection_id: 60,
    material_id: 40,
    supplier_id: 20,
    batch_no: 'B-1',
    quantity: 20,
    disposition: 'use_as_is',
    concession_status: 'approved',
    status: 'processing',
    created_by: 1,
    concession_approver_id: 2,
    unit: '件',
    ...overrides.ncp,
  };
  const inspection = {
    id: 60,
    inspection_no: 'QI-60',
    inspection_type: 'incoming',
    source_type: 'purchase_order',
    reference_id: 10,
    supplier_id: 20,
    material_id: 40,
    purchase_order_item_id: 30,
    batch_no: 'B-1',
    status: 'partial',
    quantity: 100,
    qualified_quantity: 80,
    unqualified_quantity: 20,
    ...overrides.inspection,
  };
  const order = {
    id: 10,
    order_no: 'PO-10',
    status: 'approved',
    supplier_id: 20,
    supplier_name: '供方',
    ...overrides.order,
  };
  const item = {
    id: 30,
    order_id: 10,
    material_id: 40,
    price: 5,
    tax_rate: 13,
    quantity: 100,
    unit_id: 1,
    unit: '件',
  };
  const allocations = overrides.allocations || [];
  const connection = {
    query: jest.fn(async (sql) => {
      if (sql.includes('SELECT qi.reference_id')) return [[inspection]];
      if (sql.includes('SELECT id FROM purchase_orders')) return [[{ id: order.id }]];
      if (sql.includes('SELECT * FROM nonconforming_products')) return [[ncp]];
      if (sql.includes('SELECT * FROM quality_inspections')) return [[inspection]];
      if (sql.includes('SELECT po.*')) return [[order]];
      if (sql.includes('SELECT * FROM purchase_order_items')) return [overrides.items || [item]];
      if (sql.includes('SELECT DISTINCT r.id AS receipt_id')) return [allocations];
      if (sql.includes('SELECT dl.source_id')) return [overrides.links || [{ source_id: ncp.id }]];
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
  QuantityService.read.mockResolvedValue({
    resolve: () => ({ item, reserved: overrides.reserved ?? 80 }),
  });
  return { connection, ncp, inspection, order, item };
}

const source = { receiptId: 70, inspectionId: 60, orderId: 10, supplierId: 20 };
const allocation = (itemId, quantity, ncpId = 50) => ({
  receipt_id: itemId + 100,
  item_id: itemId,
  qualified_quantity: quantity,
  material_id: 40,
  order_item_id: 30,
  inspection_id: 60,
  source_inspection_id: 60,
  ncp_id: ncpId,
});

test('approved concession releases rejected quantities without changing the inspection verdict', async () => {
  const { connection, inspection } = fixture({
    inspection: { status: 'failed', quantity: 20, qualified_quantity: 0 },
  });
  const release = await ReleaseService.resolveConcession(connection, source);
  expect(release).toMatchObject({
    kind: 'concession',
    ncpId: 50,
    materialId: 40,
    orderItemId: 30,
    qualifiedQuantityLimit: 20,
  });
  expect(inspection).toMatchObject({
    status: 'failed',
    qualified_quantity: 0,
    unqualified_quantity: 20,
  });
  expect(connection.query.mock.calls.some(([sql]) => /UPDATE quality_inspections/.test(sql))).toBe(
    false
  );
});

test('ordinary receipts have no concession privilege', async () => {
  const { connection } = fixture({ links: [] });
  expect(await ReleaseService.resolveConcession(connection, source)).toBeNull();
  expect(connection.query).toHaveBeenCalledTimes(1);
});

test.each([
  [{ ncp: { concession_status: 'pending' } }, '已批准'],
  [{ ncp: { disposition: 'replacement' } }, '已批准'],
  [{ inspection: { status: 'pending' } }, '尚未完成'],
  [{ inspection: { qualified_quantity: null } }, '缺少明确'],
  [{ inspection: { unqualified_quantity: 5 } }, '检验数量不一致'],
  [{ ncp: { quantity: 21 } }, '超过来源检验'],
  [{ inspection: { source_type: 'outsourced_receipt' } }, '不匹配'],
  [{ inspection: { material_id: 41 } }, '不匹配'],
  [{ ncp: { batch_no: 'B-2' } }, '不匹配'],
  [{ order: { supplier_id: 21 } }, '供应商无效'],
  [{ order: { status: 'cancelled' } }, '订单或供应商无效'],
  [{ items: [{ id: 30 }, { id: 31 }] }, '唯一采购订单明细'],
])(
  'rejects an invalid approval, inspection, or purchase source: %j',
  async (overrides, message) => {
    const { connection } = fixture(overrides);
    await expect(
      ReleaseService.prepareConcession(connection, { ncpId: 50, quantity: 1 })
    ).rejects.toThrow(message);
  }
);

test('multiple NCPs share the original rejected quantity ceiling', async () => {
  const { connection } = fixture({ allocations: [allocation(1, 8, 51), allocation(2, 5)] });
  const release = await ReleaseService.resolveConcession(connection, source);
  expect(release.qualifiedQuantityLimit).toBe(7);
  await expect(
    ReleaseService.prepareConcession(connection, { ncpId: 50, quantity: 8 })
  ).rejects.toThrow('累计特采收货数量');
});

test('one NCP cannot spend the remaining allowance of another NCP', async () => {
  const { connection } = fixture({ ncp: { quantity: 10 }, allocations: [allocation(1, 8)] });
  expect((await ReleaseService.resolveConcession(connection, source)).qualifiedQuantityLimit).toBe(
    2
  );
});

test('replacement arrivals and concession receipts compete for the same purchase-order remainder', async () => {
  const { connection } = fixture({ reserved: 90 });
  await expect(
    ReleaseService.prepareConcession(connection, { ncpId: 50, quantity: 20 })
  ).rejects.toThrow('采购订单剩余数量');
  expect(
    (await ReleaseService.prepareConcession(connection, { ncpId: 50, quantity: 10 })).quantity
  ).toBe(10);
});

test('a prior return or scrap disposition cannot be released again as a concession', async () => {
  const { connection } = fixture({ ncp: { handled_quantity: 5 } });
  await expect(
    ReleaseService.prepareConcession(connection, { ncpId: 50, quantity: 20 })
  ).rejects.toThrow('尚未处置数量');
  expect(
    (await ReleaseService.prepareConcession(connection, { ncpId: 50, quantity: 15 })).quantity
  ).toBe(15);
});

test('receipt completion rejects a link to another inspection or an ambiguous approval source', async () => {
  const { connection } = fixture();
  await expect(
    ReleaseService.resolveConcession(connection, { ...source, inspectionId: 61 })
  ).rejects.toThrow('不匹配');
  const ambiguous = fixture({ links: [{ source_id: 50 }, { source_id: 51 }] });
  await expect(ReleaseService.resolveConcession(ambiguous.connection, source)).rejects.toThrow(
    '唯一批准'
  );
});

test('use-as-is creates a priced inspected receipt with mandatory approval provenance', async () => {
  const f = fixture();
  jest.spyOn(ReleaseService, 'prepareConcession').mockResolvedValue({
    ncp: f.ncp,
    inspection: f.inspection,
    order: f.order,
    orderItem: f.item,
    quantity: 20,
    materialId: 40,
    orderItemId: 30,
  });
  const connection = {
    query: jest.fn(async (sql) => {
      if (sql.includes('SELECT qi.*')) return [[f.inspection]];
      if (sql.includes('FROM locations')) return [[{ id: 5, name: '原料仓' }]];
      if (sql.includes('FROM materials')) return [[{ code: 'MAT-40', name: '物料', unit_id: 1 }]];
      if (sql.includes('INSERT INTO purchase_receipts')) return [{ insertId: 70 }];
      return [{}];
    }),
  };
  expect(await disposition.handleUseAsIs(f.ncp, 20, connection, 2)).toEqual({
    receiptId: 70,
    receiptNo: 'RCV-20260920-0001',
  });
  expect(CodeGenerators.generateReceiptCode).toHaveBeenCalledWith(connection);
  const header = connection.query.mock.calls.find(([sql]) =>
    sql.includes('INSERT INTO purchase_receipts')
  );
  expect(header[1][10]).toBe('inspected');
  expect(header[1].slice(-2)).toEqual([113, 13]);
  const line = connection.query.mock.calls.find(([sql]) =>
    sql.includes('INSERT INTO purchase_receipt_items')
  );
  expect(line[1][1]).toBe(30);
  expect(line[1].slice(14, 18)).toEqual([0.13, 100, 13, 113]);
  expect(DocumentLinkService.createLink).toHaveBeenCalledWith(
    expect.objectContaining({
      source_type: 'nonconforming_product',
      source_id: 50,
      target_type: 'purchase_receipt',
      target_id: 70,
      link_type: 'generate',
    }),
    connection
  );
});

test('use-as-is propagates a failed provenance write so the enclosing approval transaction rolls back', async () => {
  const f = fixture();
  jest.spyOn(ReleaseService, 'prepareConcession').mockResolvedValue({
    ncp: f.ncp,
    inspection: f.inspection,
    order: f.order,
    orderItem: f.item,
    quantity: 20,
    materialId: 40,
    orderItemId: 30,
  });
  const connection = {
    query: jest.fn(async (sql) => {
      if (sql.includes('SELECT qi.*')) return [[f.inspection]];
      if (sql.includes('FROM locations')) return [[{ id: 5, name: '原料仓' }]];
      if (sql.includes('FROM materials')) return [[{ code: 'MAT-40', name: '物料' }]];
      return [{ insertId: 70 }];
    }),
  };
  DocumentLinkService.createLink.mockRejectedValueOnce(new Error('provenance unavailable'));
  await expect(disposition.handleUseAsIs(f.ncp, 20, connection, 2)).rejects.toThrow(
    'provenance unavailable'
  );
});
