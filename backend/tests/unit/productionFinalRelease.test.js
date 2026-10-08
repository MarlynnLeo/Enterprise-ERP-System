jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/InventoryService', () => ({
  getMaterialLocation: jest.fn(async () => 2),
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateInboundCode: jest.fn(async () => 'IN-NEW') },
}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ createLink: jest.fn() }));
jest.mock('../../src/services/business/nonconformingProduct/runtime', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
  firstValidUserId: (...values) => values.find((value) => Number(value) > 0),
  resolveActorLabel: jest.fn(async () => '质量主管'),
}));

const service = require('../../src/services/business/ProductionInboundService');
const links = require('../../src/services/business/DocumentLinkService');
const disposition = require('../../src/services/business/nonconformingProduct/dispositionMethods');

function fixture(overrides = {}) {
  const inspection = {
    id: 7,
    inspection_no: 'FQC-7',
    inspection_type: 'final',
    status: 'partial',
    reference_type: 'production_task',
    reference_id: 8,
    product_id: 3,
    batch_no: 'BATCH-7',
    quantity: 100,
    qualified_quantity: 90,
    unqualified_quantity: 10,
    inspector_id: 1,
    ...overrides.inspection,
  };
  const ncp = {
    id: 9,
    ncp_no: 'NCP-9',
    inspection_id: 7,
    material_id: 3,
    batch_no: 'BATCH-7',
    quantity: 10,
    handled_quantity: 0,
    disposition: 'use_as_is',
    concession_status: 'approved',
    status: 'processing',
    concession_approver_id: 2,
    ...overrides.ncp,
  };
  const inbounds = overrides.inbounds || [];
  const items = overrides.items || [];
  const documentLinks = [];
  const connection = {
    query: jest.fn(async (sql, args = []) => {
      if (sql.includes('FROM production_processes') || sql.includes("inspection_type IN ('first_article'")) return [[]];
      if (sql.includes('SELECT quantity, handled_quantity')) return [[ncp]];
      if (sql.includes('SELECT ii.quantity FROM inventory_inbound')) return [items.filter(item => inbounds.some(ib => ib.id === item.inbound_id && ib.inspection_id === args[0]))];
      if (sql.includes('SELECT * FROM nonconforming_products')) return [[ncp]];
      if (sql.includes('FROM quality_inspections') || sql.includes('SELECT qi.*')) {
        if (args[0] === 70) return [[{ ...inspection, id: 70, inspection_no: 'FQC-REWORK', status: 'passed', quantity: 10, qualified_quantity: 10, unqualified_quantity: 0 }]];
        return [[inspection]];
      }
      if (sql.includes('FROM document_links')) {
        return [
          documentLinks
            .filter((link) => link.source_id === args[0])
            .flatMap((link) => inbounds.filter((inbound) => inbound.id === link.target_id)),
        ];
      }
      if (sql.includes('FROM nonconforming_products'))
        return [[{ quantity: overrides.otherReleases || 0 }]];
      if (sql.includes('FROM inventory_inbound_items')) {
        return [items.filter((item) => args[0].includes(item.inbound_id))];
      }
      if (sql.includes('FROM inventory_inbound'))
        return [inbounds.filter((inbound) => inbound.inspection_id === args[0])];
      if (sql.includes('FROM production_tasks'))
        return [
          [
            {
              id: 8,
              code: 'TASK-8',
              product_id: 3,
              quantity: 100,
              status: 'warehousing', completed_quantity: 100,
              material_location_id: 2,
              material_unit_id: 1,
            },
          ],
        ];
      if (sql.includes('FROM locations')) return [[{ id: 2 }]];
      throw new Error(`Unexpected query: ${sql}`);
    }),
    execute: jest.fn(async (sql, args) => {
      if (sql.includes('UPDATE inventory_inbound_items')) {
        items.find((item) => item.id === args[2]).quantity += args[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('UPDATE inventory_inbound SET')) return [{ affectedRows: 1 }];
      if (sql.includes('INSERT INTO inventory_inbound_items')) {
        items.push({
          id: items.length + 1,
          inbound_id: args[0],
          material_id: args[1],
          quantity: args[2],
          batch_number: args[5],
        });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO inventory_inbound')) {
        const id = inbounds.length + 20;
        inbounds.push({
          id,
          inbound_no: args[0],
          inbound_type: args[1],
          reference_type: args[2],
          reference_id: args[3],
          inspection_id: args[4],
          location_id: args[6],
          status: 'draft',
        });
        return [{ insertId: id }];
      }
      throw new Error(`Unexpected mutation: ${sql}`);
    }),
  };
  links.createLink.mockImplementation(async (link) => {
    documentLinks.push(link);
  });
  return { connection, inspection, ncp, inbounds, items, documentLinks };
}

function qualifiedInbound(status = 'draft') {
  return {
    inbounds: [
      {
        id: 20,
        inspection_id: 7,
        inbound_no: 'IN-90',
        status,
        inbound_type: 'production',
        reference_type: 'production_task',
        reference_id: 8,
        location_id: 2,
      },
    ],
    items: [{ id: 1, inbound_id: 20, material_id: 3, quantity: 90, batch_number: 'BATCH-7' }],
  };
}

test('90 qualified from a batch of 100 creates a 90-unit draft and retains the 10 defects', async () => {
  const f = fixture();
  await service.createDraftFromFinalInspection(f.connection, { inspection: f.inspection });
  expect(f.items.map((item) => item.quantity)).toEqual([90]);
  expect(f.inspection).toMatchObject({
    status: 'partial',
    quantity: 100,
    qualified_quantity: 90,
    unqualified_quantity: 10,
  });
  expect(f.inbounds[0]).toMatchObject({ inbound_type: 'production', reference_id: 8 });
});

test('a separate repair reinspection releases only its repaired 10 units after the original 90', async () => {
  const f = fixture(qualifiedInbound('completed'));
  await service.createDraftFromFinalInspection(f.connection, {
    inspection: {
      ...f.inspection,
      id: 70,
      inspection_no: 'FQC-REWORK',
      status: 'passed',
      quantity: 10,
      qualified_quantity: 10,
      unqualified_quantity: 0,
    },
  });
  expect(f.items.map((item) => item.quantity)).toEqual([90, 10]);
  expect(f.inbounds[1]).toMatchObject({ inspection_id: 70, reference_id: 8 });
});

test('approval merges 10 into the editable 90 draft while preserving original defect evidence', async () => {
  const f = fixture(qualifiedInbound());
  const before = { ...f.inspection };
  const result = await service.createDraftFromFinalConcession(f.connection, {
    ncpId: 9,
    quantity: 10,
  });
  expect(result).toMatchObject({ id: 20, merged: true, released_quantity: 10 });
  expect(f.items.map((item) => item.quantity)).toEqual([100]);
  expect(f.inbounds).toHaveLength(1);
  expect(f.inspection).toEqual(before);
  expect(f.documentLinks).toEqual([
    expect.objectContaining({
      source_type: 'nonconforming_product',
      source_id: 9,
      target_type: 'inventory_inbound',
      target_id: 20,
    }),
  ]);
  expect(
    f.connection.execute.mock.calls.some(([sql]) => /UPDATE quality_inspections/.test(sql))
  ).toBe(false);
});

test.each(['confirmed', 'completed'])(
  'approval after %s 90 creates a separate production draft for 10',
  async (status) => {
    const f = fixture(qualifiedInbound(status));
    const result = await service.createDraftFromFinalConcession(f.connection, {
      ncpId: 9,
      quantity: 10,
    });
    expect(result).toMatchObject({ created: true, released_quantity: 10 });
    expect(f.items.map((item) => item.quantity)).toEqual([90, 10]);
    expect(f.inbounds[1]).toMatchObject({
      inspection_id: 7,
      inbound_type: 'production',
      reference_id: 8,
    });
  }
);

test('approval creates one 100-unit production draft when qualified stock has no draft yet', async () => {
  const f = fixture();
  await service.createDraftFromFinalConcession(f.connection, { ncpId: 9, quantity: 10 });
  expect(f.items.map((item) => item.quantity)).toEqual([100]);
});

test('repeating the same approved release cannot add another 10 to a merged draft', async () => {
  const f = fixture(qualifiedInbound());
  await service.createDraftFromFinalConcession(f.connection, { ncpId: 9, quantity: 10 });
  const result = await service.createDraftFromFinalConcession(f.connection, {
    ncpId: 9,
    quantity: 10,
  });
  expect(result).toMatchObject({ id: 20, existed: true });
  expect(f.items.map((item) => item.quantity)).toEqual([100]);
  expect(links.createLink).toHaveBeenCalledTimes(1);
});

test.each([
  [{ ncp: { concession_status: 'pending' } }, 10, '已批准'],
  [{ ncp: { disposition: 'rework' } }, 10, '已批准'],
  [{ ncp: { material_id: 4 } }, 10, '不匹配'],
  [{ ncp: { batch_no: 'ANOTHER' } }, 10, '不匹配'],
  [{ ncp: { quantity: 11 } }, 10, '原检验不合格数量'],
  [{ inspection: { qualified_quantity: null } }, 10, '缺少明确'],
  [{ ncp: { handled_quantity: 5 } }, 10, '剩余处置数量'],
  [{ otherReleases: 5 }, 10, '累计让步放行数量'],
  [{ otherReleases: 'not-a-number' }, 10, '累计让步放行数量'],
  [{}, 11, '剩余处置数量'],
  [{}, 0, '数量必须有效'],
  [{}, NaN, '数量必须有效'],
])('rejects unauthorized or excessive release: %j', async (overrides, quantity, message) => {
  const f = fixture(overrides);
  await expect(
    service.createDraftFromFinalConcession(f.connection, { ncpId: 9, quantity })
  ).rejects.toThrow(message);
  expect(f.connection.execute).not.toHaveBeenCalled();
});

test('a previously excessive inbound cannot consume the same ten defective units again', async () => {
  const data = qualifiedInbound('completed');
  data.items[0].quantity = 100;
  const f = fixture(data);
  await expect(
    service.createDraftFromFinalConcession(f.connection, { ncpId: 9, quantity: 10 })
  ).rejects.toThrow('累计生产入库数量');
  expect(f.connection.execute).not.toHaveBeenCalled();
});

test('the nonconformance final concession path uses production release rather than other inbound', async () => {
  const f = fixture(qualifiedInbound());
  const result = await disposition.handleUseAsIs(f.ncp, 10, f.connection, 2);
  expect(result).toMatchObject({ path: 'inventory_inbound', merged: true });
  expect(f.items[0].quantity).toBe(100);
  expect(f.connection.execute.mock.calls.some(([sql]) => sql.includes("'other', 'ncp'"))).toBe(
    false
  );
});

test('a wholly rejected batch may be released only through its approved concession', async () => {
  const f = fixture({
    inspection: { status: 'failed', qualified_quantity: 0, unqualified_quantity: 100 },
    ncp: { quantity: 100 },
  });
  await service.createDraftFromFinalConcession(f.connection, { ncpId: 9, quantity: 100 });
  expect(f.items.map((item) => item.quantity)).toEqual([100]);
  expect(f.inspection.status).toBe('failed');
});

test('mandatory release evidence failure propagates so the approval transaction can roll back', async () => {
  const f = fixture(qualifiedInbound());
  links.createLink.mockRejectedValueOnce(new Error('release link unavailable'));
  await expect(
    service.createDraftFromFinalConcession(f.connection, { ncpId: 9, quantity: 10 })
  ).rejects.toThrow('release link unavailable');
});
