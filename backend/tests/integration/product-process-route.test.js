/* global beforeAll, afterAll, describe, test, expect, jest */
const { authRequest, getApp, clearCache } = require('../testHelper');
const db = require('../../src/config/db');
const definitions = require('../../src/services/ProductProcessRouteService');
const execution = require('../../src/services/business/ProductProcessExecutionService');
const assembly = require('../../src/services/business/AssemblyExecutionService');
const verification = require('../../src/services/business/AssemblyVerificationService');
const labor = require('../../src/services/business/ProductionLaborService');
const scheduling = require('../../src/services/business/SchedulingService');
const QualityInspection = require('../../src/models/qualityInspection');
const InventoryService = require('../../src/services/InventoryService');
const InventoryPostingService = require('../../src/services/InventoryPostingService');
const InboundTransactionService = require('../../src/services/business/InboundTransactionService');
const { promoteTaskStatus } = require('../../src/services/business/TaskLifecycleService');
const taskProcesses = require('../../src/services/business/ProductProcessTaskService');

const prefix = `PM${Date.now()}`;
const fixture = { materials: [], tasks: [] };
let api;
const dataOf = (response, status = 200) => {
  if (response.status !== status) throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.body)}`);
  return response.body.data;
};

describe('统一产品工艺、任务快照与生产闭环', () => {
beforeAll(async () => {
  getApp();
  api = await authRequest();
  const [unit] = await db.pool.query('INSERT INTO units (code, name, status) VALUES (?, ?, 1)', [prefix, '件']);
  const [location] = await db.pool.query("INSERT INTO locations (code, name, type, status) VALUES (?, ?, 'warehouse', 1)", [prefix, '工艺回归仓库']);
  const [actor] = await db.pool.query("INSERT INTO users (username, password, real_name, role, status) VALUES (?, ?, ?, 'user', 1)", [prefix, 'login-disabled-test-fixture', '工艺测试财务']);
  fixture.unit = unit.insertId;
  fixture.location = location.insertId;
  fixture.financeActor = actor.insertId;
  for (const suffix of ['product', 'material']) {
    const material = { code: `${prefix}-${suffix}`, name: `工艺回归-${suffix}`, unit_id: fixture.unit, location_id: fixture.location, cost_price: 5, material_type: suffix === 'product' ? 'finished' : 'raw' };
    const [result] = await db.pool.query('INSERT INTO materials SET ?', [material]);
    fixture.materials.push(result.insertId);
  }
  [fixture.productId, fixture.materialId] = fixture.materials;
  const [station] = await db.pool.query('INSERT INTO work_stations (code, name, capacity) VALUES (?, ?, 1)', [prefix, '工艺回归工位']);
  fixture.stationId = station.insertId;
  await db.pool.query(
    "INSERT INTO overhead_allocation_config (name, allocation_base, rate, product_id, effective_date, priority, is_active) VALUES (?, 'labor_cost', 0.1, ?, '2026-01-01', 1000, 1)",
    [prefix, fixture.productId]
  );
});

afterAll(async () => {
  // The production/quality/inventory flow below rolls back its transaction.
  // Only these explicitly recorded configuration fixtures are committed.
  if (fixture.tasks.length) {
    await db.pool.query('DELETE FROM production_processes WHERE task_id IN (?)', [fixture.tasks]);
    await db.pool.query('DELETE FROM production_tasks WHERE id IN (?)', [fixture.tasks]);
  }
  if (fixture.productId) {
    await db.pool.query('DELETE d FROM process_template_details d JOIN process_templates t ON t.id = d.template_id WHERE t.product_id = ?', [fixture.productId]);
    await db.pool.query('DELETE FROM process_templates WHERE product_id = ?', [fixture.productId]);
    await db.pool.query('DELETE FROM overhead_allocation_config WHERE product_id = ?', [fixture.productId]);
  }
  if (fixture.stationId) await db.pool.query('DELETE FROM work_stations WHERE id = ?', [fixture.stationId]);
  if (fixture.materials.length) await db.pool.query('DELETE FROM materials WHERE id IN (?)', [fixture.materials]);
  if (fixture.location) await db.pool.query('DELETE FROM locations WHERE id = ?', [fixture.location]);
  if (fixture.unit) await db.pool.query('DELETE FROM units WHERE id = ?', [fixture.unit]);
  if (fixture.financeActor) await db.pool.query('DELETE FROM users WHERE id = ?', [fixture.financeActor]);
  clearCache();
});

  test('两个配置API共用数据，产品过滤和输入校验有效', async () => {
    const input = {
      productId: fixture.productId, name: `${prefix}工艺`, version: 'V1', status: 1,
      details: [
        { orderNum: 1, name: '装配', standardHours: 0.1, stationId: fixture.stationId, sopContent: '按V1要求装配', materials: [{ materialId: fixture.materialId, quantity: 1, isScanRequired: true }] },
        { orderNum: 2, name: '包装', standardHours: 0.2 },
      ],
    };
    fixture.v1 = dataOf(await api.post('/api/base-data/process-templates').send(input), 201);
    expect(fixture.v1.version).toBe('V1');
    const legacy = dataOf(await api.get(`/api/production/assembly/routes/${fixture.v1.id}`));
    expect(legacy.id).toBe(fixture.v1.id);
    expect(legacy.steps[0].standardMinutes).toBeCloseTo(6);
    const filtered = dataOf(await api.get(`/api/base-data/process-templates?productId=${fixture.materialId}`));
    expect(filtered.total).toBe(0);
    expect((await api.post('/api/base-data/process-templates').send(input)).status).toBe(409);
    expect((await api.post('/api/base-data/process-templates').send({ ...input, version: 'bad-zero', details: [{ orderNum: 1, name: '无定额', standardHours: 0 }] })).status).toBe(400);
    expect((await api.post('/api/base-data/process-templates').send({ ...input, version: 'bad-order', details: [input.details[0], { ...input.details[1], orderNum: 1 }] })).status).toBe(400);
    const created = dataOf(await api.post('/api/production/tasks').send({ productId: fixture.productId, quantity: 4, manager: '工艺回归组', processTemplateId: fixture.v1.id, startDate: '2026-09-14 09:30' }), 201);
    fixture.taskId = created.id;
    fixture.tasks.push(created.id);
    const steps = dataOf(await api.get(`/api/production/assembly/tasks/${created.id}/steps`)).steps;
    fixture.steps = steps;
    expect(steps).toHaveLength(2);
    expect(steps[0].sopContent).toBe('按V1要求装配');
    expect(steps[0].materials[0].materialId).toBe(fixture.materialId);
    const ordinary = dataOf(await api.get(`/api/production/processes?taskId=${created.id}`));
    expect(ordinary.list.map(row => row.id)).toEqual(steps.map(row => row.id));
    expect((await api.post(`/api/production/assembly/steps/${steps[0].id}/start`).send({})).status).toBe(409);
    expect(ordinary.list[0].processSnapshot.sopContent).toBe('按V1要求装配');
  });

  test('发布新版本后旧任务和排程保持不变，新任务只接受本产品生效版本', async () => {
    fixture.v2 = await definitions.create({
      product_id: fixture.productId, name: `${prefix}新版`, version: 'V2', status: 1,
      source_template_id: fixture.v1.id,
      details: [{ order_num: 1, name: '新版装配', standard_hours: 0.8, sop_content: 'V2新要求' }],
    });
    const [[active]] = await db.pool.query('SELECT COUNT(*) n FROM process_templates WHERE product_id = ? AND status = 1', [fixture.productId]);
    expect(Number(active.n)).toBe(1);
    expect((await definitions.getById(fixture.v1.id)).status).toBe(0);
    await expect(definitions.update(fixture.v1.id, { name: '覆盖旧版' })).rejects.toMatchObject({ errorCode: 'PROCESS_VERSION_IMMUTABLE' });
    await expect(definitions.delete(fixture.v1.id)).rejects.toMatchObject({ errorCode: 'PROCESS_VERSION_IMMUTABLE' });
    const taskDetail = dataOf(await api.get(`/api/production/tasks/${fixture.taskId}`));
    expect(taskDetail).toMatchObject({ processTemplateId: fixture.v1.id, processTemplateVersion: 'V1', startDate: '2026-09-14', plannedStartTime: '2026-09-14 09:30:00' });
    expect(taskDetail.processSnapshotAt).toBeTruthy();
    expect(taskDetail.processes[0]).toMatchObject({
      id: fixture.steps[0].id, quantity: 4, plannedQuantity: 4, progress: 0, standardHours: 0.1,
      plannedStartTime: '2026-09-14 09:30:00', plannedEndTime: '2026-09-14 09:54:00',
      processSnapshot: { sopContent: '按V1要求装配' },
    });
    const taskList = dataOf(await api.get(`/api/production/tasks?productId=${fixture.productId}`));
    expect(taskList.items.find(row => row.id === fixture.taskId)).toMatchObject({
      processTemplateId: fixture.v1.id, processTemplateVersion: 'V1', processSnapshotAt: taskDetail.processSnapshotAt,
      plannedStartTime: taskDetail.plannedStartTime,
    });
    expect(taskList.items.find(row => row.id === fixture.taskId).processes).toEqual(taskDetail.processes);
    dataOf(await api.put(`/api/production/tasks/${fixture.taskId}`).send({
      productId: fixture.productId, quantity: 4, manager: '工艺回归组', processTemplateId: taskDetail.processTemplateId,
      startDate: new Date(2026, 8, 14, 9, 30).toISOString(), expectedEndDate: '2026-09-14T10:42:00.000Z',
    }));
    expect(dataOf(await api.get(`/api/production/tasks/${fixture.taskId}`))).toMatchObject({
      processTemplateId: fixture.v1.id, processTemplateVersion: 'V1', processSnapshotAt: taskDetail.processSnapshotAt,
      startDate: '2026-09-14', plannedStartTime: '2026-09-14 09:30:00', expectedEndDate: '2026-09-14',
    });
    const steps = await assembly.getTaskSteps(fixture.taskId);
    expect(steps.steps[0].sop_content).toBe('按V1要求装配');
    const fixed = await scheduling.getProductStandardHours(fixture.productId, null, { taskId: fixture.taskId });
    const current = await scheduling.getProductStandardHours(fixture.productId);
    expect(fixed.totalMinutesPerUnit).toBeCloseTo(18);
    expect(current.totalMinutesPerUnit).toBeCloseTo(48);
    const preview = dataOf(await api.post('/api/production/scheduling/calculate').send({ productId: fixture.productId, taskId: fixture.taskId, quantity: 4, startTime: '2026-09-14 08:00:00' }));
    expect(preview.totalMinutes).toBe(72);
    expect((await api.post('/api/production/tasks').send({ productId: fixture.materialId, quantity: 1, manager: '测试', processTemplateId: fixture.v2.id })).status).toBe(409);
    expect((await api.post('/api/production/tasks').send({ productId: fixture.productId, quantity: 1, manager: '测试', processTemplateId: fixture.v1.id })).status).toBe(409);
    const task = dataOf(await api.post('/api/production/tasks').send({ productId: fixture.productId, quantity: 2, manager: '测试' }), 201);
    fixture.tasks.push(task.id);
    const [[row]] = await db.pool.query('SELECT process_template_id FROM production_tasks WHERE id = ?', [task.id]);
    expect(row.process_template_id).toBe(fixture.v2.id);
  });

  test('旧工艺查看权限可读取合并配置和物料选项，不会获得编辑或物料管理权限', async () => {
    const permissions = require('../../src/services/PermissionService');
    const scoped = jest.spyOn(permissions, 'getUserPermissions').mockResolvedValue(
      permissions.expandPermissionsWithAliases(['production:routes:view'])
    );
    try {
      const routes = dataOf(await api.get(`/api/base-data/process-templates?productId=${fixture.productId}`));
      expect(routes.total).toBe(2);
      const options = dataOf(await api.get(`/api/base-data/process-templates/material-options?keyword=${prefix}`));
      expect(options.map(row => row.id).sort()).toEqual([...fixture.materials].sort());
      expect(options.every(row => row.price === undefined && row.costPrice === undefined)).toBe(true);
      expect((await api.get('/api/production/assembly/stations')).status).toBe(200);
      expect((await api.post('/api/base-data/process-templates').send({})).status).toBe(403);
      expect((await api.get('/api/base-data/materials')).status).toBe(403);
    } finally { scoped.mockRestore(); }
  });

  test('发料、工序、扫码、质检、报工、成本和财务入库闭环，事务回滚不遗留数据', async () => {
    const connection = await db.pool.getConnection();
    const actor = { operatorId: 1, operatorName: '工艺回归操作员' };
    const domain = require('../../src/services/business/DomainEventService');
    const dlq = require('../../src/services/business/DLQService');
    const dispatch = jest.spyOn(domain, 'dispatchSoon').mockImplementation(() => {});
    const sideEffects = jest.spyOn(InboundTransactionService, '_handleSideEffects').mockImplementation(() => {});
    const trace = jest.spyOn(dlq, 'runWithRetry').mockImplementation(() => {});
    try {
      const [[baseline]] = await connection.query('SELECT status, actual_cost FROM production_tasks WHERE id = ?', [fixture.taskId]);
      await connection.beginTransaction();
      const stock = async materialId => {
        const [[row]] = await connection.query('SELECT COALESCE(SUM(quantity), 0) qty FROM inventory_ledger WHERE material_id = ?', [materialId]);
        return Number(row.qty);
      };
      const approveSource = async sourceNo => {
        const [[posting]] = await connection.query('SELECT id FROM inventory_posting_documents WHERE source_no = ? AND finance_status = ? ORDER BY id DESC LIMIT 1', [sourceNo, 'pending']);
        expect(posting).toBeTruthy();
        await InventoryPostingService.approve(posting.id, { id: fixture.financeActor, label: '测试财务' }, connection);
        return posting.id;
      };
      const openingNo = `${prefix}-OPEN`;
      const batchNumber = `${prefix}-BATCH`;
      const [opening] = await connection.query("INSERT INTO inventory_inbound (inbound_no, inbound_date, inbound_type, location_id, status, operator, created_by) VALUES (?, CURDATE(), 'other', ?, 'confirmed', '测试', 1)", [openingNo, fixture.location]);
      await InventoryService.updateStock({ materialId: fixture.materialId, locationId: fixture.location, unitId: fixture.unit, quantity: 10, unitCost: 5, batchNumber, transactionType: 'inbound', referenceType: 'inbound', referenceNo: openingNo, sourceId: opening.insertId, operator: '测试', businessApprovedById: 1, idempotencyKey: `${openingNo}:1` }, connection);
      await approveSource(openingNo);
      expect(await stock(fixture.materialId)).toBe(10);

      const issueNo = `${prefix}-ISSUE`;
      const [issue] = await connection.query("INSERT INTO inventory_outbound (outbound_no, outbound_date, outbound_type, reference_type, reference_id, production_task_id, status, operator, created_by) VALUES (?, CURDATE(), 'production', 'production_task', ?, ?, 'completed', '测试', 1)", [issueNo, fixture.taskId, fixture.taskId]);
      await connection.query('INSERT INTO inventory_outbound_items (outbound_id, material_id, quantity, actual_quantity, unit_id, price, total_amount) VALUES (?, ?, 4, 4, ?, 5, 20)', [issue.insertId, fixture.materialId, fixture.unit]);
      await InventoryService.updateStock({ materialId: fixture.materialId, locationId: fixture.location, unitId: fixture.unit, quantity: -4, unitCost: 5, batchNumber, transactionType: 'production_outbound', referenceType: 'outbound', referenceNo: issueNo, sourceId: issue.insertId, operator: '测试', businessApprovedById: 1, idempotencyKey: `${issueNo}:1` }, connection);
      await approveSource(issueNo);
      expect(await stock(fixture.materialId)).toBe(6);
      for (const status of ['allocated', 'preparing', 'material_issuing', 'material_issued']) await promoteTaskStatus(connection, fixture.taskId, status);
      const [first, second] = fixture.steps;
      await expect(execution.update(connection, second.id, { status: 'in_progress' }, actor)).rejects.toMatchObject({ errorCode: 'PREVIOUS_PROCESS_REQUIRED' });
      await execution.update(connection, first.id, { status: 'in_progress' }, actor);
      await expect(execution.update(connection, first.id, { status: 'completed' }, actor)).rejects.toMatchObject({ errorCode: 'PROCESS_MATERIAL_SCAN_REQUIRED' });
      const scan = await verification.verify({ taskId: fixture.taskId, processId: first.id, scannedBarcode: `${prefix}-material` }, 1, connection);
      expect(scan.result).toBe('pass');
      await execution.update(connection, first.id, { status: 'completed' }, actor);
      await execution.update(connection, second.id, { status: 'in_progress' }, actor);
      const done = await execution.update(connection, second.id, { status: 'completed' }, actor);
      expect(done.allStepsCompleted).toBe(true);
      expect(done.warnings).toHaveLength(1);
      const [[report]] = await connection.query('SELECT id, work_hours, report_quantity FROM production_reports WHERE task_id = ?', [fixture.taskId]);
      expect(Number(report.work_hours)).toBe(1.2);
      expect(Number(report.report_quantity)).toBe(4);
      await labor.ensureTaskReport(connection, fixture.taskId);
      const [[reportCount]] = await connection.query('SELECT COUNT(*) n FROM production_reports WHERE task_id = ?', [fixture.taskId]);
      expect(Number(reportCount.n)).toBe(1);

      const passInspection = async inspection => {
        const [items] = await connection.query('SELECT * FROM quality_inspection_items WHERE inspection_id = ?', [inspection.id]);
        await QualityInspection.updateInspection(inspection.id, {
          status: 'passed', qualified_quantity: Number(inspection.quantity), unqualified_quantity: 0,
          first_article_result: inspection.inspection_type === 'first_article' ? 'passed' : null,
          production_can_continue: 1,
          items: items.map(item => ({ ...item, is_qualified: 1, result: 'qualified', actual_value: item.dimension_value || '符合要求' })),
        }, connection);
      };
      const [inspections] = await connection.query("SELECT * FROM quality_inspections WHERE task_id = ? AND inspection_type IN ('first_article', 'process') AND deleted_at IS NULL", [fixture.taskId]);
      expect(inspections).toHaveLength(2);
      expect(inspections.find(row => row.inspection_type === 'process').process_id).toBe(first.id);
      for (const inspection of inspections) await passInspection(inspection);
      const [[final]] = await connection.query("SELECT * FROM quality_inspections WHERE task_id = ? AND inspection_type = 'final' AND deleted_at IS NULL", [fixture.taskId]);
      expect(final).toBeTruthy();
      await passInspection(final);
      const [[inbound]] = await connection.query('SELECT * FROM inventory_inbound WHERE inspection_id = ? AND is_deleted = 0', [final.id]);
      expect(inbound.reference_id).toBe(fixture.taskId);
      await connection.query("UPDATE inventory_inbound SET status = 'confirmed' WHERE id = ?", [inbound.id]);
      await InboundTransactionService.confirmInbound(connection, inbound.id, '测试仓管', { ...inbound, status: 'confirmed' }, 1);
      const [[cost]] = await connection.query('SELECT material_cost, labor_cost, actual_cost, status FROM production_tasks WHERE id = ?', [fixture.taskId]);
      expect(Number(cost.material_cost)).toBe(20);
      expect(Number(cost.labor_cost)).toBeGreaterThan(0);
      expect(Number(cost.actual_cost)).toBeCloseTo(20 + Number(cost.labor_cost) * 1.1, 2);
      expect(cost.status).toBe('completed');
      const [[variance]] = await connection.query('SELECT standard_labor_cost, actual_labor_cost, labor_variance FROM cost_variance_records WHERE task_id = ?', [fixture.taskId]);
      expect(Number(variance.standard_labor_cost)).toBe(60);
      expect(Number(variance.actual_labor_cost)).toBe(60);
      expect(Number(variance.labor_variance)).toBe(0);
      expect(await stock(fixture.productId)).toBe(0);
      const [[pending]] = await connection.query('SELECT id FROM inventory_posting_documents WHERE source_no = ?', [inbound.inbound_no]);
      await expect(InventoryPostingService.approve(pending.id, { id: 1, label: '同一经办人' }, connection)).rejects.toMatchObject({ statusCode: 403 });
      await approveSource(inbound.inbound_no);
      expect(await stock(fixture.productId)).toBe(4);
      await expect(InventoryPostingService.approve(pending.id, { id: fixture.financeActor }, connection)).rejects.toMatchObject({ statusCode: 409 });
      expect(await stock(fixture.productId)).toBe(4);
      // Rollback also restores stock and cost that were approved in this transaction.
      await connection.rollback();
      const [[restored]] = await db.pool.query('SELECT status, actual_cost FROM production_tasks WHERE id = ?', [fixture.taskId]);
      expect(restored.status).toBe(baseline.status);
      expect(Number(restored.actual_cost)).toBe(Number(baseline.actual_cost));
      const [[restoredReports]] = await db.pool.query('SELECT COUNT(*) n FROM production_reports WHERE task_id = ?', [fixture.taskId]);
      expect(Number(restoredReports.n)).toBe(0);
      expect(await stock(fixture.productId)).toBe(0);
      expect(await stock(fixture.materialId)).toBe(0);
    } finally {
      await connection.rollback();
      connection.release();
      dispatch.mockRestore(); sideEffects.mockRestore(); trace.mockRestore();
    }
  });

  test('直接报工和任务完工也不能跳过前序工序或物料扫码', async () => {
    const [[before]] = await db.pool.query('SELECT status FROM production_tasks WHERE id = ?', [fixture.taskId]);
    try {
      await db.pool.query("UPDATE production_tasks SET status = 'in_progress' WHERE id = ?", [fixture.taskId]);
      const report = processId => api.post('/api/production/reports').send({
        taskId: fixture.taskId, processId, completedQuantity: 4, qualifiedQuantity: 4, workHours: 1.2,
      });
      const outOfOrder = await report(fixture.steps[1].id);
      expect(outOfOrder.status).toBe(409);
      expect(outOfOrder.body.errorCode).toBe('PREVIOUS_PROCESS_REQUIRED');
      const unscanned = await report(fixture.steps[0].id);
      expect(unscanned.status).toBe(409);
      expect(unscanned.body.errorCode).toBe('PROCESS_MATERIAL_SCAN_REQUIRED');
      const completion = await api.post(`/api/production/tasks/${fixture.taskId}/complete`).send({ quantity: 4 });
      expect(completion.status).toBe(409);
      expect(completion.body.errorCode).toBe('PRODUCTION_PROCESSES_REQUIRED');
      const invalidScan = await api.post('/api/production/assist/scan-verify').send({ taskId: fixture.taskId, processId: 999999999, scannedBarcode: `${prefix}-material` });
      expect(invalidScan.status).toBe(400);
      expect(invalidScan.body.errorCode).toBe('INVALID_VERIFICATION_PROCESS');
      const [[reports]] = await db.pool.query('SELECT COUNT(*) n FROM production_reports WHERE task_id = ?', [fixture.taskId]);
      expect(Number(reports.n)).toBe(0);
    } finally {
      await db.pool.query('UPDATE production_tasks SET status = ? WHERE id = ?', [before.status, fixture.taskId]);
    }
  });

  test('分批报工保留人工工时、补齐零工时和剩余数量，重复执行不重复报工', async () => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const [index, hours] of [0.5, 0].entries()) {
        await connection.query(`INSERT INTO production_reports
          (report_no, task_id, operator_id, operator_name, report_time, report_quantity, completed_quantity,
           qualified_quantity, defective_quantity, unqualified_quantity, work_hours)
          VALUES (?, ?, 1, '测试', NOW(), 1, 1, 1, 0, 0, ?)`, [`${prefix}-PART-${index}`, fixture.taskId, hours]);
      }
      const result = await labor.ensureTaskReport(connection, fixture.taskId);
      expect(result).toMatchObject({ created: true, repaired: true, workHours: 1.4 });
      const [reports] = await connection.query('SELECT completed_quantity, work_hours FROM production_reports WHERE task_id = ? ORDER BY id', [fixture.taskId]);
      expect(reports.map(row => [Number(row.completed_quantity), Number(row.work_hours)])).toEqual([[1, 0.5], [1, 0.3], [2, 0.6]]);
      expect(await labor.ensureTaskReport(connection, fixture.taskId)).toMatchObject({ created: false, repaired: false, workHours: 1.4 });
    } finally { await connection.rollback(); connection.release(); }
  });

  test('混合定额和实际工时忽略已跳过的工序，极小正工时也能保留', async () => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("UPDATE production_processes SET status = 'completed', standard_hours = 0, actual_start_time = '2026-09-11 08:00:00', actual_end_time = '2026-09-11 08:30:00' WHERE id = ?", [fixture.steps[1].id]);
      await connection.query("INSERT INTO production_processes (task_id, process_name, sequence, quantity, standard_hours, status) VALUES (?, '已跳过', 3, 4, 99, 'cancelled')", [fixture.taskId]);
      expect(await labor.resolveWorkHours(connection, fixture.taskId)).toMatchObject({ workHours: 0.9, source: 'task_standard_and_actual_hours' });
      await connection.query("UPDATE production_processes SET standard_hours = 0.000001 WHERE task_id = ? AND status <> 'cancelled'", [fixture.taskId]);
      expect((await labor.resolveWorkHours(connection, fixture.taskId)).workHours).toBe(0.000008);
    } finally { await connection.rollback(); connection.release(); }
  });

  test('更换执行前的版本会刷新快照时间，已执行任务拒绝换版', async () => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("UPDATE production_tasks SET process_snapshot_at = '2020-01-01' WHERE id = ?", [fixture.taskId]);
      const replaced = await taskProcesses.initializeTask(connection, fixture.taskId, { replace: true, templateId: fixture.v2.id });
      expect(replaced.templateId).toBe(fixture.v2.id);
      const [[task]] = await connection.query('SELECT process_snapshot_at FROM production_tasks WHERE id = ?', [fixture.taskId]);
      expect(new Date(task.process_snapshot_at).getFullYear()).toBeGreaterThan(2020);
      await connection.query("UPDATE production_tasks SET status = 'in_progress' WHERE id = ?", [fixture.taskId]);
      await expect(taskProcesses.initializeTask(connection, fixture.taskId, { replace: true, templateId: fixture.v2.id }))
        .rejects.toMatchObject({ errorCode: 'TASK_PROCESS_VERSION_LOCKED' });
    } finally { await connection.rollback(); connection.release(); }
  });

  test('草稿校验、删除与并发发布保持单一有效版本', async () => {
    const draft = await definitions.create({ product_id: fixture.productId, name: '工艺草稿', version: 'V3', details: [] });
    await expect(definitions.update(draft.id, { details: null })).rejects.toMatchObject({ errorCode: 'INVALID_PROCESS_ROUTE' });
    await expect(definitions.updateStatus(draft.id, 1)).rejects.toMatchObject({ errorCode: 'INVALID_PROCESS_ROUTE' });
    await definitions.update(draft.id, { details: [{ name: '微型工序', order_num: 1, standard_hours: 0.000001 }] });
    const other = await definitions.create({ product_id: fixture.productId, name: '并发工艺', version: 'V4', details: [{ name: '装配', order_num: 1, standard_hours: 0.2 }] });
    await Promise.all([definitions.updateStatus(draft.id, 1), definitions.updateStatus(other.id, 1)]);
    const [[active]] = await db.pool.query('SELECT COUNT(*) n FROM process_templates WHERE product_id = ? AND status = 1', [fixture.productId]);
    expect(Number(active.n)).toBe(1);
    expect((await assembly.getTaskSteps(fixture.taskId)).steps[0].sop_content).toBe('按V1要求装配');
    const discarded = await definitions.create({ product_id: fixture.productId, name: '待删除草稿', version: 'V5', details: [] });
    await definitions.delete(discarded.id);
    expect(await definitions.getById(discarded.id)).toBeNull();
    await expect(definitions.updateStatus(discarded.id, 1)).rejects.toMatchObject({ errorCode: 'PROCESS_ROUTE_NOT_FOUND' });
  });
});
