const release = require('../../src/services/business/FinalInspectionReleaseService');

const inbound = { id: 1, inbound_type: 'production', inspection_id: 7, inspection_no: 'FQC-7' };
const line = (quantity) => ({ quantity, material_id: 9, batch_number: 'B-7' });
function fixture({ qualified = 90, rejected = 10, concessions = [], allocated = [], status = 'partial' } = {}) {
  return { query: jest.fn(async (sql) => {
    if (sql.includes('FROM production_tasks')) return [[{ id: 8, status: 'warehousing', product_id: 9, completed_quantity: 100 }]];
    if (sql.includes('FROM production_processes') || sql.includes("inspection_type IN ('first_article'")) return [[]];
    if (sql.includes('FROM quality_inspections')) return [[{ id: 7, inspection_type: 'final', status,
      quantity: qualified + rejected, qualified_quantity: qualified, unqualified_quantity: rejected,
      task_id: 8, product_id: 9, batch_no: 'B-7' }]];
    if (sql.includes('FROM nonconforming_products')) return [concessions];
    if (sql.includes('FROM inventory_inbound')) return [allocated.map(quantity => ({ quantity }))];
    throw new Error(`Unexpected query: ${sql}`);
  }) };
}
test('accepts 90 qualified and blocks the unapproved ten', async () => {
  await expect(release.validate(fixture(), inbound, [line(90)])).resolves.toBeUndefined();
  await expect(release.validate(fixture(), inbound, [line(100)])).rejects.toThrow('数量 90');
});
test('approved ten permits a combined 100 or remaining 10 after the first 90', async () => {
  const concessions = [{ quantity: 10, handled_quantity: 10 }];
  await expect(release.validate(fixture({ concessions }), inbound, [line(100)])).resolves.toBeUndefined();
  await expect(release.validate(fixture({ concessions, allocated: [90] }), inbound, [line(10)])).resolves.toBeUndefined();
  await expect(release.validate(fixture({ concessions, allocated: [90] }), inbound, [line(11)])).rejects.toThrow('数量 100');
});
test('repaired ten is released by its separate inspection', async () => {
  await expect(release.validate(fixture({ qualified: 10, rejected: 0, status: 'passed' }), inbound, [line(10)])).resolves.toBeUndefined();
});
test('all failed requires concession before any stock can enter', async () => {
  await expect(release.validate(fixture({ qualified: 0, rejected: 100, status: 'failed' }), inbound, [line(100)])).rejects.toThrow('数量 0');
  await expect(release.validate(fixture({ qualified: 0, rejected: 100, status: 'failed',
    concessions: [{ quantity: 100, handled_quantity: 100 }] }), inbound, [line(100)])).resolves.toBeUndefined();
});
test.each([{ material_id: 8 }, { batch_number: 'OTHER' }, { quantity: NaN }, { quantity: -1 }])('rejects invalid source evidence %j', async change => {
  await expect(release.validate(fixture(), inbound, [{ ...line(90), ...change }])).rejects.toThrow();
});
test('cannot reuse allowance reserved by another active inbound', async () => {
  await expect(release.validate(fixture({ allocated: [90] }), inbound, [line(90)])).rejects.toThrow('数量 90');
});
test('does not allow concession exceeding original defects', async () => {
  await expect(release.validate(fixture({ concessions: [{ quantity: 11, handled_quantity: 11 }] }), inbound, [line(100)])).rejects.toThrow('原检验不合格数量');
});
test('unrelated inbound types retain their existing workflow', async () => {
  const connection = fixture();
  await release.validate(connection, { inbound_type: 'production_return' }, [line(10)]);
  expect(connection.query).not.toHaveBeenCalled();
});
