require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const NonconformingProduct = require('../src/models/nonconformingProduct');
const NonconformingProductService = require('../src/services/business/NonconformingProductService');
const eightDReportController = require('../src/controllers/business/quality/eightDReportController');
const reworkTaskController = require('../src/controllers/business/quality/reworkTaskController');
const scrapRecordController = require('../src/controllers/business/quality/scrapRecordController');
const replacementOrderController = require('../src/controllers/business/quality/replacementOrderController');
const gaugeController = require('../src/controllers/business/quality/gaugeController');
const spcController = require('../src/controllers/business/quality/spcController');

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const marker = `QUALITY_VERIFY_${stamp}`;
const today = new Date().toISOString().slice(0, 10);
const results = [];

const cleanup = {
  ncpRecords: [],
  reportIds: [],
  inspectionIds: [],
  materialIds: [],
  supplierIds: [],
  locationIds: [],
  gaugeIds: [],
  spcPlanIds: [],
};

function assert(condition, message, details = undefined) {
  if (!condition) {
    const error = new Error(message);
    if (details !== undefined) error.details = details;
    throw error;
  }
}

function mark(name, data = undefined) {
  results.push({ name, data });
  console.log(`PASS ${name}${data ? ` ${JSON.stringify(data)}` : ''}`);
}

async function queryOne(sql, params = []) {
  const [rows] = await db.pool.query(sql, params);
  return rows[0] || null;
}

async function queryAll(sql, params = []) {
  const [rows] = await db.pool.query(sql, params);
  return rows;
}

async function countDocumentLinks(sourceType, sourceId, targetType, targetId = null) {
  const params = [sourceType, sourceId, targetType];
  let sql = `
    SELECT COUNT(*) AS total
    FROM document_links
    WHERE source_type = ?
      AND source_id = ?
      AND target_type = ?
  `;
  if (targetId !== null) {
    sql += ' AND target_id = ?';
    params.push(targetId);
  }
  const row = await queryOne(sql, params);
  return Number(row?.total || 0);
}

async function assertDocumentLink(sourceType, sourceId, targetType, targetId, name) {
  const total = await countDocumentLinks(sourceType, sourceId, targetType, targetId);
  assert(total > 0, `${name} document link missing`, {
    sourceType,
    sourceId,
    targetType,
    targetId,
  });
}

async function deleteDocumentLinksByTypeIds(type, ids) {
  if (!ids || ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await db.pool.query(
    `DELETE FROM document_links
     WHERE (source_type = ? AND source_id IN (${placeholders}))
        OR (target_type = ? AND target_id IN (${placeholders}))`,
    [type, ...ids, type, ...ids]
  );
}

function createMockRes() {
  let resolveResponse;
  const promise = new Promise((resolve) => {
    resolveResponse = resolve;
  });

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      resolveResponse({ statusCode: this.statusCode, payload });
    },
  };

  return { promise, res };
}

async function callController(handler, req) {
  const { promise, res } = createMockRes();
  await handler(req, res);
  return promise;
}

function assertSuccess(response, name) {
  assert(response.statusCode >= 200 && response.statusCode < 300, `${name} returned HTTP ${response.statusCode}`, response.payload);
  if (Object.prototype.hasOwnProperty.call(response.payload || {}, 'success')) {
    assert(response.payload.success === true, `${name} returned unsuccessful payload`, response.payload);
  }
  return response.payload?.data || response.payload;
}

async function expectControllerStatus(handler, req, statusCode, name) {
  const response = await callController(handler, req);
  assert(response.statusCode === statusCode, `${name} expected HTTP ${statusCode}`, response);
  mark(name, { statusCode });
  return response;
}

async function expectReject(fn, name) {
  try {
    await fn();
  } catch (error) {
    mark(name, { message: error.message });
    return;
  }
  throw new Error(`${name} should have rejected`);
}

async function ensureCodingRule(businessType, name, prefix) {
  await db.pool.query(
    `INSERT INTO coding_rules
      (business_type, name, prefix, date_format, \`separator\`, sequence_length, reset_cycle, initial_value, step, description, is_active)
     VALUES (?, ?, ?, 'YYMMDD', '', 3, 'daily', 1, 1, ?, 1)
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = CURRENT_TIMESTAMP`,
    [businessType, name, prefix, marker]
  );
}

async function ensureCodeRules() {
  await ensureCodingRule('nonconforming_product', 'Quality verify NCP', 'NCP');
  await ensureCodingRule('rework_task', 'Quality verify rework', 'RWK');
  await ensureCodingRule('spc_plan', 'Quality verify SPC', 'SPC');
  await ensureCodingRule('quality_calibration', 'Quality verify calibration', 'CAL');
  mark('coding rules available');
}

