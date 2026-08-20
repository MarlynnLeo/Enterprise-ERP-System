/**
 * outboundBomController.js - 出库单BOM和批量操作
 * 从 inventoryOutboundController.js 拆分
 */

const { ResponseHandler } = require('../../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../../utils/fieldMap');
const { logger } = require('../../../../utils/logger');
const { CodeGenerators } = require('../../../../utils/codeGenerator');
const db = require('../../../../config/db');
const InventoryService = require('../../../../services/InventoryService');
const { _syncProductionStatus } = require('../inventoryConsistencyController');
const { getRequestActorLabel } = require('../../../../utils/userUtils');
const {
  calculateMaterialRequirementsWithStock,
} = require('../../../../services/business/MaterialCalculationService');

const {
  getMaterialInfoMap,
  getProductionPlanMaterialRows,
  getTaskNetRequirementRows,
  insertOutboundRequirementItems,
  mergeRequirementRows,
  normalizeIssueQuantities,
  assertOutboundSourceAccess,
} = require('./outboundHelpers');
const ScopeGuard = require('../../../../authorization/ScopeGuard');



const fetchBomItemsForOutbound = async (connection, outboundId, referenceType, referenceId) => {
  try {
    const materialMap = new Map();

    if (referenceType === 'production_task') {
      const [tasks] = await connection.execute(
        `SELECT
           pt.id,
           pt.code,
           pt.product_id,
           pt.quantity,
           pt.plan_id,
           pp.quantity AS plan_quantity,
           pp.bom_id
         FROM production_tasks pt
         LEFT JOIN production_plans pp ON pp.id = pt.plan_id
         WHERE pt.id = ?`,
        [referenceId]
      );

      if (tasks.length === 0) {
        return { success: false, itemCount: 0, error: '生产任务不存在' };
      }

      const rows = await getTaskNetRequirementRows(connection, tasks[0]);
      mergeRequirementRows(materialMap, rows);
    } else if (referenceType === 'production_plan') {
      const planRows = await getProductionPlanMaterialRows(connection, referenceId);
      if (planRows.length > 0) {
        mergeRequirementRows(materialMap, planRows);
      } else {
        const [plans] = await connection.execute(
          `SELECT product_id, quantity, bom_id
           FROM production_plans
           WHERE id = ?`,
          [referenceId]
        );

        if (plans.length === 0) {
          return { success: false, itemCount: 0, error: '生产计划不存在' };
        }

        const requirements = await calculateMaterialRequirementsWithStock(
          plans[0].product_id,
          plans[0].bom_id || null,
          parseFloat(plans[0].quantity) || 0,
          referenceId
        );

        mergeRequirementRows(
          materialMap,
          requirements.map((item) => ({
            material_id: item.materialId,
            required_quantity: item.requiredQuantity,
            level: item.level || 1,
            unit_id: item.unitId || null,
          }))
        );
      }
    } else {
      return { success: false, itemCount: 0, error: '不支持的生产出库来源类型' };
    }

    if (materialMap.size === 0) {
      return { success: false, itemCount: 0, error: '统一净需求结果为空，无法生成生产出库明细' };
    }

    const itemCount = await insertOutboundRequirementItems(connection, outboundId, materialMap);
    logger.info(`已从统一净需求生成 ${itemCount} 条生产出库明细到出库单 ${outboundId}`);
    return { success: true, itemCount };
  } catch (error) {
    logger.error('从统一净需求生成生产出库明细失败:', error);
    return { success: false, itemCount: 0, error: error.message };
  }
};

