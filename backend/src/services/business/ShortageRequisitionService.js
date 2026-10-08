/**
 * ShortageRequisitionService
 * 出库缺料 → 自动生成采购申请（草稿）
 * 可选：生成后自动提交并生成采购订单
 *
 * 开关（businessRules.purchase）：
 * - autoCreatePROnIssueShortage（默认 true）
 * - autoSubmitPROnIssueShortage（默认 true；失败保留 draft）
 */

const { logger } = require('../../utils/logger');
const { CodeGenerators } = require('../../utils/codeGenerator');
const businessRulesConfig = require('../../config/businessRulesConfig');
const { DOCUMENT_LINK_TYPES } = require('../../constants/documentLinkTypes');
const {
  getPendingRequisitionQtyByMaterial,
  splitByCoverage,
} = require('./PendingPurchaseCoverageService');

/**
 * @param {object} connection mysql connection (in transaction)
 * @param {object} opts
 * @param {number} opts.outboundId
 * @param {string} opts.outboundNo
 * @param {string|null} opts.referenceType
 * @param {number|null} opts.referenceId
 * @param {string} opts.operator
 * @param {number|null} opts.operatorUserId
 * @param {Array<{material_id, material_code, material_name, material_specs, unit_id, unit_name, shortage_quantity}>} opts.shortageItems
 */
