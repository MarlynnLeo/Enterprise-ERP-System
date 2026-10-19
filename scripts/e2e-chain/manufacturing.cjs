'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

// Every positive transition below is submitted by the real Vue page. Database
// access is read-only and HTTP writes are used only for explicit rejection checks.
const unwrap = body => body?.data?.data ?? body?.data ?? body;
const dialog = page => page.locator('.el-dialog:visible').last();
const rows = page => page.locator('.el-table__body-wrapper tr.el-table__row:visible');
const rowBy = (page, text) => rows(page).filter({ hasText: String(text) }).first();
const escaped = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function snapshot(ctx, name) {
  if (!ctx.evidenceDir) return;
  await fs.mkdir(ctx.evidenceDir, { recursive: true });
  const stem = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  await fs.writeFile(path.join(ctx.evidenceDir, `${stem}.txt`), await ctx.page.locator('body').innerText());
  await ctx.page.screenshot({ path: path.join(ctx.evidenceDir, `${stem}.png`), fullPage: true });
}

async function action(ctx, method, endpoint, click) {
  const pending = ctx.page.waitForResponse(response =>
    response.request().method() === method && new URL(response.url()).pathname === endpoint,
  { timeout: 30000 });
  pending.catch(() => {});
  await click();
  const response = await pending;
  const body = await response.json();
  assert.ok(response.ok() && body.success !== false,
    `${method} ${endpoint}: HTTP ${response.status()} ${JSON.stringify(body).slice(0, 1200)}`);
  return unwrap(body);
}

