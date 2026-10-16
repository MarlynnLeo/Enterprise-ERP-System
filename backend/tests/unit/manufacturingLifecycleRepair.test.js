/* global beforeEach, describe, expect, jest, test */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const lifecycle = require('../../src/services/business/TaskLifecycleService');
const BusinessError = require('../../src/utils/BusinessError');
const {
  assertTaskQualityReleased,
} = require('../../src/services/business/ProductionQualityHoldService');
const fieldMap = require('../../src/utils/fieldMap');
const logger = { info() {}, error() {}, warn() {} };
const response = {
  success(res, data, message, status = 200) {
    Object.assign(res, { status, data, message });
  },
  error(res, message, code, status = 500) {
    Object.assign(res, { status, message, code });
  },
};

// Execute actual controllers with only their exercised dependencies. Unexpected
// database imports are never allowed to reach the application's real config.
function controller(file, replacements) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src', file), 'utf8');
  const req = (name) => {
    for (const [suffix, value] of Object.entries(replacements))
      if (name.endsWith(suffix)) return value;
    if (name.endsWith('/responseHandler')) return { ResponseHandler: response };
    if (name.endsWith('/logger')) return { logger };
    if (name.endsWith('/BusinessError')) return BusinessError;
    if (name.endsWith('/fieldMap')) return fieldMap;
    if (name.endsWith('/TaskLifecycleService')) return lifecycle;
    if (name.endsWith('/ScopeGuard')) return { denyUnlessAccess: async () => true };
    if (name.endsWith('/businessConfig')) return require('../../src/config/businessConfig');
    if (name.endsWith('/systemConstants')) return require('../../src/constants/systemConstants');
    if (name.endsWith('/statusMapper')) return require('../../src/utils/statusMapper');
    if (name.endsWith('/qualityFieldMap'))
      return require('../../src/utils/quality/qualityFieldMap');
    if (name.endsWith('/errorHandler'))
      return {
        handleError: (res, error) =>
          response.error(res, error.message, error.errorCode, error.httpStatus || 500),
      };
    if (name.endsWith('/db')) throw new Error('Unmocked database import');
    return {};
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date })(
    req,
    module,
    module.exports
  );
  return module.exports;
}

const released = (extra = {}) => ({
  id: 9,
  inspection_type: 'first_article',
  status: 'passed',
  first_article_result: 'passed',
  production_can_continue: 1,
  inspector_id: 3,
  actual_date: '2026-10-15',
  quantity: 1,
  ...extra,
});
const failed = (extra = {}) =>
  released({
    status: 'failed',
    first_article_result: 'failed',
    production_can_continue: 0,
    unqualified_quantity: 1,
    ...extra,
  });