async function ensureAdminContext() {
  const user = await queryOne(
    "SELECT id, username, real_name FROM users WHERE status = 1 ORDER BY CASE WHEN username = 'admin' THEN 0 ELSE 1 END, id LIMIT 1"
  );
  assert(user?.id, 'missing active user for quality verification');
  return {
    id: user.id,
    username: user.username,
    real_name: user.real_name || user.username,
  };
}

async function createBaseData() {
  const [locationResult] = await db.pool.query(
    `INSERT INTO locations (code, name, type, is_default, status, remark)
     VALUES (?, ?, 'warehouse', 0, 1, ?)`,
    [`QV_LOC_${stamp}`, `Quality Verify Location ${stamp}`, marker]
  );
  cleanup.locationIds.push(locationResult.insertId);

  const [supplierResult] = await db.pool.query(
    `INSERT INTO suppliers (code, name, contact_person, contact_phone, status, remark)
     VALUES (?, ?, 'Quality Bot', '13800000000', 1, ?)`,
    [`QV_SUP_${stamp}`, `Quality Verify Supplier ${stamp}`, marker]
  );
  cleanup.supplierIds.push(supplierResult.insertId);

  const [materialResult] = await db.pool.query(
    `INSERT INTO materials
      (code, name, supplier_id, location_id, specs, material_type, price, cost_price, status, remark)
     VALUES (?, ?, ?, ?, 'VERIFY-SPEC', 'raw', 10, 10, 1, ?)`,
    [`QV_MAT_${stamp}`, `Quality Verify Material ${stamp}`, supplierResult.insertId, locationResult.insertId, marker]
  );
  cleanup.materialIds.push(materialResult.insertId);

  await db.pool.query(
    `INSERT INTO inventory_ledger
      (material_id, location_id, transaction_type, transaction_no, reference_no, reference_type,
       quantity, before_quantity, after_quantity, batch_number, operator, remark)
     VALUES (?, ?, 'inbound', ?, ?, 'quality_verify_seed', 100, 0, 100, ?, 'quality-verifier', ?)`,
    [
      materialResult.insertId,
      locationResult.insertId,
      `${marker}_STOCK`,
      `${marker}_STOCK`,
      `${marker}_STOCK_BATCH`,
      marker,
    ]
  );

  mark('base supplier material warehouse created', {
    supplierId: supplierResult.insertId,
    materialId: materialResult.insertId,
    locationId: locationResult.insertId,
  });

  return {
    supplierId: supplierResult.insertId,
    supplierName: `Quality Verify Supplier ${stamp}`,
    materialId: materialResult.insertId,
    materialCode: `QV_MAT_${stamp}`,
    materialName: `Quality Verify Material ${stamp}`,
    locationId: locationResult.insertId,
  };
}

async function createInspection(type, base, index) {
  const shortStamp = stamp.slice(8);
  const inspectionNo = `QCV${shortStamp}${index}`;
  const [result] = await db.pool.query(
    `INSERT INTO quality_inspections
      (inspection_no, inspection_type, reference_no, material_id, supplier_id, product_id,
       product_code, product_name, batch_no, quantity, qualified_quantity, unqualified_quantity,
       unit, status, planned_date, actual_date, inspector_name, standard_type, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 10, 5, 5, 'pcs', 'failed', ?, ?, 'quality-verifier', 'factory', ?)`,
    [
      inspectionNo,
      type,
      `QVR${shortStamp}${index}`,
      base.materialId,
      base.supplierId,
      base.materialId,
      base.materialCode,
      base.materialName,
      `${marker}_BATCH_${index}`,
      today,
      today,
      `${marker} source inspection ${index}`,
    ]
  );
  cleanup.inspectionIds.push(result.insertId);

  await db.pool.query(
    `INSERT INTO quality_inspection_items
      (inspection_id, item_name, standard, type, is_critical, result, is_qualified, remark)
     VALUES (?, 'Dimension A', '10 +/- 0.1', 'dimension', 1, 'failed', 0, ?)`,
    [result.insertId, marker]
  );

  return {
    id: result.insertId,
    inspectionNo,
    type,
    batchNo: `${marker}_BATCH_${index}`,
  };
}

async function createNcp(base, inspection, index) {
  const result = await NonconformingProduct.create({
    inspection_id: inspection?.id || null,
    inspection_no: inspection?.inspectionNo || null,
    material_id: base.materialId,
    material_code: base.materialCode,
    material_name: base.materialName,
    batch_no: inspection?.batchNo || `${marker}_BATCH_NCP_${index}`,
    quantity: 5,
    unit: 'pcs',
    defect_type: 'closure-test',
    defect_description: `${marker} defect ${index}`,
    severity: 'major',
    supplier_id: base.supplierId,
    supplier_name: base.supplierName,
    current_location: 'quality isolation',
    isolation_area: 'quality isolation',
    responsible_party: 'supplier',
    note: marker,
    created_by: 'admin',
  });
  cleanup.ncpRecords.push({ id: result.id, ncpNo: result.ncp_no });
  return result;
}