async function createRequisitionFromOutboundShortage(connection, opts = {}) {
  const {
    outboundId,
    outboundNo,
    referenceType = null,
    referenceId = null,
    operator = 'system',
    operatorUserId = null,
    shortageItems = [],
  } = opts;

  if (!outboundId || !Array.isArray(shortageItems) || shortageItems.length === 0) {
    return { created: false, reason: 'no_shortage_items' };
  }

  let enabled = true;
  let autoSubmit = true;
  try {
    const rules = await businessRulesConfig.getModuleRules('purchase');
    if (rules && Object.prototype.hasOwnProperty.call(rules, 'autoCreatePROnIssueShortage')) {
      enabled = Boolean(rules.autoCreatePROnIssueShortage);
    }
    if (rules && Object.prototype.hasOwnProperty.call(rules, 'autoSubmitPROnIssueShortage')) {
      autoSubmit = Boolean(rules.autoSubmitPROnIssueShortage);
    }
  } catch (e) {
    logger.warn('[ShortageRequisition] 读取业务规则失败，使用默认开启:', e.message);
  }

  if (!enabled) {
    return { created: false, reason: 'disabled_by_config' };
  }

  // 同一出库单只生成一次请购（按备注/源关联去重）
  const [existing] = await connection.execute(
    `SELECT id, requisition_number, status
     FROM purchase_requisitions
     WHERE deleted_at IS NULL
       AND status NOT IN ('cancelled', 'rejected')
       AND (
         remarks LIKE ?
         OR (source_type = 'inventory_outbound' AND source_id = ?)
       )
     ORDER BY id DESC
     LIMIT 1`,
    [`%出库缺料自动请购 ${outboundNo || outboundId}%`, outboundId]
  );
  if (existing.length > 0) {
    logger.info(
      `[ShortageRequisition] 出库 ${outboundNo} 已有请购 ${existing[0].requisition_number}，跳过创建`
    );
    let submitInfo = { submitted: false, status: existing[0].status };
    if (autoSubmit && String(existing[0].status) === 'draft') {
      try {
        submitInfo = await submitRequisition(connection, {
          requisitionId: existing[0].id,
          requisitionNo: existing[0].requisition_number,
          initiatorId: operatorUserId || null,
        });
      } catch (e) {
        logger.error(
          `[ShortageRequisition] 已有请购 ${existing[0].requisition_number} 自动提交失败:`,
          e
        );
      }
    }
    return {
      created: false,
      reason: 'already_exists',
      requisitionId: existing[0].id,
      requisitionNo: existing[0].requisition_number,
      status: submitInfo.status || existing[0].status,
      submitted: Boolean(submitInfo.submitted),
      generatedOrders: submitInfo.generatedOrders || [],
    };
  }

  // 合并同物料缺料量
  const byMaterial = new Map();
  for (const item of shortageItems) {
    const mid = Number(item.material_id);
    if (!Number.isFinite(mid) || mid <= 0) continue;
    const qty = Number(item.shortage_quantity) || 0;
    if (qty <= 0) continue;
    const prev = byMaterial.get(mid);
    if (prev) {
      prev.quantity += qty;
    } else {
      byMaterial.set(mid, {
        material_id: mid,
        material_code: item.material_code || '',
        material_name: item.material_name || '',
        specification: item.material_specs || item.specification || '',
        unit_id: item.unit_id || null,
        unit: item.unit_name || item.unit || '',
        quantity: qty,
      });
    }
  }

  if (byMaterial.size === 0) {
    return { created: false, reason: 'no_valid_materials' };
  }

  // 补全物料主数据
  for (const line of byMaterial.values()) {
    if (!line.material_code || !line.material_name) {
      const [rows] = await connection.execute(
        'SELECT code, name, specs, unit_id FROM materials WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [line.material_id]
      );
      if (rows[0]) {
        line.material_code = line.material_code || rows[0].code || '';
        line.material_name = line.material_name || rows[0].name || '';
        line.specification = line.specification || rows[0].specs || '';
        line.unit_id = line.unit_id || rows[0].unit_id || null;
      }
    }
    if (line.unit_id && !line.unit) {
      const [urows] = await connection.execute(
        'SELECT name FROM units WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [line.unit_id]
      );
      if (urows[0]) line.unit = urows[0].name;
    }
    if (!line.material_code || !line.material_name) {
      logger.warn(`[ShortageRequisition] 跳过物料不完整 id=${line.material_id}`);
      byMaterial.delete(line.material_id);
    }
  }

  if (byMaterial.size === 0) {
    return { created: false, reason: 'materials_incomplete' };
  }

  // 与低库存预警共用：已有在途请购覆盖的物料只补差额
  const pendingMap = await getPendingRequisitionQtyByMaterial(connection, [...byMaterial.keys()]);
  const { covered, uncovered } = splitByCoverage(
    [...byMaterial.values()].map((line) => ({
      ...line,
      shortage_quantity: line.quantity,
    })),
    pendingMap
  );
  for (const c of covered) {
    logger.info(
      `[ShortageRequisition] 物料 ${c.material_code || c.material_id} 已有在途请购覆盖 pending=${c.pending_quantity} shortage=${c.original_shortage || c.shortage_quantity}，跳过`
    );
    byMaterial.delete(Number(c.material_id));
  }
  for (const u of uncovered) {
    const line = byMaterial.get(Number(u.material_id));
    if (line) line.quantity = u.adjusted_shortage || u.shortage_quantity;
  }

  if (byMaterial.size === 0) {
    // 物料已被在途请购覆盖：若覆盖的是 draft，尝试自动提交转单，避免卡在草稿
    let submittedDrafts = [];
    if (autoSubmit && covered.length) {
      submittedDrafts = await submitDraftRequisitionsForMaterials(
        connection,
        covered.map((c) => c.material_id),
        operatorUserId
      );
    }
    return {
      created: false,
      reason: 'already_covered_by_pending_pr',
      coveredCount: covered.length,
      submittedDrafts,
    };
  }

  const lines = [...byMaterial.values()].filter((l) => Number(l.quantity) > 0);
  if (!lines.length) {
    let submittedDrafts = [];
    if (autoSubmit && covered.length) {
      submittedDrafts = await submitDraftRequisitionsForMaterials(
        connection,
        covered.map((c) => c.material_id),
        operatorUserId
      );
    }
    return {
      created: false,
      reason: 'already_covered_by_pending_pr',
      coveredCount: covered.length,
      submittedDrafts,
    };
  }
  const firstMaterialId = lines[0].material_id;

  // 源：优先生产任务，其次出库单
  let sourceType = 'inventory_outbound';
  let sourceId = outboundId;
  if (referenceType === 'production_task' && referenceId) {
    sourceType = 'production_task';
    sourceId = referenceId;
  } else if (referenceType === 'production_plan' && referenceId) {
    sourceType = 'production_plan';
    sourceId = referenceId;
  }

  const requisitionNo = await CodeGenerators.generatePurchaseRequisitionCode(connection);
  const requestDate = new Date().toISOString().slice(0, 10);
  const remarks = `出库缺料自动请购 ${outboundNo || outboundId}（${lines.length} 项物料）`;

  // created_by：仅用稳定身份（user id / username），禁止 real_name 反查
  let createdBy = null;
  if (operatorUserId) {
    createdBy = Number(operatorUserId) || null;
  } else if (operator && operator !== 'system') {
    const asId = Number(operator);
    if (Number.isInteger(asId) && asId > 0) {
      const [byId] = await connection.execute(
        'SELECT id FROM users WHERE id = ? AND status = 1 LIMIT 1',
        [asId]
      );
      createdBy = byId[0]?.id || null;
    } else {
      const [users] = await connection.execute(
        'SELECT id FROM users WHERE BINARY username = BINARY ? AND status = 1 LIMIT 1',
        [String(operator).trim()]
      );
      createdBy = users[0]?.id || null;
    }
  }

  const [ins] = await connection.execute(
    `INSERT INTO purchase_requisitions
      (requisition_number, request_date, requester, real_name, remarks, status,
       source_type, source_id, source_material_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, NOW(), NOW())`,
    [
      requisitionNo,
      requestDate,
      operator || 'system',
      operator === 'system' ? '系统自动' : operator,
      remarks,
      sourceType,
      sourceId,
      firstMaterialId,
      createdBy,
    ]
  );
  const requisitionId = ins.insertId;

  for (const line of lines) {
    await connection.execute(
      `INSERT INTO purchase_requisition_items
        (requisition_id, material_id, material_code, material_name, specification, unit, unit_id, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requisitionId,
        line.material_id,
        line.material_code,
        line.material_name,
        line.specification || '',
        line.unit || '',
        line.unit_id,
        line.quantity,
      ]
    );
  }

  // document_links：出库 → 请购
  try {
    await connection.execute(
      `INSERT IGNORE INTO document_links
        (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'generate', ?, ?)`,
      [
        DOCUMENT_LINK_TYPES.INVENTORY_OUTBOUND,
        outboundId,
        outboundNo || null,
        DOCUMENT_LINK_TYPES.PURCHASE_REQUISITION,
        requisitionId,
        requisitionNo,
        '出库缺料自动请购',
        createdBy,
      ]
    );
  } catch (linkErr) {
    logger.warn('[ShortageRequisition] document_links 写入跳过:', linkErr.message);
  }

  // 回写缺料记录状态（若有 requisition 字段则更新，无则忽略）
  try {
    const [cols] = await connection.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'material_shortage_records'
         AND COLUMN_NAME IN ('requisition_id', 'requisition_no', 'status')`
    );
    const colSet = new Set(cols.map((c) => c.COLUMN_NAME));
    if (colSet.has('requisition_id') || colSet.has('status')) {
      const sets = [];
      const params = [];
      if (colSet.has('requisition_id')) {
        sets.push('requisition_id = ?');
        params.push(requisitionId);
      }
      if (colSet.has('requisition_no')) {
        sets.push('requisition_no = ?');
        params.push(requisitionNo);
      }
      if (colSet.has('status')) {
        sets.push("status = 'processing'");
      }
      if (sets.length) {
        params.push(outboundId);
        await connection.execute(
          `UPDATE material_shortage_records SET ${sets.join(', ')} WHERE outbound_id = ?`,
          params
        );
      }
    }
  } catch (e) {
    logger.warn('[ShortageRequisition] 缺料记录回写跳过:', e.message);
  }

  logger.info(
    `[ShortageRequisition] 已创建请购 ${requisitionNo} id=${requisitionId} items=${lines.length} from outbound ${outboundNo}`
  );

  let submitted = false;
  let generatedOrders = [];
  let finalStatus = 'draft';

  if (autoSubmit) {
    try {
      const submitResult = await submitRequisition(connection, {
        requisitionId,
        requisitionNo,
        initiatorId: createdBy || operatorUserId || null,
      });
      submitted = Boolean(submitResult.submitted);
      generatedOrders = submitResult.generatedOrders || [];
      finalStatus = submitResult.status;
    } catch (submitErr) {
      // 提交失败不回滚请购创建，保留 draft 供人工处理
      logger.error(
        `[ShortageRequisition] 请购 ${requisitionNo} 自动提交转单失败，保留 draft:`,
        submitErr
      );
    }
  }

  return {
    created: true,
    requisitionId,
    requisitionNo,
    itemCount: lines.length,
    status: finalStatus,
    submitted,
    generatedOrders,
    coveredSkipped: covered.length,
  };
}