const fetchBatchBomItemsForOutbound = async (connection, outboundId, taskIds) => {
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return { success: false, itemCount: 0, error: '批量发料缺少来源生产任务' };
  }

  try {
    const placeholders = taskIds.map(() => '?').join(',');
    const [tasks] = await connection.execute(
      `SELECT
         pt.id,
         pt.code,
         pt.product_id,
         pt.quantity,
         pt.plan_id,
         pp.quantity AS plan_quantity,
         pp.bom_id,
         p.code AS product_code,
         p.name AS product_name
       FROM production_tasks pt
       LEFT JOIN production_plans pp ON pp.id = pt.plan_id
       LEFT JOIN materials p ON pt.product_id = p.id
       WHERE pt.id IN (${placeholders})`,
      taskIds
    );

    if (tasks.length !== taskIds.length) {
      return { success: false, itemCount: 0, error: '部分来源生产任务不存在' };
    }

    const materialMap = new Map();
    for (const task of tasks) {
      const rows = await getTaskNetRequirementRows(connection, task);
      mergeRequirementRows(materialMap, rows, 1, {
        task_id: task.id,
        task_code: task.code,
        product_code: task.product_code,
        product_name: task.product_name,
      });
    }

    if (materialMap.size === 0) {
      return { success: false, itemCount: 0, error: '统一净需求结果为空，无法生成批量发料明细' };
    }

    const itemCount = await insertOutboundRequirementItems(connection, outboundId, materialMap);
    return { success: true, itemCount };
  } catch (error) {
    logger.error('批量发料从统一净需求生成明细失败:', error);
    return { success: false, itemCount: 0, error: error.message };
  }
};

// 更新出库单状态

const parseSourceTaskIds = (sourceTaskIds) => {
  if (!sourceTaskIds) return [];
  if (Array.isArray(sourceTaskIds)) return sourceTaskIds.map(Number).filter(Number.isInteger);

  try {
    const parsed = JSON.parse(sourceTaskIds);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
};

const MAX_SUPPLEMENT_ITEMS = 500;
const MAX_BATCH_TASKS = 500;

const normalizeSupplementItems = (items) => {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_SUPPLEMENT_ITEMS) {
    return null;
  }

  const normalized = [];
  const outboundItemIds = new Set();
  for (const item of items) {
    const outboundItemId = Number(item?.outbound_item_id);
    const materialId = Number(item?.material_id);
    const quantity = Number(item?.quantity);
    if (
      !Number.isInteger(outboundItemId) ||
      outboundItemId <= 0 ||
      !Number.isInteger(materialId) ||
      materialId <= 0 ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      outboundItemIds.has(outboundItemId)
    ) {
      return null;
    }
    outboundItemIds.add(outboundItemId);
    normalized.push({ outbound_item_id: outboundItemId, material_id: materialId, quantity });
  }
  // Deterministic lock/update order prevents two concurrent supplements from
  // taking material/stock locks in different sequences.
  return normalized.sort((left, right) => left.outbound_item_id - right.outbound_item_id);
};

