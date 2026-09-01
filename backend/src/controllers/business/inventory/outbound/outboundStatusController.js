/**
 * outboundStatusController.js - 出库单状态管理
 * 从 inventoryOutboundController.js 拆分
 */

const { ResponseHandler } = require('../../../../utils/responseHandler');
const { logger } = require('../../../../utils/logger');
const { CodeGenerators } = require('../../../../utils/codeGenerator');
const db = require('../../../../config/db');
const { softDeleteBatch } = require('../../../../utils/softDelete');
const InventoryService = require('../../../../services/InventoryService');
const AsyncTaskService = require('../../../../services/business/AsyncTaskService');
const businessConfig = require('../../../../config/businessConfig');
const { getCurrentUserName } = require('../../../../utils/userHelper');
const { INVENTORY_OUTBOUND_TRANSITIONS } = require('../../../../constants/statusRegistry');
const { currentDateString } = require('../../../../utils/dateUtils');
const { checkAndUpdateTaskStatus, _syncProductionStatus } = require('../inventoryConsistencyController');

const {
  getMaterialInfoMap,
  issueOutboundItemFromDetail,
  isProductionOutboundReference,
  STATUS,
  assertOutboundSourceAccess,
} = require('./outboundHelpers');

const {
  fetchBomItemsForOutbound,
  fetchBatchBomItemsForOutbound,
  parseSourceTaskIds,
} = require('./outboundBomController');
const ScopeGuard = require('../../../../authorization/ScopeGuard');
const { getRequestActorLabel, resolveActorLabel } = require('../../../../utils/userUtils');
const { PermissionUtils } = require('../../../../utils/authUtils');
const PermissionService = require('../../../../services/PermissionService');

const MAX_BATCH_OUTBOUND_IDS = 500;

const OUTBOUND_CANCEL_PERMISSION = 'inventory:outbound:cancel';

function isCancelStatus(status) {
  return status === STATUS.OUTBOUND.CANCELLED || status === 'cancelled';
}

/**
 * 取消出库单需要专门的 inventory:outbound:cancel 权限。
 *
 * 权限一律取 requirePermission 挂上的 req.userPermissions（内含超管 '*' 通配符）。
 * 不要读 req.user.permissions / req.user.roles：access token 载荷只有
 * id/username/tokenVersion（见 config/jwtEnhanced.js），那两个字段永远是 undefined，
 * 曾导致本检查对所有人恒为拒绝。
 */
async function hasOutboundCancelPermission(req) {
  const permissions = Array.isArray(req.userPermissions)
    ? req.userPermissions
    : await PermissionService.getUserPermissions(req.user?.id);
  return PermissionUtils.hasPermission(permissions, OUTBOUND_CANCEL_PERMISSION);
}

const updateOutboundStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { id } = req.params;
    // 兼容 newStatus / status（前端与历史脚本混用）
    const newStatus = req.body?.newStatus ?? req.body?.status ?? req.body?.new_status;

    if (!newStatus) {
      return ResponseHandler.error(res, '缺少目标状态 newStatus', 'VALIDATION_ERROR', 400);
    }

    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'inventory_outbound', id, '无权变更该出库单状态'))) {
      return;
    }

    await connection.beginTransaction();

    // 检查出库单是否存在
    const [checkResult] = await connection.execute(
      `SELECT status, reference_id, reference_type, production_task_id, source_task_ids,
              issue_reason, is_excess
       FROM inventory_outbound
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '出库单不存在', 'NOT_FOUND', 404);
    }

    if (!(await ScopeGuard.assertAccess(connection, req, 'inventory_outbound', id))) {
      await connection.rollback();
      return ResponseHandler.forbidden(res, '无权变更该出库单状态');
    }

    const currentStatus = checkResult[0].status;
    let referenceId = checkResult[0].reference_id;
    let referenceType = checkResult[0].reference_type;
    const productionTaskId = checkResult[0].production_task_id;
    const batchTaskIds =
      referenceType === 'batch_production_tasks'
        ? parseSourceTaskIds(checkResult[0].source_task_ids)
        : [];

    if (
      referenceType === 'batch_production_tasks' &&
      !(await ScopeGuard.denyUnlessAllAccess(
        res,
        connection,
        req,
        'production_task',
        batchTaskIds,
        '无权变更该批量出库关联的生产任务'
      ))
    ) {
      await connection.rollback();
      return;
    }

    // 如果referenceId为空但有productionTaskId，补充设置（兼容旧数据或逻辑缺口）
    if (!referenceId && productionTaskId) {
      referenceId = productionTaskId;
      referenceType = 'production_task';
    }

    const sourceAuthorized = await assertOutboundSourceAccess(connection, req, {
      ...checkResult[0],
      reference_id: referenceId,
      reference_type: referenceType,
    });
    if (!sourceAuthorized) {
      await connection.rollback();
      return ResponseHandler.forbidden(res, '无权变更该出库单关联的来源单据');
    }

    // 验证状态转换的合法性（引用统一状态注册表）
    const validTransitions = INVENTORY_OUTBOUND_TRANSITIONS;

    if (!validTransitions[currentStatus] || !validTransitions[currentStatus].includes(newStatus)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `无效的状态转换: ${currentStatus} → ${newStatus}`,
        'VALIDATION_ERROR',
        400
      );
    }

    // 取消出库单需要专门的 inventory:outbound:cancel 权限
    if (isCancelStatus(newStatus) && !(await hasOutboundCancelPermission(req))) {
      await connection.rollback();
      return ResponseHandler.forbidden(res, '无权取消出库单');
    }

    // 如果从draft转为confirmed，更新operator为当前用户
    let updateQuery = 'UPDATE inventory_outbound SET status = ?, updated_at = NOW()';
    const updateParams = [newStatus];

    if (currentStatus === STATUS.OUTBOUND.DRAFT && newStatus === STATUS.OUTBOUND.CONFIRMED) {
      // 获取当前用户
      const currentUser = getRequestActorLabel(req);
      updateQuery += ', operator = ?';
      updateParams.push(currentUser);
      logger.info(`出库单 ${id} 确认，记录操作人: ${currentUser}`);

      // 如果是生产出库单且没有明细项，确认时只允许从统一净需求生成
      if (
        referenceId &&
        (referenceType === 'production_task' || referenceType === 'production_plan')
      ) {
        const [itemCheck] = await connection.execute(
          'SELECT COUNT(*) as count FROM inventory_outbound_items WHERE outbound_id = ?',
          [id]
        );

        const itemCount = Number(itemCheck[0].count);
        if (itemCount === 0) {
          logger.info(`出库单 ${id} 确认时没有明细项，准备从统一净需求生成...`);
          const bomResult = await fetchBomItemsForOutbound(
            connection,
            id,
            referenceType,
            referenceId
          );
          if (!bomResult.success) {
            await connection.rollback();
            return ResponseHandler.error(
              res,
              `出库单确认失败，无法从统一净需求生成物料: ${bomResult.error}`,
              'VALIDATION_ERROR',
              400
            );
          }
        }
      }

      if (referenceType === 'batch_production_tasks') {
        const [itemCheck] = await connection.execute(
          'SELECT COUNT(*) as count FROM inventory_outbound_items WHERE outbound_id = ?',
          [id]
        );

        const itemCount = Number(itemCheck[0].count);
        if (itemCount === 0) {
          const bomResult = await fetchBatchBomItemsForOutbound(connection, id, batchTaskIds);
          if (!bomResult.success) {
            await connection.rollback();
            return ResponseHandler.error(
              res,
              `批量出库单确认失败，无法从统一净需求生成明细: ${bomResult.error}`,
              'VALIDATION_ERROR',
              400
            );
          }
        }
      }
    }

    updateQuery += ' WHERE id = ? AND deleted_at IS NULL';
    updateParams.push(id);

    // 更新出库单状态
    const [_updateResult] = await connection.execute(updateQuery, updateParams);

    logger.debug(
      `出库单 ${id} 状态更新: ${currentStatus} → ${newStatus}, 关联类型: ${referenceType}, 关联ID: ${referenceId}`
    );

    // 获取出库单的补料/超额标记
    const issueReason = checkResult[0].issue_reason;
    const isExcess = checkResult[0].is_excess;
    const isSupplementRequest = isExcess || issueReason;

    // 如果出库单关联了生产任务，更新生产任务状态
    // 🔥 重要：补料申请（超额领料）不应该更新任务状态，因为任务可能已经在"生产中"状态
    if (isSupplementRequest) {
      logger.debug(
        `[补料申请] 出库单 ${id} 是补料申请/超额领料（原因: ${issueReason || '无'}, 超额: ${isExcess ? '是' : '否'}），跳过任务状态更新`
      );
    }

    if (referenceId && referenceType === 'production_task' && !isSupplementRequest) {
      // 统一联动更新生产任务/计划状态（confirmed 或 completed）
      await _syncProductionStatus(connection, newStatus, referenceId);
    }


    // 如果出库单关联了生产计划（直接关联，非通过任务），也更新计划和任务状态
    if (
      referenceId &&
      referenceType === 'production_plan' &&
      newStatus === STATUS.OUTBOUND.COMPLETED
    ) {
      try {
        const [planCheck] = await connection.execute(
          'SELECT status FROM production_plans WHERE id = ? AND deleted_at IS NULL',
          [referenceId]
        );

        if (planCheck.length > 0 && planCheck[0].status === 'preparing') {
          await connection.execute(
            'UPDATE production_plans SET status = "material_issued" WHERE id = ? AND deleted_at IS NULL',
            [referenceId]
          );
          logger.debug(`生产计划 ${referenceId} 物料发放完成，状态已更新为 material_issued`);
        }

        // 同时更新该计划下所有未完成的生产任务状态为"已发料"
        const [tasks] = await connection.execute(
          "SELECT id, status FROM production_tasks WHERE plan_id = ? AND status IN ('pending', 'preparing')",
          [referenceId]
        );

        if (tasks.length > 0) {
          const { apiStatusToDbStatus } = require('../../../utils/statusMapper');
          const dbStatus = apiStatusToDbStatus(
            STATUS.PRODUCTION_TASK.MATERIAL_ISSUED,
            'productionTask'
          );

          for (const task of tasks) {
            await connection.execute('UPDATE production_tasks SET status = ? WHERE id = ? AND deleted_at IS NULL', [
              dbStatus,
              task.id,
            ]);
            logger.debug(`生产任务 ${task.id} 状态已更新为 ${dbStatus}（出库单完成）`);
          }
        }
      } catch (planError) {
        logger.error('更新生产计划/任务状态时出错:', planError);
        throw planError;
      }
    }

    // 如果状态变更为已完成，更新库存
    if (newStatus === STATUS.OUTBOUND.COMPLETED) {
      // 检查是否有出库明细
      const [itemCheck] = await connection.execute(
        'SELECT COUNT(*) as count FROM inventory_outbound_items WHERE outbound_id = ?',
        [id]
      );

      // 注意：MySQL的COUNT(*)返回的可能是字符串或BigInt，需要转换为数字
      const itemCount = Number(itemCheck[0].count);

      if (itemCount === 0 && isProductionOutboundReference(referenceType)) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '生产出库单没有明细，不能完成。请先由统一净需求结果生成出库明细。',
          'VALIDATION_ERROR',
          400
        );
      }

      if (itemCount === 0) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '出库单没有明细，不能完成出库',
          'VALIDATION_ERROR',
          400
        );
      } else {
        // 获取出库明细项(包含planned_quantity和actual_quantity，支持部分发料)
        const [items] = await connection.execute(
          `SELECT material_id, quantity, planned_quantity, actual_quantity,
                  shortage_quantity, unit_id, source_tasks
           FROM inventory_outbound_items
           WHERE outbound_id = ?`,
          [id]
        );

        // 获取出库单信息
        const [outboundInfo] = await connection.execute(
          'SELECT outbound_no, operator FROM inventory_outbound WHERE id = ? AND deleted_at IS NULL',
          [id]
        );

        if (!outboundInfo || outboundInfo.length === 0) {
          throw new Error(`找不到出库单信息: ${id}`);
        }

        // 判断是否是生产出库（包括production_task和production_plan）
        const isBatchProductionOutbound = referenceType === 'batch_production_tasks';
        const isProductionOutbound =
          referenceType === 'production_task' ||
          referenceType === 'production_plan' ||
          isBatchProductionOutbound;

        // ========== 通过 InventoryService 统一获取物料信息和库存 ==========
        const materialIds = items.map(i => i.material_id);
        const materialMap = new Map();
        const stockMap = new Map();

        if (materialIds.length > 0) {
          // 通过服务层批量获取物料仓库和单位信息
          const materialInfoMap = await getMaterialInfoMap(connection, materialIds);
          for (const [id, info] of materialInfoMap) {
            materialMap.set(id, { id, location_id: info.locationId, unit_id: info.unitId });
          }

          // 通过服务层批量获取默认仓库的库存
          const pairs = [];
          for (const [id, info] of materialInfoMap) {
            pairs.push({ material_id: id, location_id: info.locationId });
          }
          const stockResults = await InventoryService.getBatchStock(pairs, connection);
          for (const row of stockResults) {
            const key = `${row.material_id}_${row.location_id}`;
            stockMap.set(key, row.quantity);
          }
        }

        // 非生产出库时，根据出库单的 reference_type 动态判定交易类型（提到循环外，避免每次迭代重建）
        const outboundTransactionTypeMap = {
          'purchase_return': 'purchase_return',
          'sales_order': 'sales_outbound',
          'sales': 'sales_outbound',
          'transfer': 'transfer',
        };
        const dynamicTransactionType = isProductionOutbound
          ? 'production_outbound'
          : (outboundTransactionTypeMap[referenceType] || 'outbound');

        for (const item of items) {
          try {
            // 从预加载的 Map 获取物料默认库位（不再逐条查询）
            const matInfo = materialMap.get(item.material_id);
            const locationId = matInfo?.location_id;

            // ========== 部分发料支持: 使用actual_quantity扣减库存 ==========
            // 当actual_quantity为0时,不使用quantity作为后备值
            const actualQuantity = parseFloat(item.actual_quantity ?? 0);
            const plannedQuantity = parseFloat(
              item.planned_quantity ?? item.quantity ?? actualQuantity ?? 0
            );

            // 只有actual_quantity > 0时才扣减库存
            if (actualQuantity > 0) {
              if (!locationId) {
                throw new Error(`物料 ${item.material_id} 未配置默认仓库，请在物料管理中设置`);
              }

              // 完成时按现有库存折算：能发多少发多少，差额记缺料（生产发料/超额场景）
              const stockKey = `${item.material_id}_${locationId}`;
              let currentStock = stockMap.has(stockKey)
                ? Number(stockMap.get(stockKey)) || 0
                : await InventoryService.getCurrentStock(
                    item.material_id,
                    locationId,
                    connection,
                    true
                  );
              currentStock = Number(currentStock) || 0;

              let issueQty = actualQuantity;
              let shortageQty = parseFloat(item.shortage_quantity ?? 0) || 0;

              if (currentStock < actualQuantity) {
                issueQty = Math.max(0, currentStock);
                shortageQty = Math.max(
                  shortageQty,
                  actualQuantity - issueQty,
                  plannedQuantity - issueQty
                );
                await connection.execute(
                  `UPDATE inventory_outbound_items
                   SET actual_quantity = ?,
                       shortage_quantity = ?,
                       is_shortage = 1,
                       updated_at = NOW()
                   WHERE outbound_id = ? AND material_id = ?`,
                  [issueQty, shortageQty, id, item.material_id]
                );
                item.actual_quantity = issueQty;
                item.shortage_quantity = shortageQty;
                logger.info(
                  `出库单 ${id} 物料 ${item.material_id} 库存不足，部分发料: 库存=${currentStock}, 计划/申请=${actualQuantity}, 实发=${issueQty}, 缺料=${shortageQty}`
                );
              }

              if (issueQty > 0) {
                if (isProductionOutbound) {
                  await issueOutboundItemFromDetail({
                    connection,
                    item: { ...item, actual_quantity: issueQty },
                    locationId,
                    outboundNo: outboundInfo[0].outbound_no,
                    operator: outboundInfo[0].operator,
                    referenceType,
                    unitId: item.unit_id,
                    issueReason: checkResult[0].issue_reason,
                    isExcess: checkResult[0].is_excess,
                  });
                } else {
                  const stockResult = await InventoryService.updateStock(
                    {
                      materialId: item.material_id,
                      locationId,
                      transactionType: dynamicTransactionType,
                      quantity: -issueQty,
                      unitId: item.unit_id,
                      referenceNo: outboundInfo[0].outbound_no,
                      referenceType: 'outbound',
                      operator: outboundInfo[0].operator,
                      remark: `出库单号: ${outboundInfo[0].outbound_no}`,
                      idempotencyKey: `${dynamicTransactionType}:${outboundInfo[0].outbound_no}:${item.material_id}:${locationId}:${issueQty}`,
                    },
                    connection
                  );
                  stockMap.set(stockKey, stockResult.afterQuantity);
                }
                stockMap.set(stockKey, Math.max(0, currentStock - issueQty));
              } else {
                stockMap.set(stockKey, currentStock);
              }
            }
          } catch (itemError) {
            logger.error(`处理物料 ${item.material_id} 时出错:`, itemError);
            const err = new Error(
              `物料 ${item.material_id} 出库处理失败: ${itemError.message}`,
              { cause: itemError }
            );
            err.statusCode = itemError.statusCode || 500;
            err.code = itemError.code;
            throw err;
          }
        }
      }

      // ========== 部分发料支持: 判断是否部分完成并创建缺料记录 ==========
      // 检查是否有缺料
      const [shortageCheck] = await connection.execute(
        `SELECT COUNT(*) as shortage_count
         FROM inventory_outbound_items
         WHERE outbound_id = ? AND shortage_quantity > 0`,
        [id]
      );

      const hasShortage = shortageCheck[0].shortage_count > 0;

      if (hasShortage) {
        // 有缺料,状态改为partial_completed
        await connection.execute(
          "UPDATE inventory_outbound SET status = 'partial_completed' WHERE id = ? AND deleted_at IS NULL",
          [id]
        );

        // 获取出库单号
        const [outboundInfo] = await connection.execute(
          'SELECT outbound_no FROM inventory_outbound WHERE id = ? AND deleted_at IS NULL',
          [id]
        );
        const outboundNo = outboundInfo[0].outbound_no;

        logger.info(`出库单 ${outboundNo} 存在缺料,状态设置为 partial_completed`);

        // 创建缺料记录
        const [shortageItems] = await connection.execute(
          `SELECT
            ioi.id as outbound_item_id,
            ioi.material_id,
            m.code as material_code,
            m.name as material_name,
            m.specs as material_specs,
            ioi.unit_id,
            u.name as unit_name,
            ioi.planned_quantity,
            ioi.actual_quantity,
            ioi.shortage_quantity
           FROM inventory_outbound_items ioi
           LEFT JOIN materials m ON ioi.material_id = m.id
           LEFT JOIN units u ON ioi.unit_id = u.id
           WHERE ioi.outbound_id = ? AND ioi.shortage_quantity > 0`,
          [id]
        );

        for (const item of shortageItems) {
          // 查询当前库存
          const [stockResult] = await connection.execute(
            `SELECT COALESCE(SUM(quantity), 0) as total_quantity
             FROM inventory_ledger
             WHERE material_id = ?`,
            [item.material_id]
          );

          const currentStock = parseFloat(stockResult[0].total_quantity) || 0;

          await connection.execute(
            `INSERT INTO material_shortage_records
              (outbound_id, outbound_no, outbound_item_id, material_id, material_code, material_name, material_specs,
               unit_id, unit_name, planned_quantity, actual_quantity, shortage_quantity, supplied_quantity,
               remaining_quantity, current_stock, status, reference_type, reference_id, reference_no)
             VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending', ?, ?, ?)`,
            [
              id,
              outboundNo,
              item.outbound_item_id,
              item.material_id,
              item.material_code,
              item.material_name,
              item.material_specs,
              item.unit_id,
              item.unit_name,
              item.planned_quantity,
              item.actual_quantity,
              item.shortage_quantity,
              item.shortage_quantity,
              currentStock,
              referenceType,
              referenceId,
              referenceId,
            ]
          );
        }

        logger.info(`已为出库单 ${outboundNo} 创建 ${shortageItems.length} 条缺料记录`);

        // 缺料自动请购（草稿）：可配置关闭 purchase.autoCreatePROnIssueShortage
        try {
          const {
            createRequisitionFromOutboundShortage,
          } = require('../../../../services/business/ShortageRequisitionService');
          const prResult = await createRequisitionFromOutboundShortage(connection, {
            outboundId: id,
            outboundNo,
            referenceType,
            referenceId,
            operator: outboundInfo[0]?.operator || getRequestActorLabel(req) || 'system',
            operatorUserId: req.user?.userId || req.user?.id || null,
            shortageItems,
          });
          if (prResult?.created) {
            logger.info(
              `出库 ${outboundNo} 缺料自动请购: ${prResult.requisitionNo} (${prResult.itemCount} 项) status=${prResult.status} submitted=${prResult.submitted}`
            );
          } else {
            logger.info(
              `出库 ${outboundNo} 未自动请购: ${prResult?.reason || 'unknown'}`
            );
          }
        } catch (prErr) {
          // 请购失败不阻断出库结案（缺料记录已落库）
          logger.error(`出库 ${outboundNo} 缺料自动请购失败（已忽略）:`, prErr);
        }

        // 如果关联了生产任务,更新任务状态为material_partial_issued
        if (referenceId && referenceType === 'production_task') {
          const { promoteTaskStatus } = require('../../../../services/business/TaskLifecycleService');
          await promoteTaskStatus(connection, referenceId, 'material_partial_issued', {
            onlyFrom: [
              'pending',
              'allocated',
              'preparing',
              'material_issuing',
              'material_partial_issued',
            ],
          });
          logger.info(`产任务 ${referenceId} 状态已更新为 material_partial_issued`);
        }
      }

      if (referenceType === 'batch_production_tasks' && batchTaskIds.length > 0) {
        const finalTaskStatus = hasShortage
          ? STATUS.PRODUCTION_TASK.MATERIAL_PARTIAL_ISSUED
          : STATUS.PRODUCTION_TASK.MATERIAL_ISSUED;
        const { promoteTaskStatus } = require('../../../../services/business/TaskLifecycleService');
        for (const tid of batchTaskIds) {
          await promoteTaskStatus(connection, tid, finalTaskStatus, {
            onlyFrom: [
              'pending',
              'allocated',
              'preparing',
              'material_issuing',
              'material_partial_issued',
            ],
          });
        }
        const placeholders = batchTaskIds.map(() => '?').join(',');

        if (!hasShortage) {
          await connection.execute(
            `UPDATE production_plans pp
             JOIN production_tasks pt ON pt.plan_id = pp.id AND pt.deleted_at IS NULL
             SET pp.status = ?, pp.updated_at = NOW()
             WHERE pt.id IN (${placeholders})
                AND pp.deleted_at IS NULL
                AND pp.status = ?`,
            [
              STATUS.PRODUCTION_PLAN.MATERIAL_ISSUED,
              ...batchTaskIds,
              STATUS.PRODUCTION_PLAN.PREPARING,
            ]
          );
        }
      }

      // ========== 重要：在检查缺料并确定最终状态后，才创建生产过程记录 ==========
      // 使用 ProductionProcessService 统一处理生产过程创建逻辑
      if (referenceId && referenceType === 'production_task') {
        try {
          // 获取任务的最终状态
          const [finalTaskStatus] = await connection.execute(
            'SELECT status FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
            [referenceId]
          );

          const actualTaskStatus = finalTaskStatus[0]?.status;

          // 使用服务创建生产过程记录
          const ProductionProcessService = require('../../../../services/business/ProductionProcessService');
          const processRemarks =
            actualTaskStatus === STATUS.PRODUCTION_TASK.MATERIAL_PARTIAL_ISSUED
              ? '出库单部分完成后自动创建（部分发料）'
              : '出库单完成后自动创建';

          await ProductionProcessService.createProductionProcessIfNeeded(
            connection,
            referenceId,
            actualTaskStatus,
            processRemarks
          );
        } catch (processError) {
          logger.error('创建生产过程记录失败:', processError);
          throw processError;
        }
      }

      if (referenceType === 'batch_production_tasks' && batchTaskIds.length > 0) {
        try {
          const placeholders = batchTaskIds.map(() => '?').join(',');
          const [taskStatuses] = await connection.execute(
            `SELECT id, status
             FROM production_tasks
             WHERE id IN (${placeholders})`,
            batchTaskIds
          );
          const ProductionProcessService = require('../../../../services/business/ProductionProcessService');

          for (const task of taskStatuses) {
            const processRemarks =
              task.status === STATUS.PRODUCTION_TASK.MATERIAL_PARTIAL_ISSUED
                ? '批量出库单部分完成后自动创建（部分发料）'
                : '批量出库单完成后自动创建';
            await ProductionProcessService.createProductionProcessIfNeeded(
              connection,
              task.id,
              task.status,
              processRemarks
            );
          }
        } catch (processError) {
          logger.error('批量发料创建生产过程记录失败:', processError);
          throw processError;
        }
      }

      // 检查并更新生产任务状态 (全额发料判断)
      const taskIdToCheck =
        productionTaskId || (referenceType === 'production_task' ? referenceId : null);
      if (taskIdToCheck) {
        await checkAndUpdateTaskStatus(connection, taskIdToCheck);
      }

      // ========== 生成领料凭证（已移除） ==========
      // 本系统采用标准的生产完工归集法处理总账
      // 原先在此处单独生成物料凭证会导致当期出库多次记账，已迁移至 CostAccountingService.calculateActualCost 中在完工时一并处理。

      // ========== 计算并更新出库单总金额 ==========
      try {
        const [totalCalc] = await connection.execute(
          `SELECT COALESCE(SUM(oi.actual_quantity * COALESCE(m.cost_price, 0)), 0) as total
           FROM inventory_outbound_items oi
           JOIN materials m ON oi.material_id = m.id
           WHERE oi.outbound_id = ?`,
          [id]
        );
        const totalAmount = parseFloat(totalCalc[0]?.total) || 0;
        if (totalAmount > 0) {
          await connection.execute(
            'UPDATE inventory_outbound SET total_amount = ? WHERE id = ? AND deleted_at IS NULL',
            [totalAmount, id]
          );
          logger.info(`出库单 ${id} 总金额已更新为 ${totalAmount}`);
        }
      } catch (amountError) {
        logger.warn(`计算出库单总金额失败: ${amountError.message}`);
      }

      // 标准业务链：生产任务/业务引用 → 库存出库（类型 SSOT）
      try {
        const DocumentChainService = require('../../../../services/business/DocumentChainService');
        const [linkRows] = await connection.execute(
          `SELECT id, outbound_no, reference_type, reference_id, production_task_id
           FROM inventory_outbound WHERE id = ? AND deleted_at IS NULL`,
          [id]
        );
        if (linkRows[0]) {
          // 表结构无 reference_no，兼容 DocumentChain 期望字段
          const linkRow = {
            ...linkRows[0],
            reference_no: linkRows[0].outbound_no || null,
          };
          await DocumentChainService.afterInventoryOutboundCompleted(
            linkRow,
            req.user?.userId || req.user?.id || null,
            connection
          );
        }
      } catch (linkError) {
        logger.error('出库完成写单据链路失败:', linkError);
        throw linkError;
      }
    }


    // ========== 提交事务 ==========
    await connection.commit();

    // ========== 性能优化: 异步处理非关键业务逻辑 ==========
    // 在事务提交后,异步处理成本核算和追溯记录,提升响应速度
    if (newStatus === STATUS.OUTBOUND.COMPLETED) {
      try {
        // 获取出库单信息用于异步任务
        const [outboundData] = await connection.execute(
          'SELECT id, outbound_no, outbound_date, sales_order_id, customer_id, customer_name, total_amount, status, outbound_type, remark, operator, created_at, updated_at, reference_id, reference_type, source_task_ids, is_batch_outbound, production_task_id, issue_reason, is_excess, deleted_at FROM inventory_outbound WHERE id = ? AND deleted_at IS NULL',
          [id]
        );

        if (outboundData.length > 0 && outboundData[0].status === STATUS.OUTBOUND.COMPLETED) {
          const outbound = outboundData[0];

          // 异步创建追溯记录
          if (businessConfig.performance.asyncTraceability) {
            AsyncTaskService.createTraceabilityAsync('production_outbound', {
              outbound_id: id,
              outbound_no: outbound.outbound_no,
              reference_type: outbound.reference_type,
              reference_id: outbound.reference_id,
            });
            logger.debug(`[性能优化] 已提交异步追溯记录任务: ${outbound.outbound_no}`);
          }
        }
      } catch (asyncError) {
        const DLQService = require('../../../../services/business/DLQService');
        await DLQService.recordSideEffectFailure(
          'InventoryOutbound:asyncSideEffects',
          { outboundId: id, status: newStatus },
          asyncError
        );
      }
    }

    ResponseHandler.success(res, null, '出库单状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新出库单状态失败:', error);
    const rawMsg = String(error.message || error.cause?.message || '');
    const isBizError =
      Number(error.statusCode || error.cause?.statusCode) === 400 ||
      /库存不足|insufficient|不能完成|无效的状态|未配置默认仓库|VALIDATION/i.test(rawMsg);
    const statusCode = isBizError ? 400 : Number(error.statusCode) || 500;
    const errorCode =
      error.code || error.cause?.code || (isBizError ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
    ResponseHandler.error(
      res,
      isBizError ? rawMsg || '更新出库单状态失败' : '更新出库单状态失败',
      errorCode,
      statusCode,
      error
    );
  } finally {
    connection.release();
  }
};