async function decideAndComplete(ncp, disposition, base, extra = {}) {
  await NonconformingProductService.processDisposition(ncp.id, {
    disposition,
    disposition_reason: `${marker} ${disposition} decision`,
    responsible_party: ['return', 'replacement'].includes(disposition) ? 'supplier' : 'internal',
    supplier_id: base.supplierId,
    supplier_name: base.supplierName,
    disposition_by: 'quality-verifier',
    updated_by: 'quality-verifier',
  });

  await NonconformingProductService.completeHandling(ncp.id, {
    handled_quantity: extra.handledQuantity || 5,
    handling_cost: extra.handlingCost || 50,
    note: `${marker} ${disposition} completion`,
    updated_by: 'quality-verifier',
  });
}

async function verifyReworkAndEightD(base, user) {
  const inspection = await createInspection('process', base, 1);
  const ncp = await createNcp(base, inspection, 1);
  await decideAndComplete(ncp, 'rework', base);

  const rework = await queryOne('SELECT * FROM rework_tasks WHERE ncp_id = ?', [ncp.id]);
  assert(rework?.id, 'rework disposition did not create rework task');
  assert(rework.status === 'pending', 'new rework task should start as pending', rework);
  await assertDocumentLink('quality_inspection', inspection.id, 'nonconforming_product', ncp.id, 'inspection to NCP');
  await assertDocumentLink('nonconforming_product', ncp.id, 'rework_task', rework.id, 'NCP to rework task');
  mark('NCP rework downstream task created', { ncpId: ncp.id, reworkId: rework.id });

  const reportData = {
    title: `${marker} 8D rework closure`,
    ncp_id: ncp.id,
    priority: 'high',
    d1_team_leader: user.real_name,
    d1_team_members: [user.real_name],
    d2_problem_description: `${marker} process defect`,
    d2_occurrence_date: today,
    d2_quantity_affected: 5,
    d2_defect_type: 'closure-test',
    d3_containment_actions: ['isolate affected lot'],
    d4_root_cause: 'fixture drift',
    d5_corrective_actions: ['repair fixture', 'train operator'],
    d6_implementation_results: 'corrective action verified',
    d6_verification_method: 'reinspection',
    d6_verification_result: 'pass',
    d7_preventive_actions: ['add calibration checklist'],
    d7_standardization: 'updated work instruction',
    d8_summary: 'closure verified',
  };

  const createReportResponse = await callController(eightDReportController.createReport, {
    body: reportData,
    user,
  });
  const report = assertSuccess(createReportResponse, 'create 8D report');
  cleanup.reportIds.push(report.id);
  await assertDocumentLink('nonconforming_product', ncp.id, 'eight_d_report', report.id, 'NCP to 8D report');
  mark('8D report created and linked to NCP', { reportId: report.id, ncpId: ncp.id });

  await expectControllerStatus(
    eightDReportController.createReport,
    { body: { ...reportData, title: `${marker} duplicate 8D` }, user },
    400,
    'duplicate active 8D report blocked'
  );

  assertSuccess(
    await callController(eightDReportController.submitReview, { params: { id: report.id }, user }),
    'submit 8D phase1'
  );
  assertSuccess(
    await callController(eightDReportController.reviewReport, {
      params: { id: report.id },
      body: { approved: true, comments: marker },
      user,
    }),
    'approve 8D phase1'
  );
  assertSuccess(
    await callController(eightDReportController.submitPhase2Review, { params: { id: report.id }, user }),
    'submit 8D phase2'
  );
  assertSuccess(
    await callController(eightDReportController.reviewReport, {
      params: { id: report.id },
      body: { approved: true, comments: marker },
      user,
    }),
    'approve 8D phase2'
  );
  assertSuccess(
    await callController(eightDReportController.completeReport, { params: { id: report.id }, user }),
    'complete 8D report'
  );
  mark('8D staged workflow reached completed');

  await expectControllerStatus(
    eightDReportController.closeReport,
    { params: { id: report.id }, user },
    400,
    '8D close blocked while rework downstream is open'
  );

  assertSuccess(
    await callController(reworkTaskController.assignTask, {
      params: { id: rework.id },
      body: { assigned_to: user.real_name },
      user,
    }),
    'assign rework task'
  );
  assertSuccess(
    await callController(reworkTaskController.completeTask, {
      params: { id: rework.id },
      body: { actual_date: today, rework_cost: 12.34 },
      user,
    }),
    'complete rework task'
  );

  const completedRework = await queryOne('SELECT status, progress FROM rework_tasks WHERE id = ?', [rework.id]);
  assert(completedRework.status === 'completed', 'rework task not completed', completedRework);
  assert(Number(completedRework.progress) === 100, 'rework progress should be 100 after completion', completedRework);

  const reinspection = await queryOne(
    'SELECT id, inspection_no, status FROM quality_inspections WHERE note LIKE ? ORDER BY id DESC LIMIT 1',
    [`%${rework.rework_no}%`]
  );
  assert(reinspection?.id, 'rework completion did not create reinspection');
  cleanup.inspectionIds.push(reinspection.id);
  await assertDocumentLink('rework_task', rework.id, 'quality_inspection', reinspection.id, 'rework to reinspection');
  mark('rework completion created reinspection', { reinspectionId: reinspection.id });

  assertSuccess(
    await callController(eightDReportController.closeReport, { params: { id: report.id }, user }),
    'close 8D report after rework completion'
  );

  const closedNcp = await queryOne('SELECT status FROM nonconforming_products WHERE id = ?', [ncp.id]);
  assert(closedNcp.status === 'closed', '8D close did not close linked NCP', closedNcp);
  mark('8D close archived report and closed linked NCP', { ncpId: ncp.id, reportId: report.id });
}

