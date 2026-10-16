jest.mock('../../src/config/db', () => ({ pool: {} }));

const express = require('express');
const request = require('supertest');
const Posting = require('../../src/services/InventoryPostingService');
const Controller = require('../../src/controllers/business/finance/financeEnhancementController');
const { desensitizeSensitiveResponse } = require('../../src/middleware/priceAccessControl');

function app(permissions = ['finance:inventory:view']) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, res, next) => {
    req.user = { id: 9, username: 'finance-reviewer' };
    req.userPermissions = permissions;
    next();
  });
  instance.use(desensitizeSensitiveResponse());
  instance.get('/postings', Controller.listInventoryPostings);
  instance.get('/postings/by-source', Controller.getInventoryPostingApprovalBySource);
  instance.get('/postings/:id', Controller.getInventoryPosting);
  instance.post('/postings/:id/approve', Controller.approveInventoryPosting);
  instance.post('/postings/:id/reject', Controller.rejectInventoryPosting);
  instance.post('/postings/:id/reverse', Controller.reverseInventoryPosting);
  return instance;
}

afterEach(() => jest.restoreAllMocks());

test.each(['12junk', '1e2', '-12', '0', '12.1', '9007199254740993'])(
  'malformed posting ID %s never reaches a read or financial mutation',
  async (id) => {
    const methods = ['get', 'approve', 'reject', 'reverse'].map((name) => jest.spyOn(Posting, name));
    const api = app();
    await request(api).get(`/postings/${id}`).expect(400);
    for (const action of ['approve', 'reject', 'reverse']) {
      await request(api).post(`/postings/${id}/${action}`).send({ remark: '数量有误' }).expect(400);
    }
    methods.forEach((method) => expect(method).not.toHaveBeenCalled());
  }
);

test.each([
  {},
  { sourceType: 'inbound' },
  { sourceType: 'inbound', sourceId: '12junk' },
  { sourceType: ['inbound', 'outbound'], sourceId: '12' },
  { sourceType: 'inbound', sourceId: '12', source_id: '13' },
  { sourceType: 'inbound', sourceId: '0', sourceNo: 'IN-1' },
])('invalid source filters do not query approval history: %j', async (query) => {
  const lookup = jest.spyOn(Posting, 'getApprovalBySource');
  await request(app()).get('/postings/by-source').query(query).expect(400);
  expect(lookup).not.toHaveBeenCalled();
});

test.each([
  { financeStatus: 'total' },
  { financeStatus: ['pending', 'approved'] },
  { keyword: { value: 'IN-1' } },
  { page: '2junk' },
])('invalid list filters cannot produce misleading totals: %j', async (query) => {
  const list = jest.spyOn(Posting, 'list');
  await request(app()).get('/postings').query(query).expect(400);
  expect(list).not.toHaveBeenCalled();
});

test('source aliases are normalized before lookup', async () => {
  const lookup = jest.spyOn(Posting, 'getApprovalBySource').mockResolvedValue({ postings: [], events: [] });
  await request(app()).get('/postings/by-source')
    .query({ source_type: 'inbound', source_id: '12', source_no: 'IN-12' }).expect(200);
  expect(lookup).toHaveBeenCalledWith({ sourceType: 'inbound', sourceId: 12, sourceNo: 'IN-12' });
});

test.each([false, true])('frozen JSON and actual posted value obey price permissions (allowed: %s)', async (allowed) => {
  const snapshot = JSON.stringify({ materialId: 3, unitCost: 123.45, totalValue: 246.9 });
  const detail = {
    id: 12,
    lines: [{ id: 1, unit_cost: 123.45, total_value: 246.9, posted_value: 247.1, payload_json: snapshot }],
    events: [{ event_type: 'finance_approved', event_data: JSON.stringify({ totalValue: 247.1, sourceNo: 'IN-12' }) }],
  };
  const get = jest.spyOn(Posting, 'get').mockResolvedValue(detail);
  const response = await request(app(allowed ? ['finance:inventory:view', 'finance:price:view'] : undefined))
    .get('/postings/12').expect(200);
  expect(get).toHaveBeenCalledWith(12);
  const line = response.body.data.lines[0];
  expect(line.unitCost).toBe(allowed ? 123.45 : '***');
  expect(line.postedValue).toBe(allowed ? 247.1 : '***');
  expect(line.payloadJson).toEqual({ materialId: 3, unitCost: allowed ? 123.45 : '***', totalValue: allowed ? 246.9 : '***' });
  expect(response.body.data.events[0].eventData).toEqual({ totalValue: allowed ? 247.1 : '***', sourceNo: 'IN-12' });
  expect(detail.lines[0].payload_json).toBe(snapshot);
  expect(detail.lines[0].posted_value).toBe(247.1);
});

test('invalid serialized metadata is never returned as an unmasked raw string', async () => {
  jest.spyOn(Posting, 'get').mockResolvedValue({
    id: 12, lines: [{ payload_json: 'unitCost:123.45' }], events: [{ event_data: '"totalValue:247.1"' }],
  });
  const response = await request(app()).get('/postings/12').expect(200);
  expect(response.body.data.lines[0].payloadJson).toBeNull();
  expect(response.body.data.events[0].eventData).toBeNull();
  expect(JSON.stringify(response.body)).not.toContain('123.45');
});
