const { createImportBatchNumber } = require('../../src/utils/inventoryImportBatch');

describe('import batch numbers', () => {
  it('uses the actual import timestamp in UTC+8, including milliseconds', () => {
    expect(
      createImportBatchNumber({
        importedAt: new Date('2026-09-12T08:02:33.967Z'),
        materialId: 16288,
        locationId: 1,
      })
    ).toBe('IMP-20260912160233967-16288-1');
  });

  it('uses the business date when the UTC and local dates differ', () => {
    expect(
      createImportBatchNumber({
        importedAt: new Date('2026-09-12T17:05:06.007Z'),
        materialId: 1,
        locationId: 2,
      })
    ).toBe('IMP-20260913010506007-1-2');
  });

  it('keeps different materials, locations and import times distinguishable', () => {
    const base = { importedAt: new Date('2026-09-12T08:02:33.967Z'), materialId: 1, locationId: 1 };
    const batches = [
      base,
      { ...base, materialId: 2 },
      { ...base, locationId: 2 },
      { ...base, importedAt: new Date('2026-09-12T08:02:33.968Z') },
    ].map(createImportBatchNumber);
    expect(new Set(batches).size).toBe(4);
    expect(batches.every((batch) => batch.length <= 50)).toBe(true);
  });

  it('rejects an invalid import time', () => {
    expect(() =>
      createImportBatchNumber({
        importedAt: new Date('invalid'),
        materialId: 1,
        locationId: 2,
      })
    ).toThrow('库存导入时间无效');
  });
});