async function verifyScrap(base, user) {
  const inspection = await createInspection('final', base, 2);
  const ncp = await createNcp(base, inspection, 2);
  await decideAndComplete(ncp, 'scrap', base);

  const scrap = await queryOne('SELECT * FROM scrap_records WHERE ncp_id = ?', [ncp.id]);
  assert(scrap?.id, 'scrap disposition did not create scrap record');
  assert(scrap.status === 'pending', 'scrap record should start pending', scrap);
  await assertDocumentLink('nonconforming_product', ncp.id, 'scrap_record', scrap.id, 'NCP to scrap record');

  await expectControllerStatus(
    scrapRecordController.completeScrap,
    { params: { id: scrap.id }, body: { scrap_cost: 50 }, user },
    400,
    'pending scrap cannot be completed directly'
  );

  assertSuccess(
    await callController(scrapRecordController.approveScrap, {
      params: { id: scrap.id },
      body: { approved: true, approver: user.real_name },
      user,
    }),
    'approve scrap'
  );
  assertSuccess(
    await callController(scrapRecordController.completeScrap, {
      params: { id: scrap.id },
      body: { scrap_cost: 50 },
      user,
    }),
    'complete scrap'
  );

  const completedScrap = await queryOne('SELECT status FROM scrap_records WHERE id = ?', [scrap.id]);
  assert(completedScrap.status === 'completed', 'scrap record was not completed', completedScrap);
  mark('scrap approval and completion closed', { ncpId: ncp.id, scrapId: scrap.id });

  const rejectedNcp = await createNcp(base, inspection, 22);
  await decideAndComplete(rejectedNcp, 'scrap', base);
  const rejectedScrap = await queryOne('SELECT * FROM scrap_records WHERE ncp_id = ?', [rejectedNcp.id]);
  assertSuccess(
    await callController(scrapRecordController.approveScrap, {
      params: { id: rejectedScrap.id },
      body: { approved: false, approver: user.real_name },
      user,
    }),
    'reject scrap'
  );
  const resetNcp = await queryOne('SELECT status, handled_quantity FROM nonconforming_products WHERE id = ?', [rejectedNcp.id]);
  assert(resetNcp.status === 'processing', 'scrap rejection did not reopen NCP handling', resetNcp);
  mark('scrap rejection reopens NCP for disposition correction', { ncpId: rejectedNcp.id });
}