const pending = () => ({
  id: 9,
  status: 'pending',
  first_article_result: 'pending',
  production_can_continue: 0,
});
function fixture(status, inspections = [], extra = {}) {
  const task = { id: 42, code: 'TASK-42', plan_id: null, status, ...extra };
  const reworkEvidence = [];
  let original;
  const connection = {
    beginTransaction: jest.fn(async () => {
      original = { ...task };
    }),
    commit: jest.fn(),
    rollback: jest.fn(async () => Object.assign(task, original)),
    release: jest.fn(),
    query: jest.fn(async (sql, params) => {
      if (/FROM production_tasks/.test(sql)) return [[{ ...task }]];
      if (/inspection_type IN \('first_article', 'process'\)/.test(sql)) {
        return [
          inspections.filter((row) => !['passed', 'completed', 'cancelled'].includes(row.status)),
        ];
      }
      if (/FROM quality_inspections/.test(sql)) return [inspections];
      if (/FROM nonconforming_products/.test(sql)) return [reworkEvidence];
      if (/UPDATE production_tasks SET status = \?/.test(sql)) {
        task.status = params[0];
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
  const ensure = jest.fn(async () => ({}));
  const taskController = controller('controllers/business/production/taskController.js', {
    '/db': { pool: { getConnection: async () => connection } },
    '/ProductionQualityInspectionService': { ensureTaskQualityInspections: ensure },
  });
  const put = async (target) => {
    const res = {};
    await taskController.updateProductionTaskStatus(
      { params: { id: 42 }, body: { status: target }, user: { id: 3 } },
      res
    );
    return res;
  };
  return { task, connection, put, ensure, reworkEvidence };
}

beforeEach(() => jest.clearAllMocks());
describe('MF-02 release through an explicitly linked rework inspection', () => {
  const linkedRework = (extra = {}) => ({
    source_inspection_id: 9,
    ncp_id: 100,
    ncp_quantity: 1,
    ncp_status: 'processing',
    rework_id: 200,
    rework_status: 'completed',
    rework_quantity: 1,
    reinspection_id: 10,
    ...extra,
  });
  const held = (inspections = [failed(), released({ id: 10 })]) =>
    fixture('paused', inspections, { pause_reason: '首检不合格，自动暂停生产' });

  test('completed rework with a released successor resumes without erasing original failed evidence', async () => {
    const original = failed();
    const f = held([original, released({ id: 10 })]);
    f.reworkEvidence.push(linkedRework());
    expect(await f.put('in_progress')).toMatchObject({ status: 200 });
    expect(f.task.status).toBe('in_progress');
    expect(original.first_article_result).toBe('failed');
    const [sql, params] = f.connection.query.mock.calls.find(([query]) =>
      /FROM nonconforming_products/.test(query)
    );
    expect(sql).toContain("dl.source_type = 'rework_task'");
    expect(sql).toContain("dl.target_type = 'quality_inspection'");
    expect(sql).not.toContain('FOR UPDATE');
    expect(params).toEqual([[9]]);
  });

  test.each(['pending', 'in_progress', 'cancelled'])(
    'unfinished or cancelled rework %s cannot release the failure',
    async (status) => {
      const f = held();
      f.reworkEvidence.push(linkedRework({ rework_status: status }));
      expect(await f.put('in_progress')).toMatchObject({
        status: 400,
        code: 'QUALITY_RELEASE_REQUIRED',
      });
    }
  );

  test.each(
    [[], [linkedRework({ reinspection_id: null })], [linkedRework({ reinspection_id: 999 })]].map(
      (rows) => [rows]
    )
  )('a passed label without the exact same-task rework link cannot release: %j', async (rows) => {
    const f = held();
    f.reworkEvidence.push(...rows);
    expect(await f.put('in_progress')).toMatchObject({
      status: 400,
      code: 'QUALITY_RELEASE_REQUIRED',
    });
  });

  test('repairing one failure leaves an independent second failure blocked', async () => {
    const f = held([failed(), released({ id: 10 }), failed({ id: 11 })]);
    f.reworkEvidence.push(linkedRework());
    expect(await f.put('in_progress')).toMatchObject({
      status: 400,
      code: 'QUALITY_RELEASE_REQUIRED',
    });
  });

  test('partial rework and undersized passed samples do not cover the original failed quantity', async () => {
    const f = held([failed({ quantity: 2, unqualified_quantity: 2 }), released({ id: 10 })]);
    f.reworkEvidence.push(linkedRework({ ncp_quantity: 2 }));
    expect(await f.put('in_progress')).toMatchObject({ status: 400 });
    f.reworkEvidence[0].rework_quantity = 2;
    expect(await f.put('in_progress')).toMatchObject({ status: 400 });
  });

  test('every split rework must complete and release its own full quantity', async () => {
    const f = held([
      failed({ quantity: 2, unqualified_quantity: 2 }),
      released({ id: 10 }),
      released({ id: 11 }),
    ]);
    f.reworkEvidence.push(
      linkedRework({ ncp_quantity: 2 }),
      linkedRework({
        ncp_quantity: 2,
        rework_id: 201,
        rework_status: 'in_progress',
        reinspection_id: 11,
      })
    );
    expect(await f.put('in_progress')).toMatchObject({ status: 400 });
    f.reworkEvidence[1].rework_status = 'completed';
    expect(await f.put('in_progress')).toMatchObject({ status: 200 });
  });

  test('a second failed reinspection can be closed by its own completed rework chain', async () => {
    const f = held([failed(), failed({ id: 10 }), released({ id: 11 })]);
    f.reworkEvidence.push(
      linkedRework(),
      linkedRework({ source_inspection_id: 10, ncp_id: 101, rework_id: 201, reinspection_id: 11 })
    );
    expect(await f.put('in_progress')).toMatchObject({ status: 200 });
  });

  test('the original failed article does not block final inspection after its rework release', async () => {
    const f = fixture('in_progress', [failed(), released({ id: 10 })]);
    f.reworkEvidence.push(linkedRework());
    expect(await lifecycle.promoteTaskToInspection(f.connection, 42)).toMatchObject({
      promoted: true,
      status: 'inspection',
    });
  });

  test('documented conditional release also allows first-article closure', async () => {
    const f = fixture('in_progress', [
      released({
        status: 'partial',
        first_article_result: 'conditional',
        note: '复核后限条件生产',
      }),
    ]);
    expect(await lifecycle.promoteTaskToInspection(f.connection, 42)).toMatchObject({
      promoted: true,
    });
  });

  test('rework release never clears an independent pending process inspection', async () => {
    const f = fixture('in_progress', [
      failed(),
      released({ id: 10 }),
      { id: 11, inspection_type: 'process', status: 'pending' },
    ]);
    f.reworkEvidence.push(linkedRework());
    await expect(lifecycle.promoteTaskToInspection(f.connection, 42)).rejects.toMatchObject({
      code: 'OPEN_INSPECTIONS',
    });
    expect(f.task.status).toBe('in_progress');
  });

  test('cyclic links and reuse of one passed inspection cannot fabricate release', async () => {
    const cycle = held([failed(), failed({ id: 10 }), released({ id: 11 })]);
    cycle.reworkEvidence.push(
      linkedRework(),
      linkedRework({ source_inspection_id: 10, ncp_id: 101, rework_id: 201, reinspection_id: 9 })
    );
    expect(await cycle.put('in_progress')).toMatchObject({ status: 400 });
    const reused = held([
      failed({ quantity: 2, unqualified_quantity: 2 }),
      released({ id: 10, quantity: 2 }),
    ]);
    reused.reworkEvidence.push(
      linkedRework({ ncp_quantity: 2 }),
      linkedRework({ ncp_quantity: 2, rework_id: 201 })
    );
    expect(await reused.put('in_progress')).toMatchObject({ status: 400 });
  });
});

describe('MF-01 warehouse driven task material status', () => {
  test.each(['material_partial_issued', 'material_issued'])(
    'generic PUT refuses %s before any write',
    async (target) => {
      const f = fixture('pending');
      expect(await f.put(target)).toMatchObject({ status: 400, code: 'MATERIAL_ISSUE_REQUIRED' });
      expect(f.task.status).toBe('pending');
      expect(f.connection.commit).not.toHaveBeenCalled();
      expect(f.connection.query.mock.calls.some(([sql]) => /^\s*UPDATE/.test(sql))).toBe(false);
    }
  );
  test.each(['material_partial_issued', 'material_issued'])(
    'warehouse lifecycle may still set %s',
    async (target) => {
      const f = fixture('preparing');
      await lifecycle.promoteTaskStatus(f.connection, 42, target);
      expect(f.task.status).toBe(target);
    }
  );
});

describe('MF-02 quality stop and release across task entry points', () => {
  test.each([
    ['failed', [failed()]],
    ['reinspection pending', [pending()]],
    ['missing hold evidence', []],
    [
      'conditional without approval',
      [
        released({
          status: 'partial',
          first_article_result: 'conditional',
          production_can_continue: 0,
        }),
      ],
    ],
    [
      'conditional without reason',
      [released({ status: 'partial', first_article_result: 'conditional' })],
    ],
    [
      'conditional without inspector',
      [
        released({
          status: 'partial',
          first_article_result: 'conditional',
          note: '逐件复核',
          inspector_id: null,
        }),
      ],
    ],
    [
      'conditional without inspection date',
      [
        released({
          status: 'partial',
          first_article_result: 'conditional',
          note: '逐件复核',
          actual_date: null,
        }),
      ],
    ],
  ])('%s cannot resume a quality-paused task', async (_label, inspections) => {
    const f = fixture('paused', inspections, { pause_reason: '首检不合格，自动暂停生产' });
    expect(await f.put('in_progress')).toMatchObject({
      status: 400,
      code: 'QUALITY_RELEASE_REQUIRED',
    });
    expect(f.task.status).toBe('paused');
    expect(f.connection.commit).not.toHaveBeenCalled();
    expect(f.ensure).not.toHaveBeenCalled();
  });
  test.each(['direct', 'generic service', 'automatic path'])(
    '%s rejects failed evidence even without a pause reason',
    async (entry) => {
      const f = fixture('paused', [failed()]);
      const run =
        entry === 'direct'
          ? lifecycle.promoteTaskToInProgress(f.connection, 42)
          : entry === 'generic service'
            ? lifecycle.promoteTaskStatus(f.connection, 42, 'in_progress')
            : lifecycle.promoteTaskToward(f.connection, 42, 'in_progress');
      await expect(run).rejects.toMatchObject({ code: 'QUALITY_RELEASE_REQUIRED' });
      expect(f.task.status).toBe('paused');
    }
  );
  test.each(['material_issued', 'material_partial_issued'])(
    'first sample start from %s creates inspections',
    async (status) => {
      const f = fixture(status);
      expect(await f.put('in_progress')).toMatchObject({ status: 200 });
      expect(f.ensure).toHaveBeenCalledWith(f.connection, 42);
      expect(f.task.status).toBe('in_progress');
    }
  );
  test('manual pause during the initial pending first sample can resume', async () => {
    const f = fixture('paused', [pending()], { pause_reason: '换班暂停' });
    expect(await f.put('in_progress')).toMatchObject({ status: 200 });
  });
  test.each([
    released(),
    released({ status: 'partial', first_article_result: 'conditional', note: '逐件复核后继续' }),
  ])('documented quality release allows resume: %j', async (inspection) => {
    const f = fixture('paused', [inspection], { pause_reason: '首检不合格，自动暂停生产' });
    expect(await f.put('in_progress')).toMatchObject({ status: 200 });
    expect(f.connection.commit).toHaveBeenCalledTimes(1);
  });
  test('one passed article cannot hide a second failed article', async () => {
    const f = fixture('paused', [released({ id: 10 }), failed()]);
    await expect(assertTaskQualityReleased(f.connection, f.task)).rejects.toMatchObject({
      code: 'QUALITY_RELEASE_REQUIRED',
    });
  });
  test('a passed label without production release cannot resume a manual pause', async () => {
    const f = fixture('paused', [released({ production_can_continue: 0 })], {
      pause_reason: '换班',
    });
    expect(await f.put('in_progress')).toMatchObject({
      status: 400,
      code: 'QUALITY_RELEASE_REQUIRED',
    });
  });
  test('generic service retains its caller source-status restriction', async () => {
    const f = fixture('paused', [released()]);
    await expect(
      lifecycle.promoteTaskStatus(f.connection, 42, 'in_progress', {
        onlyFrom: ['material_issued'],
      })
    ).resolves.toMatchObject({ promoted: false, reason: 'source_not_allowed' });
    expect(f.task.status).toBe('paused');
  });
  test('a task already in progress cannot use a no-op start to ignore failed evidence', async () => {
    const f = fixture('in_progress', [failed()]);
    await expect(lifecycle.promoteTaskToInProgress(f.connection, 42)).rejects.toMatchObject({
      code: 'QUALITY_RELEASE_REQUIRED',
    });
  });
  test.each([
    ['pending', 'in_progress'],
    ['in_progress', 'completed'],
  ])('process %s to %s uses the same quality gate before writing', async (status, target) => {
    const f = fixture('in_progress', [failed()]);
    const process = { id: 7, task_id: 42, status };
    const originalQuery = f.connection.query.getMockImplementation();
    f.connection.query.mockImplementation(async (sql, params) => {
      if (/FROM production_processes/.test(sql)) return [[process]];
      return originalQuery(sql, params);
    });
    const service = controller('services/business/ProductProcessExecutionService.js', {
      '/ProductionQualityHoldService': { assertTaskQualityReleased },
    });
    await expect(service.update(f.connection, 7, { status: target })).rejects.toMatchObject({
      code: 'QUALITY_RELEASE_REQUIRED',
    });
    expect(f.connection.query.mock.calls.some(([sql]) => /^\s*UPDATE/.test(sql))).toBe(false);
  });
});

describe('first article dedicated release transaction', () => {
  function qualityFixture(extraInspections = []) {
    const f = fixture('paused', [], { pause_reason: '首检不合格，自动暂停生产' });
    const inspection = { ...failed(), task_id: 42, reference_id: 42, quantity: 1 };
    f.connection.query.mockImplementation(async (sql, params) => {
      if (/FROM production_tasks/.test(sql)) return [[{ ...f.task }]];
      if (/FROM quality_inspections/.test(sql)) return [[inspection, ...extraInspections]];
      if (/FROM nonconforming_products/.test(sql)) return [f.reworkEvidence];
      if (/UPDATE quality_inspections/.test(sql)) {
        Object.assign(inspection, {
          first_article_result: params[0],
          production_can_continue: params[3],
          inspector_id: params[4],
          note: params[6],
          status: params[7],
          actual_date: '2026-10-15',
        });
        return [{ affectedRows: 1 }];
      }
      if (/SET status = 'paused'/.test(sql)) {
        f.task.status = 'paused';
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE production_tasks SET status = \?/.test(sql)) {
        f.task.status = params[0];
        return [{ affectedRows: 1 }];
      }
      if (/SET pause_reason = NULL/.test(sql)) {
        f.task.pause_reason = null;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const first = controller('controllers/business/quality/firstArticleController.js', {
      '/db': { pool: { getConnection: async () => f.connection } },
      '/qualityInspection': {
        _getStoredInspectionItems: async () => [],
        _validateTerminalStatusAgainstItems() {},
      },
      '/InspectionClosureService': { closeIfTerminal: async () => ({}) },
      '/InspectionSamplingService': { shouldRefresh: () => false, assertReadyForCompletion() {} },
    });
    const submit = async (body) => {
      const res = {};
      await first.updateFirstArticleResult(
        {
          params: { id: 9 },
          user: { id: 3 },
          body: { qualifiedQuantity: 1, unqualifiedQuantity: 0, ...body },
        },
        res
      );
      return res;
    };
    return { ...f, inspection, submit };
  }
  test('quality release locks the task first and uses the shared gate to resume', async () => {
    const f = qualityFixture();
    expect(await f.submit({ firstArticleResult: 'passed', inspectorId: 999 })).toMatchObject({
      status: 200,
    });
    expect(f.task.status).toBe('in_progress');
    expect(f.inspection.inspector_id).toBe(3);
    const locks = f.connection.query.mock.calls.filter(([sql]) => /FOR UPDATE/.test(sql));
    expect(locks[0][0]).toContain('FROM production_tasks');
    expect(locks[1][0]).toContain('FROM quality_inspections');
  });
  test('passing one article persists the result while another hold keeps production paused', async () => {
    const f = qualityFixture([failed({ id: 10 })]);
    expect(await f.submit({ firstArticleResult: 'passed' })).toMatchObject({ status: 200 });
    expect(f.task.status).toBe('paused');
    expect(f.connection.commit).toHaveBeenCalledTimes(1);
  });
  test('passing the linked rework inspection automatically releases its original failure', async () => {
    const f = qualityFixture([failed({ id: 10 })]);
    f.reworkEvidence.push({
      source_inspection_id: 10,
      ncp_id: 100,
      ncp_quantity: 1,
      ncp_status: 'processing',
      rework_id: 200,
      rework_status: 'completed',
      rework_quantity: 1,
      reinspection_id: 9,
    });
    expect(await f.submit({ firstArticleResult: 'passed' })).toMatchObject({ status: 200 });
    expect(f.task.status).toBe('in_progress');
    expect(f.connection.commit).toHaveBeenCalledTimes(1);
  });
  test.each([false, 'false', '0'])(
    'false release input %j cannot resume production',
    async (productionCanContinue) => {
      const f = qualityFixture();
      expect(
        await f.submit({ firstArticleResult: 'conditional', productionCanContinue })
      ).toMatchObject({ status: 200 });
      expect(f.task.status).toBe('paused');
    }
  );
  test('conditional release requires a reason and stores it with authenticated actor', async () => {
    const f = qualityFixture();
    expect(
      await f.submit({ firstArticleResult: 'conditional', productionCanContinue: true })
    ).toMatchObject({ status: 400 });
    expect(f.connection.commit).not.toHaveBeenCalled();
    expect(
      await f.submit({
        firstArticleResult: 'conditional',
        productionCanContinue: true,
        note: '逐件复核',
        inspectorId: 999,
      })
    ).toMatchObject({ status: 200 });
    expect(f.task.status).toBe('in_progress');
    expect(f.inspection).toMatchObject({ inspector_id: 3, note: '逐件复核' });
  });
});