// 补发出库单 - 对部分完成的出库单继续发货

const batchUpdateOutboundStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { ids, newStatus } = req.body || {};

    // 验证参数
    const normalizedIds = Array.isArray(ids)
      ? [...new Set(ids.map((id) => Number(id)))]
      : [];
    if (
      normalizedIds.length === 0 ||
      (Array.isArray(ids) && ids.length > MAX_BATCH_OUTBOUND_IDS) ||
      normalizedIds.length !== (Array.isArray(ids) ? ids.length : 0) ||
      normalizedIds.some((id) => !Number.isInteger(id) || id <= 0)
    ) {
      return ResponseHandler.error(res, '请选择至少一个出库单', 'VALIDATION_ERROR', 400);
    }

    if (!newStatus) {
      return ResponseHandler.error(res, '缺少必填字段: newStatus', 'VALIDATION_ERROR', 400);
    }

    // 验证状态值
    const validStatuses = [
      STATUS.OUTBOUND.DRAFT,
      STATUS.OUTBOUND.CONFIRMED,
      STATUS.OUTBOUND.CANCELLED,
    ];
    if (!validStatuses.includes(newStatus)) {
      return ResponseHandler.error(res, `无效的状态值: ${newStatus}`, 'VALIDATION_ERROR', 400);
    }

    // 与单据状态口保持一致：批量取消同样需要 inventory:outbound:cancel。
    // 路由只要求 inventory:outbound:update，若此处不校验，批量口就是单据口的绕过路径。
    if (isCancelStatus(newStatus) && !(await hasOutboundCancelPermission(req))) {
      return ResponseHandler.forbidden(res, '无权取消出库单');
    }

    await connection.beginTransaction();

    // 检查所有出库单是否存在
    if (
      !(await ScopeGuard.denyUnlessAllAccess(
        res,
        connection,
        req,
        'inventory_outbound',
        normalizedIds,
        '批量状态变更包含无权访问的出库单'
      ))
    ) {
      await connection.rollback();
      return;
    }

    const placeholders = normalizedIds.map(() => '?').join(',');
    const [outbounds] = await connection.execute(
      `SELECT id, outbound_no, status, reference_id, reference_type, production_task_id, source_task_ids
         FROM inventory_outbound
        WHERE id IN (${placeholders}) AND deleted_at IS NULL
        FOR UPDATE`,
      normalizedIds
    );

    if (outbounds.length !== normalizedIds.length) {
      await connection.rollback();
      return ResponseHandler.error(res, '部分出库单不存在', 'NOT_FOUND', 404);
    }

    if (!(await ScopeGuard.assertAllAccess(connection, req, 'inventory_outbound', normalizedIds))) {
      await connection.rollback();
      return ResponseHandler.forbidden(res, '批量状态变更包含无权访问的出库单');
    }
    for (const outbound of outbounds) {
      if (!(await assertOutboundSourceAccess(connection, req, outbound))) {
        await connection.rollback();
        return ResponseHandler.forbidden(res, '批量状态变更包含无权访问的来源单据');
      }
    }

    const invalidTransitions = outbounds.filter(
      (outbound) =>
        !INVENTORY_OUTBOUND_TRANSITIONS[outbound.status]?.includes(newStatus)
    );
    if (invalidTransitions.length > 0) {
      await connection.rollback();
      const invalidNos = invalidTransitions
        .map((outbound) => `${outbound.outbound_no}(${outbound.status})`)
        .join(', ');
      return ResponseHandler.error(
        res,
        `以下出库单不允许批量变更为 ${newStatus}: ${invalidNos}`,
        'VALIDATION_ERROR',
        400
      );
    }

    // 批量更新状态
    const [result] = await connection.execute(
      `UPDATE inventory_outbound SET status = ?, updated_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      [newStatus, ...normalizedIds]
    );

    await connection.commit();

    logger.info(`批量更新出库单状态成功: ${normalizedIds.length}个出库单更新为${newStatus}`);

    return ResponseHandler.success(
      res,
      { updated: result.affectedRows },
      `成功更新 ${result.affectedRows} 个出库单状态`
    );
  } catch (error) {
    await connection.rollback();
    logger.error('批量更新出库单状态失败:', error);
    return ResponseHandler.error(res, '批量更新出库单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 批量删除出库单
 */

const batchDeleteOutbound = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { ids } = req.body || {};

    // 验证参数
    const normalizedIds = Array.isArray(ids)
      ? [...new Set(ids.map((id) => Number(id)))]
      : [];
    if (
      normalizedIds.length === 0 ||
      (Array.isArray(ids) && ids.length > MAX_BATCH_OUTBOUND_IDS) ||
      normalizedIds.length !== (Array.isArray(ids) ? ids.length : 0) ||
      normalizedIds.some((id) => !Number.isInteger(id) || id <= 0)
    ) {
      return ResponseHandler.error(res, '请选择至少一个出库单', 'VALIDATION_ERROR', 400);
    }

    await connection.beginTransaction();

    if (
      !(await ScopeGuard.denyUnlessAllAccess(
        res,
        connection,
        req,
        'inventory_outbound',
        normalizedIds,
        '批量删除包含无权访问的出库单'
      ))
    ) {
      await connection.rollback();
      return;
    }

    // 检查所有出库单是否存在并获取状态
    const placeholders = normalizedIds.map(() => '?').join(',');
    const [outbounds] = await connection.execute(
      `SELECT id, outbound_no, status, reference_id, reference_type, production_task_id, source_task_ids
         FROM inventory_outbound
        WHERE id IN (${placeholders}) AND deleted_at IS NULL
        FOR UPDATE`,
      normalizedIds
    );

    if (outbounds.length !== normalizedIds.length) {
      await connection.rollback();
      return ResponseHandler.error(res, '部分出库单不存在或已删除', 'NOT_FOUND', 404);
    }

    if (!(await ScopeGuard.assertAllAccess(connection, req, 'inventory_outbound', normalizedIds))) {
      await connection.rollback();
      return ResponseHandler.forbidden(res, '批量删除包含无权访问的出库单');
    }
    for (const outbound of outbounds) {
      if (!(await assertOutboundSourceAccess(connection, req, outbound))) {
        await connection.rollback();
        return ResponseHandler.forbidden(res, '批量删除包含无权访问的来源单据');
      }
    }

    // 检查是否有非草稿状态的出库单
    const nonDraftOutbounds = outbounds.filter((o) => o.status !== STATUS.OUTBOUND.DRAFT);
    if (nonDraftOutbounds.length > 0) {
      await connection.rollback();
      const nonDraftNos = nonDraftOutbounds.map((o) => o.outbound_no).join(', ');
      return ResponseHandler.error(
        res,
        `以下出库单不是草稿状态,无法删除: ${nonDraftNos}`,
        'VALIDATION_ERROR',
        400
      );
    }

    // 批量删除出库单物料明细
    await connection.execute(
      `DELETE FROM inventory_outbound_items WHERE outbound_id IN (${placeholders})`,
      normalizedIds
    );

    // ✅ 批量软删除出库单
    const affected = await softDeleteBatch(connection, 'inventory_outbound', 'id', normalizedIds);
    const result = { affectedRows: affected };

    await connection.commit();

    logger.info(`批量删除出库单成功: ${result.affectedRows}个出库单已删除`);

    return ResponseHandler.success(
      res,
      { deleted: result.affectedRows },
      `成功删除 ${result.affectedRows} 个出库单`
    );
  } catch (error) {
    await connection.rollback();
    logger.error('批量删除出库单失败:', error);
    return ResponseHandler.error(res, '批量删除出库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 统一处理出库单状态变更时，联动更新生产任务和计划状态，以及自动创建工序
 * @param {Connection} connection - 数据库连接
 * @param {string} outboundStatus - 新的出库单状态 ('confirmed' | 'completed')
 * @param {number} taskId - 关联的生产任务ID
 */

const cancelOutboundReissue = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { id } = req.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return ResponseHandler.error(res, '无效的出库单ID', 'VALIDATION_ERROR', 400);
    }
    const { force, createReissue = true } = req.body || {};

    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'inventory_outbound', id, '无权撤销该出库单'))) {
      return;
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT
         id, status, reference_id, reference_type, outbound_no, outbound_type,
         production_task_id, source_task_ids, is_batch_outbound, created_by, remark
       FROM inventory_outbound
       WHERE id = ? AND deleted_at IS NULL
       FOR UPDATE`,
      [id]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '出库单不存在', 'NOT_FOUND', 404);
    }

    if (!(await ScopeGuard.assertAccess(connection, req, 'inventory_outbound', id))) {
      await connection.rollback();
      return ResponseHandler.forbidden(res, '无权撤销该出库单');
    }

    const outbound = rows[0];
    const { status, reference_id, reference_type, outbound_no } = outbound;
    const batchTaskIds =
      reference_type === 'batch_production_tasks'
        ? parseSourceTaskIds(outbound.source_task_ids)
        : [];

    if (!(await assertOutboundSourceAccess(connection, req, outbound))) {
      await connection.rollback();
      return ResponseHandler.forbidden(res, '无权撤销该出库单关联的来源单据');
    }
    if (![STATUS.OUTBOUND.COMPLETED, STATUS.OUTBOUND.PARTIAL_COMPLETED].includes(status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '只能撤销已完成或部分完成的出库单', 'VALIDATION_ERROR', 400);
    }

    const prohibitedStatuses = ['inspection', 'quality_passed', 'completed', 'warehoused'];
    const warningStatuses = ['in_progress'];

    if (reference_id && reference_type === 'production_task') {
      const [taskCheck] = await connection.execute(
        'SELECT status, code FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
        [reference_id]
      );

      if (taskCheck.length > 0) {
        const taskStatus = taskCheck[0].status;
        const taskCode = taskCheck[0].code;
        if (prohibitedStatuses.includes(taskStatus)) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `无法撤销：关联的生产任务 ${taskCode} 已进入 ${taskStatus} 状态`,
            'VALIDATION_ERROR',
            400
          );
        }

        if (warningStatuses.includes(taskStatus) && !force) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `警告：关联的生产任务 ${taskCode} 正在生产中。如确需撤销，请使用强制撤销。`,
            'NEED_CONFIRM',
            409,
            { needConfirm: true, taskStatus, taskCode }
          );
        }
      }
    }

    if (reference_id && reference_type === 'production_plan') {
      const [planCheck] = await connection.execute(
        'SELECT status, code FROM production_plans WHERE id = ? AND deleted_at IS NULL',
        [reference_id]
      );

      if (planCheck.length > 0) {
        const planStatus = planCheck[0].status;
        const planCode = planCheck[0].code;
        if (prohibitedStatuses.includes(planStatus)) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `无法撤销：关联的生产计划 ${planCode} 已进入 ${planStatus} 状态`,
            'VALIDATION_ERROR',
            400
          );
        }

        if (warningStatuses.includes(planStatus) && !force) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `警告：关联的生产计划 ${planCode} 正在生产中。如确需撤销，请使用强制撤销。`,
            'NEED_CONFIRM',
            409,
            { needConfirm: true, planStatus, planCode }
          );
        }
      }
    }

    if (reference_type === 'batch_production_tasks') {
      if (batchTaskIds.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '批量发料单缺少来源生产任务，无法安全撤销重发', 'VALIDATION_ERROR', 400);
      }

      if (
        !(await ScopeGuard.denyUnlessAllAccess(
          res,
          connection,
          req,
          'production_task',
          batchTaskIds,
          '无权撤销该批量出库关联的生产任务'
        ))
      ) {
        await connection.rollback();
        return;
      }

      const placeholders = batchTaskIds.map(() => '?').join(',');
      const [taskRows] = await connection.execute(
        `SELECT id, status, code
         FROM production_tasks
         WHERE id IN (${placeholders})
         FOR UPDATE`,
        batchTaskIds
      );

      if (taskRows.length !== batchTaskIds.length) {
        await connection.rollback();
        return ResponseHandler.error(res, '批量发料单的部分来源生产任务不存在', 'VALIDATION_ERROR', 400);
      }

      const blockedTask = taskRows.find((task) => prohibitedStatuses.includes(task.status));
      if (blockedTask) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `无法撤销：批量来源生产任务 ${blockedTask.code} 已进入 ${blockedTask.status} 状态`,
          'VALIDATION_ERROR',
          400
        );
      }

      const inProgressTasks = taskRows.filter((task) => warningStatuses.includes(task.status));
      if (inProgressTasks.length > 0 && !force) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `警告：${inProgressTasks.length} 个批量来源生产任务正在生产中。如确需撤销，请使用强制撤销。`,
          'NEED_CONFIRM',
          409,
          { needConfirm: true, tasks: inProgressTasks }
        );
      }
    }

    const InventoryPostingService = require('../../../../services/InventoryPostingService');
    const posting = await InventoryPostingService.requireApprovedForTransaction(connection, {
      reference_no: outbound_no,
      reference_type: 'outbound',
    });
    const [ledgerRows] = await connection.execute(
      `SELECT id, ABS(signed_quantity) AS qty
         FROM inventory_posting_lines
        WHERE posting_document_id = ?
        ORDER BY line_no`,
      [posting.id]
    );
    await InventoryPostingService.reverse(
      posting.id,
      InventoryPostingService.actorFromRequest(req),
      `撤销出库单 ${outbound_no}`,
      connection
    );
    const operator = await getCurrentUserName(req);
    const reversedLedgerCount = ledgerRows.length;
    const reversedQuantity = ledgerRows.reduce((sum, row) => sum + Number(row.qty || 0), 0);

    const [statusUpdate] = await connection.execute(
      `UPDATE inventory_outbound
       SET status = ?, remark = CONCAT(COALESCE(remark, ''), ?), updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL
         AND status IN (?, ?)`,
      [
        STATUS.OUTBOUND.REVERSED,
        ` [已由 ${operator} 撤销]`,
        id,
        STATUS.OUTBOUND.COMPLETED,
        STATUS.OUTBOUND.PARTIAL_COMPLETED,
      ]
    );
    if (!statusUpdate.affectedRows) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '出库单状态已变更，无法撤销（可能已被并发处理）',
        'VALIDATION_ERROR',
        400
      );
    }

    const affectedTaskIds =
      reference_type === 'production_task' && reference_id
        ? [reference_id]
        : batchTaskIds;
    await cleanupOutboundSideEffects(connection, id, outbound_no, affectedTaskIds);

    let reissueOutbound = null;
    const isBatchReissue =
      reference_type === 'batch_production_tasks' && batchTaskIds.length > 0;
    const canCreateReissue =
      createReissue !== false &&
      ((reference_id &&
        (reference_type === 'production_task' || reference_type === 'production_plan')) ||
        isBatchReissue);

    if (canCreateReissue) {
      const newOutboundNo = await CodeGenerators.generateInventoryOutboundCode(connection);
      const productionTaskId =
        reference_type === 'production_task'
          ? reference_id
          : outbound.production_task_id || null;

      let insertResult;
      let bomResult;

      const reissueCreatedBy = req.user?.id || req.user?.userId || outbound.created_by || null;
      if (isBatchReissue) {
        [insertResult] = await connection.execute(
          `INSERT INTO inventory_outbound
            (outbound_no, outbound_date, status, outbound_type, operator, remark,
             reference_type, source_task_ids, is_batch_outbound, created_by, created_at, updated_at)
           VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
          [
            newOutboundNo,
            STATUS.OUTBOUND.DRAFT,
            outbound.outbound_type || 'batch_issue',
            operator,
            `由已撤销的批量出库单 ${outbound_no} 按统一净需求重新生成，请在完成前核实明细。`,
            'batch_production_tasks',
            JSON.stringify(batchTaskIds),
            reissueCreatedBy,
          ]
        );

        bomResult = await fetchBatchBomItemsForOutbound(
          connection,
          insertResult.insertId,
          batchTaskIds
        );
      } else {
        [insertResult] = await connection.execute(
          `INSERT INTO inventory_outbound
            (outbound_no, outbound_date, status, outbound_type, operator, remark,
             reference_id, reference_type, production_task_id, created_by, created_at, updated_at)
           VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            newOutboundNo,
            STATUS.OUTBOUND.DRAFT,
            outbound.outbound_type || 'bom_issue',
            operator,
            `由已撤销的出库单 ${outbound_no} 按统一净需求重新生成，请在完成前核实明细。`,
            reference_id,
            reference_type,
            productionTaskId,
            reissueCreatedBy,
          ]
        );

        bomResult = await fetchBomItemsForOutbound(
          connection,
          insertResult.insertId,
          reference_type,
          reference_id
        );
      }

      if (!bomResult.success) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `已准备冲销，但无法按统一净需求生成新出库单: ${bomResult.error}`,
          'VALIDATION_ERROR',
          400
        );
      }

      reissueOutbound = {
        id: insertResult.insertId,
        outbound_no: newOutboundNo,
        itemCount: bomResult.itemCount,
      };
    }

    if (affectedTaskIds.length > 0) {
      const placeholders = affectedTaskIds.map(() => '?').join(',');
      // 撤销发料后回退到配料中（状态机允许 material_issued → preparing）
      const { promoteTaskStatus } = require('../../../../services/business/TaskLifecycleService');
      for (const tid of affectedTaskIds) {
        await promoteTaskStatus(connection, tid, STATUS.PRODUCTION_TASK.PREPARING, {
          onlyFrom: [
            STATUS.PRODUCTION_TASK.MATERIAL_ISSUED,
            STATUS.PRODUCTION_TASK.MATERIAL_PARTIAL_ISSUED,
          ],
        });
      }

      await connection.execute(
        `UPDATE production_plans pp
         JOIN production_tasks pt ON pt.plan_id = pp.id AND pt.deleted_at IS NULL
         SET pp.status = ?, pp.updated_at = NOW()
         WHERE pt.id IN (${placeholders})
           AND pp.deleted_at IS NULL
           AND pp.status = ?`,
        [
          STATUS.PRODUCTION_PLAN.PREPARING,
          ...affectedTaskIds,
          STATUS.PRODUCTION_PLAN.MATERIAL_ISSUED,
        ]
      );
    }

    if (reference_id && reference_type === 'production_plan') {
      const [planCheck] = await connection.execute(
        'SELECT status FROM production_plans WHERE id = ? AND deleted_at IS NULL',
        [reference_id]
      );
      if (planCheck[0]?.status === STATUS.PRODUCTION_PLAN.MATERIAL_ISSUED) {
        await connection.execute('UPDATE production_plans SET status = ? WHERE id = ? AND deleted_at IS NULL', [
          STATUS.PRODUCTION_PLAN.PREPARING,
          reference_id,
        ]);
      }
    }

    await connection.commit();

    const financeReversal = await reversePostedGLEntriesForOutbound(outbound_no, operator);

    return ResponseHandler.success(
      res,
      {
        id,
        outbound_no,
        reversedLedgerCount,
        reversedQuantity,
        reissueOutbound,
        financeReversal,
      },
      reissueOutbound
        ? '撤销重发成功，已按统一净需求生成新的草稿出库单'
        : '撤销成功，库存已冲回'
    );
  } catch (error) {
    await connection.rollback();
    logger.error('撤销重发失败:', error);
    return ResponseHandler.error(
      res,
      error.message || '撤销重发失败',
      error.code || 'SERVER_ERROR',
      error.statusCode || 500,
      error
    );
  } finally {
    connection.release();
  }
};