async function verifyReplacement(base, user) {
  const inspection = await createInspection('incoming', base, 3);
  const ncp = await createNcp(base, inspection, 3);
  await decideAndComplete(ncp, 'replacement', base);

  const replacement = await queryOne('SELECT * FROM replacement_orders WHERE ncp_id = ?', [ncp.id]);
  assert(replacement?.id, 'replacement disposition did not create replacement order');
  assert(replacement.status === 'pending', 'replacement order should start pending', replacement);

  const purchaseReturn = await queryOne('SELECT id, status FROM purchase_returns WHERE return_no = ?', [replacement.return_no]);
  assert(purchaseReturn?.id, 'replacement did not create linked purchase return', replacement);
  await assertDocumentLink('nonconforming_product', ncp.id, 'purchase_return', purchaseReturn.id, 'NCP to purchase return');
  await assertDocumentLink('nonconforming_product', ncp.id, 'replacement_order', replacement.id, 'NCP to replacement order');
  await assertDocumentLink('purchase_return', purchaseReturn.id, 'replacement_order', replacement.id, 'purchase return to replacement');

  await expectControllerStatus(
    replacementOrderController.updateStatus,
    { params: { id: replacement.id }, body: { status: 'completed', note: marker }, user },
    400,
    'replacement completion cannot bypass receipt confirmation'
  );

  await expectControllerStatus(
    replacementOrderController.confirmReceipt,
    { params: { id: replacement.id }, body: { received_quantity: 0, actual_date: today, note: marker }, user },
    400,
    'replacement zero receipt quantity blocked'
  );

  const partialReceiptResponse = assertSuccess(
    await callController(replacementOrderController.confirmReceipt, {
      params: { id: replacement.id },
      body: { received_quantity: 2, actual_date: today, note: marker },
      user,
    }),
    'partial replacement receipt'
  );
  const partial = await queryOne('SELECT status, received_quantity FROM replacement_orders WHERE id = ?', [replacement.id]);
  assert(partial.status === 'partial' && Number(partial.received_quantity) === 2, 'partial replacement receipt state invalid', partial);
  assert(partialReceiptResponse.receipt?.receipt_id, 'partial replacement receipt did not return purchase receipt', partialReceiptResponse);
  await assertDocumentLink(
    'replacement_order',
    replacement.id,
    'purchase_receipt',
    partialReceiptResponse.receipt.receipt_id,
    'replacement to partial purchase receipt'
  );

  const partialReceipt = await queryOne(
    `SELECT pr.id, pr.receipt_no, pr.status, pri.received_quantity, pri.qualified_quantity, pri.batch_number
     FROM purchase_receipts pr
     JOIN purchase_receipt_items pri ON pri.receipt_id = pr.id
     WHERE pr.id = ?`,
    [partialReceiptResponse.receipt.receipt_id]
  );
  assert(partialReceipt?.status === 'completed', 'partial replacement receipt was not posted as completed', partialReceipt);
  assert(Number(partialReceipt.received_quantity) === 2, 'partial replacement receipt item quantity invalid', partialReceipt);
  assert(partialReceipt.batch_number, 'partial replacement receipt missing traceable batch number', partialReceipt);

  const partialLedger = await queryOne(
    `SELECT COUNT(*) AS ledger_count, COALESCE(SUM(quantity), 0) AS total_qty
     FROM inventory_ledger
     WHERE receipt_id = ?
       AND receipt_no = ?
       AND transaction_type = 'purchase_inbound'
       AND batch_number = ?`,
    [partialReceipt.id, partialReceipt.receipt_no, partialReceipt.batch_number]
  );
  assert(Number(partialLedger.ledger_count) > 0 && Number(partialLedger.total_qty) === 2, 'partial replacement receipt did not create inventory ledger', partialLedger);

  const completeReceiptResponse = assertSuccess(
    await callController(replacementOrderController.confirmReceipt, {
      params: { id: replacement.id },
      body: { received_quantity: 3, actual_date: today, note: marker },
      user,
    }),
    'complete replacement receipt'
  );
  const completed = await queryOne('SELECT status, received_quantity FROM replacement_orders WHERE id = ?', [replacement.id]);
  assert(completed.status === 'completed' && Number(completed.received_quantity) === 5, 'completed replacement receipt state invalid', completed);
  assert(completeReceiptResponse.receipt?.receipt_id, 'completed replacement receipt did not return purchase receipt', completeReceiptResponse);

  const linkedReceipts = await queryAll(
    `SELECT pr.id, pr.receipt_no, pr.status, pri.received_quantity, pri.batch_number
     FROM document_links dl
     JOIN purchase_receipts pr ON pr.id = dl.target_id
     JOIN purchase_receipt_items pri ON pri.receipt_id = pr.id
     WHERE dl.source_type = 'replacement_order'
       AND dl.source_id = ?
       AND dl.target_type = 'purchase_receipt'
     ORDER BY pr.id`,
    [replacement.id]
  );
  assert(linkedReceipts.length === 2, 'replacement order should link both partial purchase receipts', linkedReceipts);
  assert(linkedReceipts.every((row) => row.status === 'completed'), 'replacement linked receipts must be completed', linkedReceipts);
  assert(
    linkedReceipts.reduce((sum, row) => sum + Number(row.received_quantity || 0), 0) === 5,
    'replacement linked receipt quantities do not match replacement quantity',
    linkedReceipts
  );

  const receiptIds = linkedReceipts.map((row) => row.id);
  const receiptNos = linkedReceipts.map((row) => row.receipt_no);
  const receiptPlaceholders = receiptIds.map(() => '?').join(',');
  const replacementLedger = await queryOne(
    `SELECT COUNT(*) AS ledger_count, COALESCE(SUM(quantity), 0) AS total_qty
     FROM inventory_ledger
     WHERE receipt_id IN (${receiptPlaceholders})
       AND transaction_type = 'purchase_inbound'`,
    receiptIds
  );
  assert(
    Number(replacementLedger.ledger_count) === 2 && Number(replacementLedger.total_qty) === 5,
    'replacement receipts did not create complete inventory ledger quantity',
    { replacementLedger, receiptNos }
  );
  assert(
    (await countDocumentLinks('nonconforming_product', ncp.id, 'purchase_receipt')) === 2,
    'NCP should link both replacement purchase receipts'
  );
  mark('replacement receipt purchase, inventory and document chain closed', {
    replacementId: replacement.id,
    receiptNos,
  });
}

