/**
 * production-flow-closure.test.js
 * 生产主链行为回归：齐套、缺料、装配 API、生命周期路径可达性
 * 禁止：读源码字符串断言、依赖历史脏数据扫表 = 0
 */

const { authRequest, clearCache, getApp } = require('../testHelper');
const db = require('../../src/config/db');
const {
  findTransitionPath,
  promoteTaskToward,
} = require('../../src/services/business/TaskLifecycleService');
const MaterialReadinessService = require('../../src/services/business/MaterialReadinessService');
const {
  resolveInboundFromInspection,
  INBOUND_TYPE_KEYS,
  DOCUMENT_REFERENCE_TYPES,
} = require('../../src/constants/documentReferences');

let api;

beforeAll(async () => {
  getApp();
  api = await authRequest();
});

afterAll(() => {
  clearCache();
});

describe('MaterialReadinessService 行为', () => {
  test('不存在的任务应抛错', async () => {
    await expect(MaterialReadinessService.checkByTask(999999999)).rejects.toThrow(/不存在/);
  });

  test('有任务时返回结构含 ready 布尔值；无 BOM 不得 ready=true', async () => {
    const [tasks] = await db.pool.query(
      `SELECT id FROM production_tasks WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`
    );
    if (tasks.length === 0) return;
    const result = await MaterialReadinessService.checkByTask(tasks[0].id);
    expect(typeof result.ready).toBe('boolean');
    expect(Array.isArray(result.details)).toBe(true);
    if (result.message && /无 BOM|无物料明细/.test(result.message)) {
      expect(result.ready).toBe(false);
    }
  });
});

describe('生产辅助 API', () => {
  test('物料齐套 batch 空列表', async () => {
    const res = await api
      .post('/api/production/assist/material-readiness/batch')
      .send({ taskIds: [] });
    expect(res.status).toBe(200);
  });

  test('缺料汇总接口', async () => {
    const res = await api.get('/api/production/material-shortage-summary?page=1&pageSize=5');
    expect(res.status).toBe(200);
  });

  test('装配工位列表', async () => {
    const res = await api.get('/api/production/assembly/stations');
    expect(res.status).toBe(200);
  });
});

describe('promoteTaskToward 事务内行为', () => {
  test('in_progress 任务可路径推到 warehousing 并回滚', async () => {
    const path = findTransitionPath('in_progress', 'warehousing');
    expect(path).toEqual(['inspection', 'warehousing']);

    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        `SELECT id FROM production_tasks
         WHERE deleted_at IS NULL AND status = 'in_progress'
         ORDER BY id DESC LIMIT 1`
      );
      if (rows.length === 0) {
        await connection.rollback();
        return;
      }
      const result = await promoteTaskToward(connection, rows[0].id, 'warehousing', {
        requireOpenInspectionClear: false,
        strict: false,
      });
      expect(result.status).toBe('warehousing');
      await connection.rollback();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  });

  test('pending 任务自动推进到 warehousing 应不可达', async () => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        `SELECT id FROM production_tasks
         WHERE deleted_at IS NULL AND status = 'pending'
         ORDER BY id DESC LIMIT 1`
      );
      if (rows.length === 0) {
        await connection.rollback();
        return;
      }
      const result = await promoteTaskToward(connection, rows[0].id, 'warehousing', {
        strict: false,
      });
      expect(result.promoted).toBe(false);
      expect(result.reason).toBe('unreachable');
      await connection.rollback();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  });
});

describe('resolveInboundFromInspection 与生产入库策略一致', () => {
  test('终检映射', () => {
    const meta = resolveInboundFromInspection({
      inspection_type: 'final',
      reference_id: 10,
    });
    expect(meta.inboundType).toBe(INBOUND_TYPE_KEYS.PRODUCTION);
    expect(meta.referenceType).toBe(DOCUMENT_REFERENCE_TYPES.PRODUCTION_TASK);
    expect(meta.referenceId).toBe(10);
  });
});