const cleanupOutboundSideEffects = async (connection, outboundId, outboundNo, taskIds) => {
  await connection.execute(
    `UPDATE material_shortage_records
     SET status = 'cancelled',
         remaining_quantity = 0,
         remark = CONCAT(COALESCE(remark, ''), ?),
         updated_at = NOW(),
         completed_at = COALESCE(completed_at, NOW())
     WHERE outbound_id = ?
       AND status IN ('pending', 'partial_supplied')`,
    [`\nCancelled by outbound reversal ${outboundNo}`, outboundId]
  );

  if (!Array.isArray(taskIds) || taskIds.length === 0) return;

  const placeholders = taskIds.map(() => '?').join(',');
  await connection.execute(
    `DELETE FROM production_processes
     WHERE task_id IN (${placeholders})
       AND status = 'pending'
       AND COALESCE(progress, 0) = 0
       AND (
         remarks LIKE '%自动创建%'
         OR remarks LIKE '%出库单%'
         OR description LIKE '%默认生产过程%'
       )`,
    taskIds
  );
};

const reversePostedGLEntriesForOutbound = async (outboundNo, operator) => {
  try {
    const [entries] = await db.pool.execute(
      `SELECT id
       FROM gl_entries
       WHERE document_number = ?
         AND is_posted = 1
         AND COALESCE(is_reversed, 0) = 0
         AND NOT EXISTS (
           SELECT 1 FROM gl_entries reversal
           WHERE reversal.reversal_entry_id = gl_entries.id
         )
       ORDER BY id ASC`,
      [outboundNo]
    );

    if (entries.length === 0) {
      return { reversedCount: 0, errors: [] };
    }

    const financeModel = require('../../../models/finance');
    const errors = [];
    let reversedCount = 0;
    const today = currentDateString();

    for (const entry of entries) {
      try {
        await financeModel.reverseEntry(entry.id, {
          entry_date: today,
          posting_date: today,
          description: `Outbound reversal ${outboundNo}`,
          created_by: await resolveActorLabel(null, operator),
        });
        reversedCount += 1;
      } catch (error) {
        errors.push({ entryId: entry.id, message: error.message });
        logger.error(`出库单 ${outboundNo} 自动冲销会计分录失败:`, error);
      }
    }

    return { reversedCount, errors };
  } catch (error) {
    logger.error(`查询出库单 ${outboundNo} 会计分录失败:`, error);
    return { reversedCount: 0, errors: [{ message: error.message }] };
  }
};

module.exports = {
  updateOutboundStatus,
  batchUpdateOutboundStatus,
  batchDeleteOutbound,
  cancelOutboundReissue,
  cleanupOutboundSideEffects,
  reversePostedGLEntriesForOutbound,
};