async function verifyConcession(base, user) {
  const inspection = await createInspection('incoming', base, 4);
  const ncp = await createNcp(base, inspection, 4);

  await NonconformingProductService.applyConcession(ncp.id, {
    reason: `${marker} concession request`,
    applicant: user.real_name,
  });
  await NonconformingProductService.approveConcession(ncp.id, {
    status: 'rejected',
    approverId: user.id,
    approverName: user.real_name,
  });
  const rejected = await queryOne('SELECT status, disposition, concession_status FROM nonconforming_products WHERE id = ?', [ncp.id]);
  assert(rejected.status === 'pending' && rejected.disposition === 'pending', 'rejected concession did not reset NCP', rejected);

  await NonconformingProductService.applyConcession(ncp.id, {
    reason: `${marker} approved concession request`,
    applicant: user.real_name,
  });
  await NonconformingProductService.approveConcession(ncp.id, {
    status: 'approved',
    approverId: user.id,
    approverName: user.real_name,
  });
  const approved = await queryOne('SELECT status, disposition, handled_quantity FROM nonconforming_products WHERE id = ?', [ncp.id]);
  assert(approved.status === 'completed' && approved.disposition === 'use_as_is', 'approved concession did not complete use-as-is NCP', approved);

  const receipt = await queryOne('SELECT id, status FROM purchase_receipts WHERE remarks LIKE ?', [`%${ncp.ncp_no}%`]);
  assert(receipt?.id, 'approved concession did not create receiving document');
  await assertDocumentLink('nonconforming_product', ncp.id, 'purchase_receipt', receipt.id, 'NCP concession to purchase receipt');
  mark('concession rejection and approval flow closed', { ncpId: ncp.id, receiptId: receipt.id });
}

async function verifyGaugeAndSpc(base, user) {
  const gaugeResponse = await callController(gaugeController.createGauge, {
    body: {
      gauge_no: `QV_GAUGE_${stamp}`,
      gauge_name: `Quality Verify Gauge ${stamp}`,
      gauge_type: 'caliper',
      status: 'idle',
      last_calibration_date: today,
      calibration_cycle_days: 30,
      note: marker,
    },
    user,
  });
  const gauge = assertSuccess(gaugeResponse, 'create gauge');
  cleanup.gaugeIds.push(gauge.id);

  assertSuccess(
    await callController(gaugeController.createCalibrationRecord, {
      body: {
        gauge_id: gauge.id,
        calibration_date: today,
        calibrated_by: user.real_name,
        result: 'qualified',
        note: marker,
      },
      user,
    }),
    'create calibration record'
  );
  const calibratedGauge = await queryOne('SELECT status, last_calibration_date, next_calibration_date FROM gauges WHERE id = ?', [gauge.id]);
  assert(calibratedGauge.status === 'in_use', 'qualified calibration did not return gauge to in_use', calibratedGauge);
  assert(calibratedGauge.next_calibration_date, 'calibration did not update next due date', calibratedGauge);
  mark('gauge calibration updates gauge master data', { gaugeId: gauge.id });

  const planResponse = await callController(spcController.createControlPlan, {
    body: {
      plan_name: `${marker} SPC plan`,
      product_id: base.materialId,
      product_code: base.materialCode,
      product_name: base.materialName,
      characteristic: 'diameter',
      usl: 10.2,
      lsl: 9.8,
      target_value: 10,
      subgroup_size: 3,
      chart_type: 'xbar_r',
      is_active: 1,
      note: marker,
    },
    user,
  });
  const plan = assertSuccess(planResponse, 'create SPC plan');
  cleanup.spcPlanIds.push(plan.id);

  for (const subgroupNo of [1, 2, 3]) {
    assertSuccess(
      await callController(spcController.addDataPoints, {
        body: {
          plan_id: plan.id,
          subgroup_no: subgroupNo,
          samples: [
            { measured_value: 9.98, measured_by: user.real_name, batch_no: `${marker}_SPC` },
            { measured_value: 10.01, measured_by: user.real_name, batch_no: `${marker}_SPC` },
            { measured_value: 10.04, measured_by: user.real_name, batch_no: `${marker}_SPC` },
          ],
        },
        user,
      }),
      `add SPC data subgroup ${subgroupNo}`
    );
  }

  const cpk = assertSuccess(
    await callController(spcController.getCpk, { params: { id: plan.id }, user }),
    'calculate SPC CPK'
  );
  assert(cpk.n === 9 && cpk.cpk !== null, 'SPC CPK calculation did not use inserted samples', cpk);

  const chart = assertSuccess(
    await callController(spcController.getControlChart, { params: { id: plan.id }, user }),
    'calculate SPC control chart'
  );
  assert(chart.subgroup_count === 3 && chart.total_samples === 9, 'SPC chart did not return expected subgroup data', chart);
  mark('SPC data entry, CPK and control chart closed', { planId: plan.id });
}

