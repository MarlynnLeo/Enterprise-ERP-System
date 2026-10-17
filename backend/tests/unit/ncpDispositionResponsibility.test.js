jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../../src/models/nonconformingProduct', () => ({ getById: jest.fn(async () => ({ id: 7, status: 'processing' })), updateDisposition: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));
const fs = require('fs');
const path = require('path');
const { validateDispositionPayload, VALID_RESPONSIBLE_PARTIES } = require('../../src/services/business/nonconformingProduct/shared');
const controller = require('../../src/controllers/business/quality/nonconformingProductController');
const model = require('../../src/models/nonconformingProduct');
const payload = extra => ({ disposition: 'rework', disposition_reason: '修复外观', responsible_party: 'internal', ...extra });
test('responsibility whitelist exactly matches persisted migration enum', () => {
  const ddl = fs.readFileSync(path.join(__dirname, '../../migrations/20260312000004_baseline_quality_tables.js'), 'utf8');
  const values = ddl.match(/responsible_party ENUM\(([^)]+)\)/)[1].split(',').map(value => value.trim().replace(/'/g, ''));
  expect(VALID_RESPONSIBLE_PARTIES).toEqual(values);
});
test.each(['production', 'quality', 'customer', ''])('invalid responsibility %s is a client validation error', responsible_party => {
  expect(() => validateDispositionPayload(payload({ responsible_party }))).toThrow();
  try { validateDispositionPayload(payload({ responsible_party })); } catch (error) { expect(error).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' }); }
});
test.each(['internal', 'unknown'])('supplier is optional for internal handling: %s', responsible_party => {
  expect(() => validateDispositionPayload(payload({ responsible_party, supplier_id: null }))).not.toThrow();
});
test.each([{ responsible_party: 'supplier' }, { disposition: 'return' }, { disposition: 'replacement', supplier_id: '0' }])('supplier-dependent disposition requires a valid supplier %j', extra => {
  expect(() => validateDispositionPayload(payload(extra))).toThrow('必须选择供应商');
});
test('controller surfaces invalid responsibility as 400 before model update', async () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.updateDisposition({ params: { id: 7 }, body: { disposition: 'rework', dispositionReason: '修复外观', responsibleParty: 'production' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json.mock.calls[0][0].message).toContain('责任方无效');
  expect(model.updateDisposition).not.toHaveBeenCalled();
});