/**
 * 对覆盖指定物料的草稿请购尝试自动提交
 */
async function submitDraftRequisitionsForMaterials(connection, materialIds, initiatorId) {
  const ids = [...new Set((materialIds || []).map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return [];

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await connection.execute(
    `SELECT DISTINCT pr.id, pr.requisition_number
     FROM purchase_requisitions pr
     JOIN purchase_requisition_items pri ON pri.requisition_id = pr.id
     WHERE pr.deleted_at IS NULL
       AND pr.status = 'draft'
       AND pri.material_id IN (${placeholders})
     ORDER BY pr.id DESC
     LIMIT 20`,
    ids
  );

  const results = [];
  for (const row of rows) {
    try {
      const r = await submitRequisition(connection, {
        requisitionId: row.id,
        requisitionNo: row.requisition_number,
        initiatorId,
      });
      results.push({
        requisitionId: row.id,
        requisitionNo: row.requisition_number,
        ...r,
      });
    } catch (e) {
      logger.error(`[ShortageRequisition] 草稿请购 ${row.requisition_number} 自动提交失败:`, e);
      results.push({
        requisitionId: row.id,
        requisitionNo: row.requisition_number,
        submitted: false,
        error: e.message,
      });
    }
  }
  return results;
}

/**
 * 将草稿请购直接提交转单。调用方持有出库事务，转单失败只回滚本次提交。
 */
async function submitRequisition(connection, { requisitionId, requisitionNo, initiatorId }) {
  if (!initiatorId) {
    // 系统生成的申请缺少操作人时，使用活跃管理员作为订单责任人兜底。
    const [admins] = await connection.execute(
      `SELECT u.id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id AND r.status = 1 AND r.is_super_admin = 1
       WHERE u.status = 1
       ORDER BY u.id
       LIMIT 1`
    );
    initiatorId = admins[0]?.id || null;
  }
  await connection.query('SAVEPOINT shortage_requisition_submit');
  try {
    const [[requisition]] = await connection.execute(
      `SELECT status FROM purchase_requisitions
       WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [requisitionId]
    );
    if (!requisition) throw new Error('采购申请不存在或已被删除');
    if (requisition.status !== 'draft') {
      await connection.query('RELEASE SAVEPOINT shortage_requisition_submit');
      return { submitted: false, status: requisition.status, generatedOrders: [] };
    }

    await connection.execute(
      `UPDATE purchase_requisitions
       SET status = 'submitted', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'draft' AND deleted_at IS NULL`,
      [requisitionId]
    );
    const { generateOrdersFromRequisition } = require('./RequisitionAutoOrderService');
    const generatedOrders = await generateOrdersFromRequisition(
      requisitionId,
      connection,
      initiatorId
    );
    await connection.query('RELEASE SAVEPOINT shortage_requisition_submit');

    logger.info(`[ShortageRequisition] 请购 ${requisitionNo} 已提交并生成采购订单`);

    return { submitted: true, status: 'completed', generatedOrders };
  } catch (error) {
    await connection.query('ROLLBACK TO SAVEPOINT shortage_requisition_submit');
    await connection.query('RELEASE SAVEPOINT shortage_requisition_submit');
    throw error;
  }
}

module.exports = {
  createRequisitionFromOutboundShortage,
  submitRequisition,
};