async function verifyStaticRoutesAndPermissions() {
  const root = path.resolve(__dirname, '..', '..');
  const qualityAdvancedRoutes = fs.readFileSync(path.join(root, 'backend/src/routes/business/qualityAdvancedRoutes.js'), 'utf8');
  assert(qualityAdvancedRoutes.includes("requirePermission('quality:spc:update')"), 'SPC write routes do not use quality:spc:update');
  assert(
    qualityAdvancedRoutes.includes("requirePermission('quality:supplier-quality:update')"),
    'supplier quality write routes do not use quality:supplier-quality:update'
  );

  const batchRoutes = fs.readFileSync(path.join(root, 'backend/src/routes/business/traceability/batchTraceabilityRoutes.js'), 'utf8');
  const agingIndex = batchRoutes.indexOf("'/batch/aging-report'");
  const paramIndex = batchRoutes.indexOf("'/batch/:materialCode/:batchNumber'");
  assert(agingIndex >= 0 && paramIndex >= 0 && agingIndex < paramIndex, 'batch aging route is still shadowed by parameter route');

  const authStore = fs.readFileSync(path.join(root, 'frontend/src/stores/auth.js'), 'utf8');
  assert(authStore.includes('quality:incoming') && authStore.includes('quality:inspections'), 'quality permission aliases missing in auth store');

  const ncpView = fs.readFileSync(path.join(root, 'frontend/src/views/quality/NonconformingProducts.vue'), 'utf8');
  assert(ncpView.includes("quality:nonconforming:update"), 'NCP operation buttons are not bound to nonconforming update permission');
  assert(ncpView.includes("scope.row.status === 'pending'") || ncpView.includes("row.status === 'pending'"), 'NCP delete button is not restricted to pending rows');

  mark('quality route order and frontend permission wiring verified');
}

