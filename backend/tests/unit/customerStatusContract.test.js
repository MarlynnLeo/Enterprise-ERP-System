jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));
jest.mock('../../src/utils/softDelete', () => ({ softDelete: jest.fn() }));

const { pool } = require('../../src/config/db');
const customerService = require('../../src/services/customerService');

describe('customer enabled status at service boundaries', () => {
  it.each([
    ['active', 1], ['inactive', 0], ['1', 1], ['0', 0], [1, 1], [0, 0],
  ])('queries %s using the numeric database status %s', async (status, expected) => {
    pool.query.mockResolvedValueOnce([[{ total: 1 }]]).mockResolvedValueOnce([[{ id: 4, status: expected }]]);
    const result = await customerService.getAllCustomers(1, 10, { status });
    expect(pool.query.mock.calls[0][1]).toEqual([expected]);
    expect(pool.query.mock.calls[1][1]).toEqual([expected]);
    expect(result.items).toEqual([{ id: 4, status: expected }]);
  });

  it.each([['active', 1], ['inactive', 0]])('creates %s customers without writing text to the numeric status column', async (status, expected) => {
    pool.query.mockResolvedValueOnce([{ insertId: 4 }]).mockResolvedValueOnce([[{ id: 4, status: expected }]]);
    await customerService.createCustomer({ code: 'CUSTOMER-4', name: 'Test customer', status });
    expect(pool.query.mock.calls[0][1][7]).toBe(expected);
  });

  it.each([['active', 1], ['inactive', 0]])('updates %s without changing other customer fields', async (status, expected) => {
    pool.query.mockResolvedValueOnce([[{ id: 4, status: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 4, status: expected }]]);
    await customerService.updateCustomer(4, { status });
    expect(pool.query.mock.calls[1][1]).toEqual([expected, 4]);
  });
});
