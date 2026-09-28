/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

const { pool } = require('../../src/config/db');
const AqlController = require('../../src/controllers/business/quality/aqlController');
const AqlService = require('../../src/services/quality/aqlService');

const samplingRule = {
  aql_standard_id: 12,
  sample_size: 200,
  accept_limit: 5,
  reject_limit: 6,
  code: 'AQL-1.0-3201-10000',
  name: 'AQL 1.0 3201-10000',
};

const createResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe('AQL sampling lookup', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    pool.query.mockImplementation(async (sql, [level, lowerBatch, upperBatch]) => {
      expect(sql).toMatch(/status = 'active'/);
      expect(sql).toMatch(/aql_level = \?/);
      expect(sql).toMatch(/batch_min <= \?/);
      expect(sql).toMatch(/batch_max >= \?/);

      const matches = Number(level) === 1 && lowerBatch >= 3201 && upperBatch <= 10000;
      return [matches ? [{ ...samplingRule }] : []];
    });
  });

  test('matches the inclusive upper batch boundary and preserves sampling limits', async () => {
    const res = createResponse();

    await AqlController.calculateSampling({ body: { batchSize: 10000, aqlLevel: '1.0' } }, res);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1]).toEqual(['1.0', 10000, 10000]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: {
          matched: true,
          data: {
            aqlStandardId: 12,
            sampleSize: 200,
            acceptLimit: 5,
            rejectLimit: 6,
            code: samplingRule.code,
            name: samplingRule.name,
          },
        },
      })
    );
  });

  test.each([10001, 30000])(
    'returns a normal no-match result for batch %s without fallback',
    async (batchSize) => {
      const res = createResponse();

      await AqlController.calculateSampling({ body: { batchSize, aqlLevel: '1.0' } }, res);

      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(pool.query.mock.calls[0][1]).toEqual(['1.0', batchSize, batchSize]);
      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(true);
      expect(body.data.matched).toBe(false);
      expect(body.data).not.toHaveProperty('data');
      expect(body.data.message).toContain(String(batchSize));
      expect(body.data.message).toContain('AQL 1.0');
      expect(body.data.message).toContain('AQL 抽样标准库');
      expect(body.message).toBe(body.data.message);
    }
  );

  test('does not substitute another AQL level when its batch range exists', async () => {
    const result = await AqlService.calculate(10000, '2.5');

    expect(result.matched).toBe(false);
    expect(result.message).toContain('AQL 2.5');
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1]).toEqual(['2.5', 10000, 10000]);
  });

  test('accepts numeric strings and numeric AQL values', async () => {
    const res = createResponse();

    await AqlController.calculateSampling({ body: { batchSize: '10000', aqlLevel: 1 } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.matched).toBe(true);
    expect(pool.query.mock.calls[0][1]).toEqual(['1', 10000, 10000]);
  });

  test.each([
    undefined,
    null,
    '',
    '   ',
    0,
    '0',
    -1,
    '-1',
    1.5,
    NaN,
    Infinity,
    'Infinity',
    'invalid',
    true,
    false,
    [],
    [1],
    {},
  ])('rejects invalid batch size %p before querying standards', async (batchSize) => {
    const res = createResponse();

    await AqlController.calculateSampling({ body: { batchSize, aqlLevel: '1.0' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].errorCode).toBe('VALIDATION_ERROR');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test.each([
    undefined,
    null,
    '',
    '   ',
    0,
    -1,
    NaN,
    Infinity,
    'Infinity',
    'GB/T 2828.1 II',
    true,
    [1],
    {},
  ])('rejects invalid AQL level %p before querying standards', async (aqlLevel) => {
    const res = createResponse();

    await AqlController.calculateSampling({ body: { batchSize: 10000, aqlLevel } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].errorCode).toBe('VALIDATION_ERROR');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('keeps database failures as server errors rather than no-match results', async () => {
    pool.query.mockRejectedValueOnce(new Error('database unavailable'));
    const res = createResponse();

    await AqlController.calculateSampling({ body: { batchSize: 10000, aqlLevel: '1.0' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toEqual(
      expect.objectContaining({ success: false, errorCode: 'SERVER_ERROR' })
    );
  });

  test('rejects overlapping matches instead of choosing whichever row arrives first', async () => {
    pool.query.mockResolvedValueOnce([
      [{ ...samplingRule }, { ...samplingRule, aql_standard_id: 13, sample_size: 125 }],
    ]);
    const res = createResponse();
    await AqlController.calculateSampling({ body: { batchSize: 4000, aqlLevel: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].errorCode).toBe('AQL_RULE_CONFLICT');
  });

  test('rejects a corrupt rule before it becomes a matched sampling plan', async () => {
    pool.query.mockResolvedValueOnce([[{ ...samplingRule, accept_limit: 200, reject_limit: 201 }]]);
    const res = createResponse();
    await AqlController.calculateSampling({ body: { batchSize: 4000, aqlLevel: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('validates the stored sample size before capping it to a small batch', async () => {
    pool.query.mockResolvedValueOnce([
      [{ ...samplingRule, sample_size: 5.5, accept_limit: 0, reject_limit: 1 }],
    ]);
    const res = createResponse();
    await AqlController.calculateSampling({ body: { batchSize: 1, aqlLevel: 2.5 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('uses an explicit one-unit rule before the first GB/T range', async () => {
    pool.query.mockResolvedValueOnce([
      [{ ...samplingRule, sample_size: 1, accept_limit: 0, reject_limit: 1 }],
    ]);
    const result = await AqlService.calculate(1, 2.5);
    expect(result.data.sample_size).toBe(1);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1]).toEqual([2.5, 1, 1]);
  });

  test('uses the first GB/T range for a one-unit batch only when its own range is absent', async () => {
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [{ ...samplingRule, sample_size: 5, accept_limit: 0, reject_limit: 1 }],
      ]);
    const result = await AqlService.calculate(1, 2.5);
    expect(result.data.sample_size).toBe(1);
    expect(pool.query.mock.calls.map(([, values]) => values)).toEqual([
      [2.5, 1, 1],
      [2.5, 2, 2],
    ]);
  });
});