async function cleanupData() {
  const ncpIds = cleanup.ncpRecords.map((record) => record.id);
  const ncpNos = cleanup.ncpRecords.map((record) => record.ncpNo);

  for (const ncpNo of ncpNos) {
    const [receiptRows] = await db.pool.query('SELECT id FROM purchase_receipts WHERE remarks LIKE ?', [`%${ncpNo}%`]);
    const receiptIds = receiptRows.map((row) => row.id);
    if (receiptIds.length > 0) {
      await deleteDocumentLinksByTypeIds('purchase_receipt', receiptIds);
      await db.pool.query(`DELETE FROM purchase_receipt_items WHERE receipt_id IN (${receiptIds.map(() => '?').join(',')})`, receiptIds);
      await db.pool.query(`DELETE FROM purchase_receipts WHERE id IN (${receiptIds.map(() => '?').join(',')})`, receiptIds);
    }

    const [returnRows] = await db.pool.query(
      "SELECT id FROM purchase_returns WHERE source_type = 'ncp_return' AND remarks LIKE ?",
      [`%${ncpNo}%`]
    );
    const returnIds = returnRows.map((row) => row.id);
    if (returnIds.length > 0) {
      await deleteDocumentLinksByTypeIds('purchase_return', returnIds);
      await db.pool.query(`DELETE FROM purchase_return_items WHERE return_id IN (${returnIds.map(() => '?').join(',')})`, returnIds);
      await db.pool.query(`DELETE FROM purchase_returns WHERE id IN (${returnIds.map(() => '?').join(',')})`, returnIds);
    }

    const [reinspectionRows] = await db.pool.query('SELECT id FROM quality_inspections WHERE note LIKE ?', [`%${ncpNo}%`]);
    cleanup.inspectionIds.push(...reinspectionRows.map((row) => row.id));
  }

  if (cleanup.spcPlanIds.length > 0) {
    await db.pool.query(`DELETE FROM spc_data_points WHERE plan_id IN (${cleanup.spcPlanIds.map(() => '?').join(',')})`, cleanup.spcPlanIds);
    await db.pool.query(`DELETE FROM spc_control_plans WHERE id IN (${cleanup.spcPlanIds.map(() => '?').join(',')})`, cleanup.spcPlanIds);
  }

  if (cleanup.gaugeIds.length > 0) {
    await db.pool.query(`DELETE FROM gauge_calibration_records WHERE gauge_id IN (${cleanup.gaugeIds.map(() => '?').join(',')})`, cleanup.gaugeIds);
    await db.pool.query(`DELETE FROM gauges WHERE id IN (${cleanup.gaugeIds.map(() => '?').join(',')})`, cleanup.gaugeIds);
  }

  if (cleanup.reportIds.length > 0) {
    await deleteDocumentLinksByTypeIds('eight_d_report', cleanup.reportIds);
    await db.pool.query(`DELETE FROM eight_d_logs WHERE report_id IN (${cleanup.reportIds.map(() => '?').join(',')})`, cleanup.reportIds);
    await db.pool.query(`DELETE FROM eight_d_reports WHERE id IN (${cleanup.reportIds.map(() => '?').join(',')})`, cleanup.reportIds);
  }

  if (ncpIds.length > 0) {
    const [reworkRows] = await db.pool.query(`SELECT id FROM rework_tasks WHERE ncp_id IN (${ncpIds.map(() => '?').join(',')})`, ncpIds);
    const [scrapRows] = await db.pool.query(`SELECT id FROM scrap_records WHERE ncp_id IN (${ncpIds.map(() => '?').join(',')})`, ncpIds);
    const [replacementRows] = await db.pool.query(`SELECT id FROM replacement_orders WHERE ncp_id IN (${ncpIds.map(() => '?').join(',')})`, ncpIds);
    await deleteDocumentLinksByTypeIds('rework_task', reworkRows.map((row) => row.id));
    await deleteDocumentLinksByTypeIds('scrap_record', scrapRows.map((row) => row.id));
    await deleteDocumentLinksByTypeIds('replacement_order', replacementRows.map((row) => row.id));
    await deleteDocumentLinksByTypeIds('nonconforming_product', ncpIds);
    await db.pool.query(`DELETE FROM rework_tasks WHERE ncp_id IN (${ncpIds.map(() => '?').join(',')})`, ncpIds);
    await db.pool.query(`DELETE FROM scrap_records WHERE ncp_id IN (${ncpIds.map(() => '?').join(',')})`, ncpIds);
    await db.pool.query(`DELETE FROM replacement_orders WHERE ncp_id IN (${ncpIds.map(() => '?').join(',')})`, ncpIds);
    await db.pool.query(`DELETE FROM nonconforming_product_actions WHERE ncp_id IN (${ncpIds.map(() => '?').join(',')})`, ncpIds);
    await db.pool.query(`DELETE FROM nonconforming_products WHERE id IN (${ncpIds.map(() => '?').join(',')})`, ncpIds);
  }

  const inspectionIds = [...new Set(cleanup.inspectionIds)];
  if (inspectionIds.length > 0) {
    await deleteDocumentLinksByTypeIds('quality_inspection', inspectionIds);
    await db.pool.query(`DELETE FROM quality_inspection_items WHERE inspection_id IN (${inspectionIds.map(() => '?').join(',')})`, inspectionIds);
    await db.pool.query(`DELETE FROM quality_inspections WHERE id IN (${inspectionIds.map(() => '?').join(',')})`, inspectionIds);
  }

  if (cleanup.materialIds.length > 0) {
    const [materialRows] = await db.pool.query(
      `SELECT code FROM materials WHERE id IN (${cleanup.materialIds.map(() => '?').join(',')})`,
      cleanup.materialIds
    );
    const materialCodes = materialRows.map((row) => row.code).filter(Boolean);
    if (materialCodes.length > 0) {
      await db.pool.query(
        `DELETE FROM quality_costs WHERE material_code IN (${materialCodes.map(() => '?').join(',')})`,
        materialCodes
      );
    }
    await db.pool.query(`DELETE FROM inventory_ledger WHERE material_id IN (${cleanup.materialIds.map(() => '?').join(',')})`, cleanup.materialIds);
    await db.pool.query(`DELETE FROM materials WHERE id IN (${cleanup.materialIds.map(() => '?').join(',')})`, cleanup.materialIds);
  }
  if (cleanup.supplierIds.length > 0) {
    await db.pool.query(`DELETE FROM suppliers WHERE id IN (${cleanup.supplierIds.map(() => '?').join(',')})`, cleanup.supplierIds);
  }
  if (cleanup.locationIds.length > 0) {
    await db.pool.query(`DELETE FROM locations WHERE id IN (${cleanup.locationIds.map(() => '?').join(',')})`, cleanup.locationIds);
  }
}

async function main() {
  try {
    await ensureCodeRules();
    const user = await ensureAdminContext();
    const base = await createBaseData();

    await verifyReworkAndEightD(base, user);
    await verifyScrap(base, user);
    await verifyReplacement(base, user);
    await verifyConcession(base, user);
    await verifyGaugeAndSpc(base, user);
    await verifyStaticRoutesAndPermissions();

    console.log(`QUALITY_CLOSURE_VERIFY_OK ${results.length} checks passed`);
  } finally {
    await cleanupData();
    await db.pool.end();
  }
}

main().catch(async (error) => {
  console.error('QUALITY_CLOSURE_VERIFY_FAILED', error.message);
  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exit(1);
});