async function navigate(ctx, route, placeholder, keyword) {
  await ctx.page.goto(`${ctx.baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  await ctx.page.locator('.el-loading-mask:visible').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  if (placeholder && keyword) {
    const input = ctx.page.getByPlaceholder(placeholder, { exact: true });
    await input.fill(String(keyword));
    await input.press('Enter');
  }
  if (keyword) await rowBy(ctx.page, keyword).waitFor({ state: 'visible' });
}

async function selectOption(page, selector, option) {
  await selector.click();
  const input = selector.getByRole('combobox').first();
  const controls = await input.getAttribute('aria-controls').catch(() => null);
  const scope = controls ? page.locator(`[id="${controls}"]`) : page;
  await scope.getByRole('option', { name: option, exact: typeof option === 'string' }).last().click();
}

async function planOf(ctx, chain) {
  const id = chain.plan?.id || chain.productionPlan?.id || chain.planId;
  if (id) {
    const [[plan]] = await ctx.db.execute('SELECT * FROM production_plans WHERE id = ?', [id]);
    assert.ok(plan, '链中的生产计划不存在');
    return plan;
  }
  const [[plan]] = await ctx.db.execute(
    'SELECT * FROM production_plans WHERE product_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1',
    [ctx.fixture.materials.internal.id]);
  assert.ok(plan, '销售不足量尚未生成生产计划');
  return plan;
}

async function approveManufacturingBoms(ctx) {
  await ctx.step('前端审核测试BOM并验证审批人', async () => {
    for (const key of ['internal', 'semi']) {
      const product = ctx.fixture.materials[key];
      const bomId = ctx.fixture.manufacturing.boms[product.id];
      const [[bom]] = await ctx.db.execute('SELECT approved_by FROM bom_masters WHERE id = ?', [bomId]);
      if (bom.approved_by) continue;
      await ctx.page.goto(`${ctx.baseUrl}/basedata/boms`);
      await ctx.page.getByPlaceholder('请输入产品编码、名称或型号').fill(product.code);
      await ctx.page.getByRole('button', { name: '查询', exact: true }).click();
      await rowBy(ctx.page, product.code).getByRole('button', { name: '审核', exact: true }).click();
      await action(ctx, 'PUT', `/api/base-data/boms/${bomId}/approve`, () =>
        ctx.page.locator('.el-popconfirm:visible').getByRole('button', { name: /确\s*定|确\s*认/ }).click());
      const [[saved]] = await ctx.db.execute('SELECT approved_by,approved_at FROM bom_masters WHERE id = ?', [bomId]);
      assert.ok(saved.approved_by && saved.approved_at, 'BOM必须完成真实审核后才用于销售缺料下推');
    }
  });
}

async function prepareProduction(ctx, chain = {}) {
  const plan = await planOf(ctx, chain);
  chain.plan = plan;
  await ctx.step('前端生产计划：按销售来源BOM缺料生成采购申请', async () => {
    const [existing] = await ctx.db.execute(
      "SELECT * FROM purchase_requisitions WHERE source_type='production_plan' AND source_id=? AND source_material_id=? AND status NOT IN ('cancelled','rejected') AND deleted_at IS NULL",
      [plan.id, ctx.fixture.materials.raw.id]);
    if (existing.length) {
      assert.equal(existing.length, 1, '生产缺料请购不能重复');
      if (!(chain.requisitions || []).some(item => Number(item.id) === Number(existing[0].id)))
        chain.requisitions = [...(chain.requisitions || []), existing[0]];
      ctx.saveChain?.(chain);
      await ctx.record('恢复既有生产缺料申请', { id: existing[0].id, sourceId: plan.id });
      return existing[0];
    }
    await navigate(ctx, '/production/plan', '物料名称', ctx.fixture.materials.internal.name);
    await rowBy(ctx.page, plan.code).locator('td').filter({ hasText: plan.code }).first().click();
    const detail = dialog(ctx.page);
    await detail.locator('.el-table__body-wrapper tr.el-table__row').first().waitFor();
    await snapshot(ctx, 'manufacturing-plan-shortage');
    const rawRow = detail.locator('tr.el-table__row').filter({ hasText: ctx.fixture.materials.raw.code }).first();
    await rawRow.waitFor();
    const requisition = await action(ctx, 'POST', '/api/purchase/requisitions', () =>
      rawRow.getByRole('button', { name: '采购', exact: true }).click());
    const [[saved]] = await ctx.db.execute('SELECT * FROM purchase_requisitions WHERE id = ?', [requisition.id]);
    assert.equal(saved.source_type, 'production_plan');
    assert.equal(Number(saved.source_id), Number(plan.id));
    const [items] = await ctx.db.execute('SELECT * FROM purchase_requisition_items WHERE requisition_id = ?', [saved.id]);
    assert.equal(items.length, 1);
    assert.equal(Number(items[0].material_id), Number(ctx.fixture.materials.raw.id));
    assert.ok(Number(items[0].quantity) > 0);
    chain.requisitions = [...(chain.requisitions || []), { ...saved, items }];
    ctx.saveChain?.(chain);
    ctx.record('生产缺料申请来源与数量', { planId: plan.id, requisitionId: saved.id, items });
    // The UI must disable repeat creation using server-backed state.
    await detail.getByRole('button', { name: '关闭', exact: true }).click();
    await rowBy(ctx.page, plan.code).locator('td').filter({ hasText: plan.code }).first().click();
    const repeatedRow = dialog(ctx.page).locator('tr.el-table__row').filter({ hasText: ctx.fixture.materials.raw.code }).first();
    assert.ok(await repeatedRow.getByRole('button', { name: /已申请/ }).isDisabled(), '已申请的缺料应禁止重复采购');
    await dialog(ctx.page).getByRole('button', { name: '关闭', exact: true }).click();
    return saved;
  });
  await ctx.step('前端生产计划下推任务并冻结两道工艺', async () => {
    const [existing] = await ctx.db.execute('SELECT * FROM production_tasks WHERE plan_id=? AND deleted_at IS NULL', [plan.id]);
    if (existing.length) {
      assert.equal(existing.length, 1, '本测试计划应下推为一个任务');
      chain.task = existing[0];
      [chain.processes] = await ctx.db.execute('SELECT * FROM production_processes WHERE task_id=? ORDER BY sequence,id', [chain.task.id]);
      ctx.saveChain?.(chain);
      await ctx.record('恢复既有生产任务', { id: chain.task.id, planId: plan.id });
      return;
    }
    await navigate(ctx, '/production/plan', '物料名称', ctx.fixture.materials.internal.name);
    await rowBy(ctx.page, plan.code).getByRole('button', { name: '下推', exact: true }).click();
    const task = await action(ctx, 'POST', '/api/production/tasks', () =>
      dialog(ctx.page).getByRole('button', { name: '确认下推', exact: true }).click());
    const [[saved]] = await ctx.db.execute('SELECT * FROM production_tasks WHERE id = ?', [task.id]);
    assert.equal(Number(saved.plan_id), Number(plan.id));
    assert.equal(Number(saved.quantity), Number(plan.quantity));
    const [processes] = await ctx.db.execute('SELECT * FROM production_processes WHERE task_id = ? ORDER BY sequence,id', [saved.id]);
    assert.equal(processes.length, 2, '下推任务应冻结两道工艺');
    chain.task = saved;
    chain.processes = processes;
    ctx.saveChain?.(chain);
    ctx.record('销售计划到生产任务', { planId: plan.id, taskId: saved.id, quantity: Number(saved.quantity), processIds: processes.map(p => p.id) });
  });
  await scheduleProduction(ctx, chain);
  return chain;
}

async function scheduleProduction(ctx, chain) {
  await ctx.step('前端生产任务勾选并一键排程', async () => {
    const [[scheduled]] = await ctx.db.execute('SELECT * FROM production_tasks WHERE id=?', [chain.task.id]);
    if (scheduled.start_date && scheduled.expected_end_date) {
      chain.task = scheduled;
      await ctx.record('恢复既有任务排程', { id: scheduled.id, start: scheduled.start_date, end: scheduled.expected_end_date });
      return;
    }
    await navigate(ctx, '/production/task', '物料名称', ctx.fixture.materials.internal.name);
    const taskRow = rowBy(ctx.page, chain.task.code);
    await taskRow.locator('.el-checkbox').click();
    assert.ok(await taskRow.getByRole('checkbox').isChecked());
    await ctx.page.getByRole('button', { name: /一键排程/ }).click();
    await snapshot(ctx, 'manufacturing-schedule-before');
    await action(ctx, 'POST', '/api/production/scheduling/batch', () =>
      dialog(ctx.page).getByRole('button', { name: '确认排程', exact: true }).click());
    const [[task]] = await ctx.db.execute('SELECT * FROM production_tasks WHERE id = ?', [chain.task.id]);
    assert.ok(task.start_date && task.expected_end_date, '排程应写入起止时间');
    assert.ok(new Date(task.expected_end_date) > new Date(task.start_date), '排程必须具有正工时');
    chain.task = task;
    ctx.saveChain?.(chain);
    await snapshot(ctx, 'manufacturing-scheduled');
  });
  return chain;
}

async function issueProductionMaterials(ctx, chain) {
  await ctx.step('前端生产任务发料生成关联出库草稿', async () => {
    const [existing] = await ctx.db.execute("SELECT * FROM inventory_outbound WHERE production_task_id=? AND status NOT IN ('cancelled','reversed') AND deleted_at IS NULL", [chain.task.id]);
    if (existing.length) {
      assert.equal(existing.length, 1, '同一测试任务不得重复生成发料单');
      const [items] = await ctx.db.execute('SELECT * FROM inventory_outbound_items WHERE outbound_id=?', [existing[0].id]);
      chain.outbound = { ...existing[0], items };
      ctx.saveChain?.(chain);
      await ctx.record('恢复既有生产发料单', { id: existing[0].id, taskId: chain.task.id });
      return;
    }
    await navigate(ctx, '/production/task', '物料名称', ctx.fixture.materials.internal.name);
    await rowBy(ctx.page, chain.task.code).getByRole('button', { name: '发料', exact: true }).click();
    const result = await action(ctx, 'POST', '/api/inventory/outbound', () =>
      dialog(ctx.page).getByRole('button', { name: '确认发料', exact: true }).click());
    const [[outbound]] = await ctx.db.execute('SELECT * FROM inventory_outbound WHERE id = ?', [result.id]);
    const [items] = await ctx.db.execute('SELECT * FROM inventory_outbound_items WHERE outbound_id = ?', [outbound.id]);
    assert.equal(Number(outbound.production_task_id), Number(chain.task.id));
    assert.equal(outbound.status, 'draft');
    assert.equal(Number(items.find(i => Number(i.material_id) === Number(ctx.fixture.materials.raw.id))?.quantity),
      Number(chain.task.quantity) * ctx.fixture.manufacturing.rawPerUnit);
    chain.outbound = { ...outbound, items };
    ctx.saveChain?.(chain);
    ctx.record('生产发料单', { id: outbound.id, taskId: chain.task.id, items });
    await snapshot(ctx, 'manufacturing-material-issue');
  });
  return chain;
}

async function fullSampling(ctx, currentDialog) {
  await selectOption(ctx.page, currentDialog.locator('.sampling-fields .el-select').first(), '全数检验');
}

async function firstArticle(ctx, inspection) {
  const [[previous]] = await ctx.db.execute('SELECT first_article_result FROM quality_inspections WHERE id=?', [inspection.id]);
  if (previous.first_article_result === 'passed') {
    await ctx.record('恢复已放行首检', { id: inspection.id });
    return;
  }
  await navigate(ctx, '/quality/first-article', '检验单号/任务号/产品名称', inspection.inspection_no);
  await rowBy(ctx.page, inspection.inspection_no).getByRole('button', { name: '检验', exact: true }).click();
  const current = dialog(ctx.page);
  await fullSampling(ctx, current);
  const itemRows = current.locator('.el-table__body-wrapper tr.el-table__row');
  for (let i = 0; i < await itemRows.count(); i++) {
    const item = itemRows.nth(i);
    await item.getByPlaceholder('实测值', { exact: true }).fill('外观完好，装配及功能正常');
    await selectOption(ctx.page, item.locator('.el-select'), '合格');
  }
  await snapshot(ctx, 'manufacturing-first-article-values');
  await action(ctx, 'PUT', `/api/quality/inspections/first-article/${inspection.id}/result`, () =>
    current.getByRole('button', { name: '提交检验结果', exact: true }).click());
}

async function processInspection(ctx, inspection) {
  const [[previous]] = await ctx.db.execute('SELECT status FROM quality_inspections WHERE id=?', [inspection.id]);
  if (previous.status === 'passed') {
    await ctx.record('恢复已完成过程检', { id: inspection.id });
    return;
  }
  await navigate(ctx, '/quality/process', '检验单号/工单号/产品名称', inspection.inspection_no);
  await action(ctx, 'POST', `/api/quality/inspections/process/${inspection.id}/punch`, () =>
    rowBy(ctx.page, inspection.inspection_no).getByRole('button', { name: '巡检', exact: true }).click());
  await rowBy(ctx.page, inspection.inspection_no).getByRole('button', { name: '判定', exact: true }).click();
  const current = dialog(ctx.page);
  await fullSampling(ctx, current);
  const itemRows = current.locator('.el-table__body-wrapper tr.el-table__row');
  for (let i = 0; i < await itemRows.count(); i++) {
    const item = itemRows.nth(i);
    await item.getByPlaceholder('请输入实际测量/观察值', { exact: true }).fill('工序尺寸及装配符合要求');
    await selectOption(ctx.page, item.locator('.el-select'), '合格');
  }
  await action(ctx, 'PUT', `/api/quality/inspections/${inspection.id}`, () =>
    current.getByRole('button', { name: '提交检验结果', exact: true }).click());
  const [[saved]] = await ctx.db.execute('SELECT status FROM quality_inspections WHERE id = ?', [inspection.id]);
  assert.equal(saved.status, 'passed');
}

async function reportProcess(ctx, chain, process, index) {
  const [[existing]] = await ctx.db.execute('SELECT COALESCE(SUM(completed_quantity),0) AS quantity FROM production_reports WHERE task_id=? AND process_id=?', [chain.task.id, process.id]);
  if (Number(existing.quantity) === Number(chain.task.quantity)) {
    const [reports] = await ctx.db.execute('SELECT * FROM production_reports WHERE task_id=? AND process_id=? ORDER BY id', [chain.task.id, process.id]);
    chain.reports = [...(chain.reports || []).filter(report => Number(report.process_id ?? report.processId) !== Number(process.id)), ...reports];
    ctx.saveChain?.(chain);
    await ctx.record('恢复已完成工序报工', { taskId: chain.task.id, processId: process.id, quantity: Number(existing.quantity) });
    return;
  }
  assert.equal(Number(existing.quantity), 0, '当前脚本只从无报工或全数已报工检查点恢复');
  await navigate(ctx, '/production/report');
  await ctx.page.getByRole('button', { name: '新增报工', exact: true }).click();
  const current = dialog(ctx.page);
  await selectOption(ctx.page, current.locator('.el-form-item').filter({ hasText: '生产任务' }).locator('.el-select'),
    new RegExp(escaped(chain.task.code)));
  await selectOption(ctx.page, current.locator('.el-form-item').filter({ hasText: '生产工序' }).locator('.el-select'),
    new RegExp(escaped(`${process.sequence}. ${process.process_name}`)));
  // Selecting a process refreshes its quota asynchronously; do not submit against
  // the previous task quota or overwrite the defaults while that read is pending.
  const plannedInput = current.getByRole('textbox', { name: '计划数量', exact: true });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (Number(await plannedInput.inputValue()) === Number(chain.task.quantity)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(Number(await plannedInput.inputValue()), Number(chain.task.quantity), '工序计划量必须正确显示后才能报工');
  await current.getByPlaceholder('请输入完成数量', { exact: true }).fill(String(chain.task.quantity));
  await current.getByPlaceholder('请输入合格数量', { exact: true }).fill(String(chain.task.quantity));
  await current.getByPlaceholder('请输入工时', { exact: true }).fill(String((index + 1) * 0.1 * Number(chain.task.quantity)));
  await snapshot(ctx, `manufacturing-process-${index + 1}-report`);
  const report = await action(ctx, 'POST', '/api/production/reports', () =>
    current.getByRole('button', { name: /提\s*交/ }).click());
  const [[saved]] = await ctx.db.execute('SELECT status FROM production_processes WHERE id = ?', [process.id]);
  assert.equal(saved.status, 'completed');
  const [[task]] = await ctx.db.execute('SELECT * FROM production_tasks WHERE id = ?', [chain.task.id]);
  assert.equal(Number(task.completed_quantity), index === chain.processes.length - 1 ? Number(chain.task.quantity) : 0,
    '上道工序产量不能作为最终产品完工量，末道数量不得跨工序累加');
  chain.reports = [...(chain.reports || []), { ...report, process_id: process.id }];
  ctx.saveChain?.(chain);
}

async function finalInspection(ctx, inspection) {
  const [[previous]] = await ctx.db.execute('SELECT status FROM quality_inspections WHERE id=?', [inspection.id]);
  if (previous.status === 'passed') {
    await ctx.record('恢复已完成终检', { id: inspection.id });
    return;
  }
  await navigate(ctx, '/quality/final', '检验单号/工单号/产品名称', inspection.inspection_no);
  await rowBy(ctx.page, inspection.inspection_no).getByRole('button', { name: '检验', exact: true }).click();
  const current = dialog(ctx.page);
  await fullSampling(ctx, current);
  const itemRows = current.locator('.el-table__body-wrapper tr.el-table__row');
  for (let i = 0; i < await itemRows.count(); i++) {
    const item = itemRows.nth(i);
    await item.getByPlaceholder('输入结果', { exact: true }).fill('外观、功能及包装检验合格');
    await selectOption(ctx.page, item.locator('.el-select'), '合格');
  }
  await current.locator('.el-form-item').filter({ has: ctx.page.locator('label').filter({ hasText: /^合格数量$/ }) })
    .locator('input').fill(String(inspection.quantity));
  await snapshot(ctx, 'manufacturing-final-values');
  await action(ctx, 'PUT', `/api/quality/inspections/${inspection.id}`, () =>
    current.getByRole('button', { name: '提交检验', exact: true }).click());
}

async function runManufacturing(ctx, chain) {
  await ctx.step('前端生产开始自动生成首检与过程检', async () => {
    const [[task]] = await ctx.db.execute('SELECT status FROM production_tasks WHERE id=?', [chain.task.id]);
    if (['material_issued', 'material_partial_issued'].includes(task.status)) {
      await navigate(ctx, '/production/process', '物料名称', chain.task.code);
      await action(ctx, 'PUT', `/api/production/tasks/${chain.task.id}/status`, () =>
        rowBy(ctx.page, chain.task.code).getByRole('button', { name: '开始', exact: true }).click());
    } else {
      assert.ok(['in_progress', 'inspection', 'warehousing', 'completed'].includes(task.status), `任务尚未完成发料：${task.status}`);
      await ctx.record('恢复已开工生产任务', { id: chain.task.id, status: task.status });
    }
    const [inspections] = await ctx.db.execute(
      "SELECT * FROM quality_inspections WHERE task_id = ? AND inspection_type IN ('first_article','process') AND deleted_at IS NULL ORDER BY id",
      [chain.task.id]);
    assert.equal(inspections.length, 2, '开工必须产生且只产生一张首检和一张过程检');
    chain.firstArticle = inspections.find(i => i.inspection_type === 'first_article');
    chain.processInspection = inspections.find(i => i.inspection_type === 'process');
    ctx.saveChain?.(chain);
  });
  await ctx.step('后端拒绝绕过工序直接满产完工', async () => {
    const before = await ctx.db.execute('SELECT completed_quantity,status FROM production_tasks WHERE id = ?', [chain.task.id]);
    if (before[0][0].status !== 'in_progress') {
      await ctx.record('恢复时跳过已执行的开工前负测', { taskId: chain.task.id, status: before[0][0].status });
      return;
    }
    const response = await ctx.api('POST', `/api/production/tasks/${chain.task.id}/complete`, { quantity: Number(chain.task.quantity) });
    assert.ok([400, 409].includes(response.status), '未完成工序不得直接满产');
    const after = await ctx.db.execute('SELECT completed_quantity,status FROM production_tasks WHERE id = ?', [chain.task.id]);
    assert.deepEqual(after[0], before[0], '失败完工不得改变数量和任务状态');
  });
  await ctx.step('前端首检逐项录入实测、放行', () => firstArticle(ctx, chain.firstArticle));
  await ctx.step('前端过程检巡检打卡并逐项判定', () => processInspection(ctx, chain.processInspection));
  for (const [index, process] of chain.processes.entries()) {
    await ctx.step(`前端第${index + 1}道工序报工数量与成品量分离`, () => reportProcess(ctx, chain, process, index));
  }
  await ctx.step('末道报工自动完工、终检数量不重复', async () => {
    const [[task]] = await ctx.db.execute('SELECT * FROM production_tasks WHERE id = ?', [chain.task.id]);
    assert.ok(['inspection', 'warehousing', 'completed'].includes(task.status));
    assert.equal(Number(task.completed_quantity), Number(chain.task.quantity));
    const [finals] = await ctx.db.execute(
      "SELECT * FROM quality_inspections WHERE task_id = ? AND inspection_type = 'final' AND deleted_at IS NULL", [task.id]);
    assert.equal(finals.length, 1);
    assert.equal(Number(finals[0].quantity), Number(task.quantity));
    chain.finalInspection = finals[0];
    ctx.saveChain?.(chain);
    ctx.record('两工序真实报工与最终产量', { taskId: task.id, finalQuantity: Number(task.completed_quantity), finalInspectionId: finals[0].id });
  });
  await ctx.step('前端终检实测合格自动生成成品入库草稿', async () => {
    await finalInspection(ctx, chain.finalInspection);
    const [inbounds] = await ctx.db.execute('SELECT * FROM inventory_inbound WHERE inspection_id = ? AND deleted_at IS NULL', [chain.finalInspection.id]);
    assert.equal(inbounds.length, 1, '终检应生成唯一入库草稿');
    assert.ok(['draft', 'confirmed', 'completed'].includes(inbounds[0].status), '终检入库必须为可继续处理的状态');
    assert.equal(Number(inbounds[0].reference_id), Number(chain.task.id));
    const [items] = await ctx.db.execute('SELECT * FROM inventory_inbound_items WHERE inbound_id = ?', [inbounds[0].id]);
    assert.equal(Number(items[0].quantity), Number(chain.task.quantity));
    chain.inbound = { ...inbounds[0], items };
    ctx.saveChain?.(chain);
    ctx.record('终检至成品入库', { taskId: chain.task.id, inspectionId: chain.finalInspection.id, inboundId: inbounds[0].id, items });
    await snapshot(ctx, 'manufacturing-final-inbound-generated');
  });
  return chain;
}

async function verifyManufacturingClosure(ctx, chain) {
  await ctx.step('数据库复核生产计划、完工、终检、财审入库与库存闭环', async () => {
    let task;
    for (let attempt = 0; attempt < 15; attempt++) {
      [[task]] = await ctx.db.execute('SELECT * FROM production_tasks WHERE id = ?', [chain.task.id]);
      if (task.status === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.equal(task.status, 'completed', '成品入库财审后生产任务必须闭环');
    assert.equal(Number(task.completed_quantity), Number(task.quantity));
    const [[plan]] = await ctx.db.execute('SELECT status,quantity,pushed_quantity FROM production_plans WHERE id = ?', [task.plan_id]);
    assert.equal(plan.status, 'completed');
    const [reports] = await ctx.db.execute('SELECT process_id,SUM(completed_quantity) AS quantity,SUM(work_hours) AS hours FROM production_reports WHERE task_id=? GROUP BY process_id', [task.id]);
    assert.equal(reports.length, 2);
    for (const report of reports) {
      assert.ok(Number(report.process_id) > 0);
      assert.equal(Number(report.quantity), Number(task.quantity));
      assert.ok(Number(report.hours) > 0);
    }
    const [[stock]] = await ctx.db.execute(`SELECT COALESCE(SUM(il.quantity),0) AS quantity
      FROM inventory_ledger il JOIN inventory_posting_documents ipd ON ipd.id=il.posting_document_id
      WHERE il.material_id=? AND ipd.source_no=? AND ipd.posting_kind='movement' AND ipd.finance_status='approved'`,
      [task.product_id, chain.inbound.inbound_no]);
    assert.equal(Number(stock.quantity), Number(task.quantity), '本次成品财审入库台账只能增加末道合格产量');
    const [[currentStock]] = await ctx.db.execute('SELECT COALESCE(SUM(quantity),0) AS quantity FROM inventory_ledger WHERE material_id=? AND location_id=?',
      [task.product_id, ctx.fixture.materials.internal.location_id]);
    const [[inbound]] = await ctx.db.execute('SELECT status,reference_type,reference_id,inspection_id FROM inventory_inbound WHERE id=?', [chain.inbound.id]);
    assert.equal(inbound.status, 'completed');
    assert.equal(inbound.reference_type, 'production_task');
    assert.equal(Number(inbound.reference_id), Number(task.id));
    assert.equal(Number(inbound.inspection_id), Number(chain.finalInspection.id));
    chain.task = task;
    [[chain.plan]] = await ctx.db.execute('SELECT * FROM production_plans WHERE id=?', [task.plan_id]);
    [chain.processes] = await ctx.db.execute('SELECT * FROM production_processes WHERE task_id=? ORDER BY sequence,id', [task.id]);
    [chain.reports] = await ctx.db.execute('SELECT * FROM production_reports WHERE task_id=? ORDER BY process_id,id', [task.id]);
    [[chain.finalInspection]] = await ctx.db.execute('SELECT * FROM quality_inspections WHERE id=?', [chain.finalInspection.id]);
    [[chain.firstArticle]] = await ctx.db.execute('SELECT * FROM quality_inspections WHERE id=?', [chain.firstArticle.id]);
    [[chain.processInspection]] = await ctx.db.execute('SELECT * FROM quality_inspections WHERE id=?', [chain.processInspection.id]);
    [[chain.inbound]] = await ctx.db.execute('SELECT * FROM inventory_inbound WHERE id=?', [chain.inbound.id]);
    [chain.inbound.items] = await ctx.db.execute('SELECT * FROM inventory_inbound_items WHERE inbound_id=?', [chain.inbound.id]);
    [[chain.outbound]] = await ctx.db.execute('SELECT * FROM inventory_outbound WHERE id=?', [chain.outbound.id]);
    [chain.outbound.items] = await ctx.db.execute('SELECT * FROM inventory_outbound_items WHERE outbound_id=?', [chain.outbound.id]);
    ctx.saveChain?.(chain);
    await ctx.record('制造完整链最终证据', { taskId: task.id, taskStatus: task.status, planId: task.plan_id, planStatus: plan.status,
      productQuantity: Number(task.quantity), postedFinishedQuantity: Number(stock.quantity), currentFinishedInventory: Number(currentStock.quantity), processReports: reports, inboundId: chain.inbound.id });
  });
  return chain;
}

module.exports = { approveManufacturingBoms, prepareProduction, scheduleProduction, issueProductionMaterials, runManufacturing,
  firstArticle, processInspection, reportProcess, finalInspection, verifyManufacturingClosure };