const supplementOutbound = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { id } = req.params;
    await connection.beginTransaction();

    const { remark } = req.body || {};
    const items = normalizeSupplementItems(req.body?.items);

    // 1. 检查原出库单状态
    const [outboundCheck] = await connection.execute(
      'SELECT id, outbound_no, outbound_date, sales_order_id, customer_id, customer_name, total_amount, status, outbound_type, remark, operator, created_at, updated_at, reference_id, reference_type, source_task_ids, is_batch_outbound, production_task_id, issue_reason, is_excess, created_by, deleted_at FROM inventory_outbound WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (outboundCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '出库单不存在', 'NOT_FOUND', 404);
    }

    const originalOutbound = outboundCheck[0];

    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'inventory_outbound', id, '无权补发该出库单'))) {
      await connection.rollback();
      return;
    }
    if (!(await assertOutboundSourceAccess(connection, req, originalOutbound))) {
      await connection.rollback();
      return ResponseHandler.forbidden(res, '无权访问该出库单关联的来源单据');
    }

    if (originalOutbound.status !== 'partial_completed') {
      await connection.rollback();
      return ResponseHandler.error(res, '只能对部分完成的出库单进行补发', 'VALIDATION_ERROR', 400);
    }

    // 2. 验证补发物料和数量
    if (!items) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `请提供1-${MAX_SUPPLEMENT_ITEMS}条合法且不重复的补发明细`,
        'VALIDATION_ERROR',
        400
      );
    }

    // 3. 获取原出库单明细(包含物料名称)
    const [originalItems] = await connection.execute(
      `SELECT ioi.*, m.code as material_code, m.name as material_name
       FROM inventory_outbound_items ioi
       LEFT JOIN materials m ON ioi.material_id = m.id
       WHERE ioi.outbound_id = ?
       FOR UPDATE`,
      [id]
    );

    // 3.5 批量获取并验证物料库位信息
    const materialIds = items.map(item => item.material_id);
    let materialInfoMap;
    try {
      materialInfoMap = await InventoryService.getBatchMaterialInfo(materialIds, connection);
    } catch (err) {
      await connection.rollback();
      return ResponseHandler.error(res, err.message, 'VALIDATION_ERROR', 400);
    }

    // 4. 验证每个补发物料
    for (const item of items) {
      const originalItem = originalItems.find(
        (oi) => Number(oi.id) === item.outbound_item_id
      );

      if (!originalItem || Number(originalItem.material_id) !== item.material_id) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `补发明细 ${item.outbound_item_id} 与原出库单物料不匹配`,
          'VALIDATION_ERROR',
          400
        );
      }

      // 检查补发数量不能超过缺料数量
      const shortageQty = parseFloat(originalItem.shortage_quantity || 0);
      const supplementQty = item.quantity;

      if (supplementQty > shortageQty) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `物料 ${originalItem.material_code} - ${originalItem.material_name} 补发数量(${supplementQty})不能超过缺料数量(${shortageQty})`,
          'VALIDATION_ERROR',
          400
        );
      }

      // 获取物料的默认库位
      const matInfo = materialInfoMap.get(item.material_id);
      if (!matInfo?.locationId) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `物料 ${item.material_id} 未配置可用的默认库位`,
          'VALIDATION_ERROR',
          400
        );
      }
      const locationId = matInfo.locationId;
      const materialName = `${matInfo.code || ''} - ${matInfo.name || ''}`;

      logger.info(
        `[补发验证] 物料: ${materialName}, 物料ID: ${item.material_id}, 库位ID: ${locationId}, 补发数量: ${supplementQty}`
      );

      // 检查库存是否充足
      const currentStock = await InventoryService.getCurrentStock(
        item.material_id,
        locationId,
        connection,
        true
      );

      logger.info(
        `[补发验证] 物料: ${materialName}, 当前库存: ${currentStock}, 需要: ${supplementQty}`
      );

      if (currentStock < supplementQty) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `物料 ${materialName} 库存不足，当前库存: ${currentStock}，需要: ${supplementQty}`,
          'VALIDATION_ERROR',
          400
        );
      }
    }

    // 5. 更新原出库单明细的actual_quantity和shortage_quantity,并扣减库存
    for (const item of items) {
      const supplementQty = item.quantity;

      const [itemUpdate] = await connection.execute(
        `UPDATE inventory_outbound_items
         SET actual_quantity = actual_quantity + ?,
             shortage_quantity = shortage_quantity - ?
         WHERE id = ? AND outbound_id = ? AND material_id = ? AND shortage_quantity >= ?`,
        [
          supplementQty,
          supplementQty,
          item.outbound_item_id,
          id,
          item.material_id,
          supplementQty,
        ]
      );
      if (itemUpdate.affectedRows !== 1) {
        const conflict = new Error('补发明细已被并发处理，请刷新后重试');
        conflict.statusCode = 409;
        conflict.code = 'OUTBOUND_SUPPLEMENT_CONFLICT';
        throw conflict;
      }

      // 获取物料的默认库位 (直接通过已缓存的信息获取)
      const matInfo = materialInfoMap.get(item.material_id);
      const locationId = matInfo.locationId;
      const materialName = `${matInfo.code || ''} - ${matInfo.name || ''}`;

      // 补发时正常扣减库存
      logger.info(`物料 ${materialName} 补发扣减库存: ${supplementQty}`);

      const refNo = `${originalOutbound.outbound_no}-补发`;
      await InventoryService.updateStock(
        {
          materialId: item.material_id,
          locationId: locationId,
          quantity: -supplementQty,
          transactionType: 'outbound',
          referenceType: 'outbound_supplement',
          referenceNo: refNo,
          operator: getRequestActorLabel(req),
          remark: `补发: ${remark || ''}`,
          idempotencyKey: `outbound_supplement:${refNo}:${item.material_id}:${locationId}:${supplementQty}:${item.outbound_item_id}`,
        },
        connection
      );
    }

    // 6. 检查是否所有物料都已补齐
    const [updatedItems] = await connection.execute(
      'SELECT id, outbound_id, material_id, quantity, price, tax_rate, total_amount, planned_quantity, actual_quantity, shortage_quantity, is_shortage, source_tasks, unit_id, remark, created_at, updated_at FROM inventory_outbound_items WHERE outbound_id = ? FOR UPDATE',
      [id]
    );

    const allFulfilled = updatedItems.every(
      (item) => parseFloat(item.shortage_quantity || 0) === 0
    );

    // 7. 更新出库单状态
    if (allFulfilled) {
      // 所有物料都已补齐，更新为已完成
      await connection.execute(
        'UPDATE inventory_outbound SET status = ?, remark = CONCAT(COALESCE(remark, ""), " [补发完成]") WHERE id = ? AND deleted_at IS NULL',
        ['completed', id]
      );

      // 更新生产任务状态为已发料（走生命周期状态机）
      if (originalOutbound.reference_type === 'production_task' && originalOutbound.reference_id) {
        const { promoteTaskStatus } = require('../../../../services/business/TaskLifecycleService');
        await promoteTaskStatus(connection, originalOutbound.reference_id, 'material_issued', {
          onlyFrom: [
            'pending',
            'allocated',
            'preparing',
            'material_issuing',
            'material_partial_issued',
          ],
        });
        logger.info(
          `生产任务 ${originalOutbound.reference_id} 状态已更新为 material_issued (补发完成)`
        );
      }

      logger.info(`出库单 ${id} 补发完成，状态更新为 completed`);
    } else {
      // 仍有缺料，保持部分完成状态
      await connection.execute(
        'UPDATE inventory_outbound SET remark = CONCAT(COALESCE(remark, ""), " [已补发]") WHERE id = ? AND deleted_at IS NULL',
        [id]
      );
      logger.info(`出库单 ${id} 补发成功，仍有缺料，保持 partial_completed 状态`);
    }

    // ========== 补发后创建生产过程记录（无论是否补齐）==========
    // 使用 ProductionProcessService 统一处理生产过程创建逻辑
    if (originalOutbound.reference_type === 'production_task' && originalOutbound.reference_id) {
      try {
        // 获取任务的当前状态
        const [taskStatus] = await connection.execute(
          'SELECT status FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
          [originalOutbound.reference_id]
        );

        if (taskStatus.length > 0) {
          const currentStatus = taskStatus[0].status;

          // 使用服务创建生产过程记录
          const ProductionProcessService = require('../../../../services/business/ProductionProcessService');
          const processRemarks = allFulfilled ? '补发完成后自动创建' : '补发后自动创建（部分发料）';

          await ProductionProcessService.createProductionProcessIfNeeded(
            connection,
            originalOutbound.reference_id,
            currentStatus,
            processRemarks
          );
        }
      } catch (processError) {
        logger.error('补发后创建生产过程记录失败:', processError);
        throw processError;
      }
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        status: allFulfilled ? 'completed' : 'partial_completed',
      },
      allFulfilled ? '补发成功，出库单已完成' : '补发成功，仍有缺料'
    );
  } catch (error) {
    await connection.rollback();
    logger.error('补发出库单失败:', error);
    const statusCode = Number(error.statusCode) === 409 ? 409 : Number(error.statusCode) === 400 ? 400 : 500;
    ResponseHandler.error(
      res,
      statusCode === 500 ? '补发出库单失败' : error.message,
      error.code || (statusCode === 500 ? 'SERVER_ERROR' : 'VALIDATION_ERROR'),
      statusCode,
      error
    );
  } finally {
    connection.release();
  }
};

