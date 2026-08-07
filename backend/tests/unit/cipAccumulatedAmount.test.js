/**
 * CIP 归集成本：禁止经白名单 update 写累计；必须原子 addAccumulatedAmount
 */

jest.mock('../../src/config/db', () => {
  const conn = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    query: jest.fn(),
  };
  return {
    pool: {
      getConnection: jest.fn().mockResolvedValue(conn),
      query: jest.fn(),
    },
    __mockConn: conn,
  };
});

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const db = require('../../src/config/db');
const cipModel = require('../../src/models/cip');

describe('cipModel accumulated amount', () => {
  const conn = db.__mockConn;

  beforeEach(() => {
    jest.clearAllMocks();
    db.pool.getConnection.mockResolvedValue(conn);
  });

  describe('updateCipProject whitelist', () => {
    it('silently ignores accumulated_amount (mass-assignment guard)', async () => {
      db.pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      await cipModel.updateCipProject(1, {
        project_name: '工程A',
        accumulated_amount: 99999,
      });

      expect(db.pool.query).toHaveBeenCalled();
      const [sql, params] = db.pool.query.mock.calls[0];
      expect(sql).toContain('project_name = ?');
      expect(sql).not.toContain('accumulated_amount');
      expect(params).toEqual(['工程A', 1]);
    });

    it('returns true without writing when only forbidden fields provided', async () => {
      const ok = await cipModel.updateCipProject(1, { accumulated_amount: 100 });
      expect(ok).toBe(true);
      expect(db.pool.query).not.toHaveBeenCalled();
    });
  });

  describe('addAccumulatedAmount', () => {
    it('atomically increments under FOR UPDATE and returns new total', async () => {
      conn.query
        .mockResolvedValueOnce([[{ id: 7, status: '建设中', accumulated_amount: 100 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await cipModel.addAccumulatedAmount(7, 50);

      expect(result).toEqual({ previousAmount: 100, newAmount: 150 });
      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
      expect(conn.query.mock.calls[1][0]).toMatch(/accumulated_amount\s*=\s*COALESCE/);
      expect(conn.query.mock.calls[1][1]).toEqual([50, 7]);
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    it('rejects non-positive amount', async () => {
      await expect(cipModel.addAccumulatedAmount(1, 0)).rejects.toThrow(/大于 0/);
      await expect(cipModel.addAccumulatedAmount(1, -10)).rejects.toThrow(/大于 0/);
      expect(db.pool.getConnection).not.toHaveBeenCalled();
    });

    it('rejects when project is not under construction', async () => {
      conn.query.mockResolvedValueOnce([[{ id: 1, status: '已转固', accumulated_amount: 200 }]]);

      await expect(cipModel.addAccumulatedAmount(1, 10)).rejects.toThrow(/不可附加/);
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    it('uses external connection without owning transaction', async () => {
      const external = {
        query: jest
          .fn()
          .mockResolvedValueOnce([[{ id: 3, status: '建设中', accumulated_amount: 0 }]])
          .mockResolvedValueOnce([{ affectedRows: 1 }]),
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        release: jest.fn(),
      };

      const result = await cipModel.addAccumulatedAmount(3, 25, external);
      expect(result.newAmount).toBe(25);
      expect(db.pool.getConnection).not.toHaveBeenCalled();
      expect(external.beginTransaction).not.toHaveBeenCalled();
      expect(external.commit).not.toHaveBeenCalled();
      expect(external.release).not.toHaveBeenCalled();
    });
  });
});

describe('cipController.addCost', () => {
  jest.mock('../../../src/utils/responseHandler', () => ({
    ResponseHandler: {
      success: jest.fn((res, data, msg) => ({ ok: true, data, msg })),
      error: jest.fn((res, msg, code) => ({ ok: false, msg, code })),
    },
  }), { virtual: false });
});