// 获取入库单列表 - 优化版本

const batchOutbound = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { task_ids, outbound_date, remark, operator, preview } = mapKeysToSnake(req.body || {});

    // 验证参数
    if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
      return ResponseHandler.error(res, '请选择至少一个生产任务', 'VALIDATION_ERROR', 400);
    }

    if (task_ids.length > MAX_BATCH_TASKS) {
      return ResponseHandler.error(res, `批量发料任务数不能超过${MAX_BATCH_TASKS}条`, 'VALIDATION_ERROR', 400);
    }

    const normalizedTaskIds = [...new Set(task_ids.map((id) => Number(id)))];
    if (
      normalizedTaskIds.length > MAX_BATCH_TASKS ||
      normalizedTaskIds.length !== task_ids.length ||
      normalizedTaskIds.some((id) => !Number.isInteger(id) || id <= 0)
    ) {
      return ResponseHandler.error(
        res,
        `生产任务ID无效或超过批量上限(${MAX_BATCH_TASKS})`,
        'VALIDATION_ERROR',
        400
      );
    }

    await connection.beginTransaction();
    if (!(await assertOutboundSourceAccess(connection, req, {
      reference_type: 'batch_production_tasks',
      source_task_ids: normalizedTaskIds,
    }))) {
      await connection.rollback();
      return ResponseHandler.forbidden(res, '批量发料包含无权访问的生产任务或生产计划');
    }

    // ===== 年度结存校验 =====
    const dateToCheck = outbound_date || new Date().toISOString().split('T')[0];
    const PeriodValidationService = require('../../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(dateToCheck);
    if (!inventoryCheck.allowed) {
      await connection.rollback();
      return ResponseHandler.error(res, inventoryCheck.message, 'VALIDATION_ERROR', 400);
    }
    // ===== 年度结存校验结束 =====

    // 1. 获取所有生产任务的信息
    const placeholders = normalizedTaskIds.map(() => '?').join(',');
    const [tasks] = await connection.execute(
      `SELECT
        pt.id, pt.code, pt.plan_id, pt.product_id, pt.quantity,
        pp.quantity AS plan_quantity, pp.bom_id,
        p.code as product_code, p.name as product_name
      FROM production_tasks pt
      LEFT JOIN production_plans pp ON pp.id = pt.plan_id
      LEFT JOIN materials p ON pt.product_id = p.id
      WHERE pt.id IN (${placeholders})
        AND pt.deleted_at IS NULL
        AND pt.status IN ('pending', 'allocated', 'preparing')
      FOR UPDATE`,
      normalizedTaskIds
    );

    if (tasks.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '未找到可发料的生产任务', 'NOT_FOUND', 404);
    }

    if (tasks.length !== normalizedTaskIds.length) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '部分生产任务不存在或状态不允许发料',
        'VALIDATION_ERROR',
        400
      );
    }

    // 2. 获取每个任务的统一净需求物料
    const materialMap = new Map(); // 用于合并相同物料

    for (const task of tasks) {
      const rows = await getTaskNetRequirementRows(connection, task);
      mergeRequirementRows(materialMap, rows, 1, {
        task_id: task.id,
        task_code: task.code,
        product_code: task.product_code,
        product_name: task.product_name,
      });
    }

    const mergedMaterials = Array.from(materialMap.values());

    if (mergedMaterials.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '没有找到需要发料的物料', 'VALIDATION_ERROR', 400);
    }

    const mergedMaterialIds = mergedMaterials.map((material) => material.material_id);
    const mergedMaterialPlaceholders = mergedMaterialIds.map(() => '?').join(',');
    const [materialRows] = await connection.execute(
      `SELECT
         m.id,
         m.code,
         m.name,
         m.specs,
         m.unit_id,
         u.name AS unit_name,
         m.location_id,
         l.name AS location_name
       FROM materials m
       LEFT JOIN units u ON u.id = m.unit_id
       LEFT JOIN locations l ON l.id = m.location_id
       WHERE m.id IN (${mergedMaterialPlaceholders})`,
      mergedMaterialIds
    );
    const materialInfoMap = new Map(materialRows.map((row) => [row.id, row]));
    for (const material of mergedMaterials) {
      const info = materialInfoMap.get(material.material_id);
      if (!info) continue;
      material.material_code = info.code;
      material.material_name = info.name;
      material.specification = info.specs;
      material.unit_id = material.unit_id || info.unit_id;
      material.unit_name = info.unit_name;
      material.location_id = info.location_id || null;
      material.location_name = info.location_name || null;
    }

    // 如果是预览模式，只返回合并后的物料清单
    if (preview) {
      await connection.commit();
      return ResponseHandler.success(
        res,
        {
          task_count: tasks.length,
          material_count: mergedMaterials.length,
          materials: mergedMaterials,
        },
        '物料清单加载成功'
      );
    }

    // 3. 生成出库单号
    const outboundNo = await CodeGenerators.generateInventoryOutboundCode(connection);

    // 4. 格式化出库日期
    let formattedOutboundDate;
    if (outbound_date) {
      // 如果是ISO格式的日期字符串，提取日期部分
      if (typeof outbound_date === 'string' && outbound_date.includes('T')) {
        formattedOutboundDate = outbound_date.split('T')[0];
      } else {
        formattedOutboundDate = outbound_date;
      }
    } else {
      formattedOutboundDate = new Date().toISOString().split('T')[0];
    }

    // 5. 创建出库单
    const createdBy = req.user?.id || req.user?.userId || null;
    const [outboundResult] = await connection.execute(
      `INSERT INTO inventory_outbound
        (outbound_no, outbound_date, status, outbound_type, remark, operator, reference_type, source_task_ids, is_batch_outbound, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        outboundNo,
        formattedOutboundDate,
        'draft',
        'batch_issue',
        remark || '批量发料',
        operator || getRequestActorLabel(req),
        'batch_production_tasks',
        JSON.stringify(normalizedTaskIds),
        1,
        createdBy,
      ]
    );

    const outboundId = outboundResult.insertId;

    // 批量预取物料信息（消除循环内 N+1 查询）
    const batchMaterialIds = mergedMaterials.map(m => m.material_id);
    const batchMaterialInfoMap = await getMaterialInfoMap(connection, batchMaterialIds);

    // 6. 插入出库单明细
    for (const material of mergedMaterials) {
      // 从批量预取结果获取物料的单位ID
      const batchMatInfo = batchMaterialInfoMap.get(material.material_id);
      const unit_id = batchMatInfo ? batchMatInfo.unitId : null;
      const { plannedQuantity, actualQuantity, shortageQuantity, isShortage } =
        normalizeIssueQuantities(material);

      await connection.execute(
        `INSERT INTO inventory_outbound_items
          (outbound_id, material_id, quantity, planned_quantity, actual_quantity,
           shortage_quantity, is_shortage, unit_id, source_tasks, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          outboundId,
          material.material_id,
          plannedQuantity,
          plannedQuantity,
          actualQuantity,
          shortageQuantity,
          isShortage,
          unit_id,
          JSON.stringify(material.source_tasks),
        ]
      );
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        outbound_id: outboundId,
        outbound_no: outboundNo,
        task_count: tasks.length,
        material_count: mergedMaterials.length,
        materials: mergedMaterials,
      },
      '批量发料单创建成功'
    );
  } catch (error) {
    await connection.rollback();
    logger.error('批量发料失败:', error);
    ResponseHandler.error(res, '批量发料失败: ' + error.message, 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取生产任务的领料记录（用于退料时选择）
 * @param {object} req - 请求对象
 * @param {object} res - 响应对象
 */

module.exports = {
  fetchBomItemsForOutbound,
  fetchBatchBomItemsForOutbound,
  parseSourceTaskIds,
  supplementOutbound,
  batchOutbound,
};
