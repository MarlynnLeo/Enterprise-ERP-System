/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const InventoryService = require('../../../services/InventoryService');
// const InventoryDeductionService = require('../../../services/business/InventoryDeductionService');
const businessConfig = require('../../../config/businessConfig');
const { getCurrentUserName } = require('../../../utils/userHelper');

// 统一库存查询子查询（基于 inventory_ledger 单表架构聚合计算当前库存）
const STOCK_SUBQUERY = `(SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity, MAX(created_at) as updated_at FROM inventory_ledger GROUP BY material_id, location_id)`;
// DRY: 两处引用相同子查询，统一使用 STOCK_SUBQUERY
const SIMPLE_STOCK_SUBQUERY = STOCK_SUBQUERY;

const {
  getInventoryTransactionTypeText,
  getTransferStatusText,
  getSalesStatusText,
  generateStatusCaseSQL,
  INVENTORY_TRANSACTION_TYPES,
  INVENTORY_TRANSACTION_GROUPS,
} = require('../../../constants/systemConstants');

// 引入库存一致性校验服务
const InventoryConsistencyService = require('../../../services/business/InventoryConsistencyService');

// 引入成本凭证服务（用于生成领料凭证）

// 引入重构后的入库处理服务

// 引入状态映射工具和状态常量
const STATUS = {
  OUTBOUND: businessConfig.status.outbound,
  INBOUND: businessConfig.status.inbound,
  PRODUCTION_TASK: businessConfig.status.productionTask,
  PRODUCTION_PLAN: businessConfig.status.productionPlan,
  APPROVAL: businessConfig.status.approval,
  TRANSFER: businessConfig.status.transfer,
};

/**
 * 获取物料的批次号（FIFO原则）
 * @param {object} connection - 数据库连接
 * @param {number} materialId - 物料ID
 * @param {number} locationId - 库位ID（可选）
 * @param {string} defaultBatchNo - 默认批次号（如果查询失败）
 * @returns {Promise<string>} 批次号
 */

const runConsistencyCheck = async (req, res) => {
  try {
    logger.info('执行库存数据一致性检查...');
    const report = await InventoryConsistencyService.runFullConsistencyCheck();

    ResponseHandler.success(res, report, '数据一致性检查完成');
  } catch (error) {
    logger.error('数据一致性检查失败:', error);
    ResponseHandler.error(res, '数据一致性检查失败: ' + error.message, 'SERVER_ERROR', 500);
  }
};

/**
 * 获取负库存列表
 */

const getNegativeStock = async (req, res) => {
  try {
    const negativeStocks = await InventoryConsistencyService.checkNegativeStock();

    ResponseHandler.success(
      res,
      {
        count: negativeStocks.length,
        items: negativeStocks,
      },
      '获取负库存列表成功'
    );
  } catch (error) {
    logger.error('获取负库存列表失败:', error);
    ResponseHandler.error(res, '获取负库存列表失败: ' + error.message, 'SERVER_ERROR', 500);
  }
};

/**
 * 修复数量不一致记录
 */

const fixQuantityConsistency = async (req, res) => {
  try {
    logger.info('修复库存数量不一致记录...');
    const result = await InventoryConsistencyService.fixQuantityConsistency();

    ResponseHandler.success(res, result, `成功修复 ${result.fixedCount} 条记录`);
  } catch (error) {
    logger.error('修复数量不一致记录失败:', error);
    ResponseHandler.error(res, '修复失败: ' + error.message, 'SERVER_ERROR', 500);
  }
};

/**
 * 修复负库存（生成调整单）
 */

const fixNegativeStock = async (req, res) => {
  try {
    const operator = await getCurrentUserName(req);
    logger.info(`用户 ${operator} 执行负库存修复...`);

    const result = await InventoryConsistencyService.generateAdjustmentForNegativeStock(operator);

    ResponseHandler.success(res, result, result.message);
  } catch (error) {
    logger.error('修复负库存失败:', error);
    ResponseHandler.error(res, '修复负库存失败: ' + error.message, 'SERVER_ERROR', 500);
  }
};

// 批次库存明细查询

const _syncProductionStatus = async (connection, outboundStatus, taskId) => {
  if (!taskId) return;
  try {
    if (outboundStatus === 'confirmed') {
      // 出库单确认 → 任务变为配料中（仅从较早状态升级）
      await connection.execute(
        "UPDATE production_tasks SET status = 'preparing' WHERE id = ? AND status IN ('pending', 'allocated', 'material_issuing')",
        [taskId]
      );
    } else if (outboundStatus === 'completed') {
      // 出库单完成 → 任务变为已发料
      await connection.execute(
        "UPDATE production_tasks SET status = 'material_issued' WHERE id = ?",
        [taskId]
      );
    }

    // 联动更新关联的生产计划
    const [taskInfo] = await connection.execute(
      'SELECT plan_id FROM production_tasks WHERE id = ?',
      [taskId]
    );
    if (taskInfo.length > 0 && taskInfo[0].plan_id) {
      const planId = taskInfo[0].plan_id;
      if (outboundStatus === 'confirmed') {
        await connection.execute(
          "UPDATE production_plans SET status = 'preparing' WHERE id = ? AND status IN ('draft', 'allocated', 'material_issuing')",
          [planId]
        );
        logger.info(`生产计划 ${planId} 已更新为 preparing（配料中）`);
      } else if (outboundStatus === 'completed') {
        // 全部任务已发料才更新计划
        const [stats] = await connection.execute(
          `SELECT COUNT(*) as total,
           SUM(CASE WHEN status IN ('material_issued','in_progress','completed') THEN 1 ELSE 0 END) as done
           FROM production_tasks WHERE plan_id = ? AND status != 'cancelled'`,
          [planId]
        );
        if (stats[0].total > 0 && stats[0].done >= stats[0].total) {
          await connection.execute(
            "UPDATE production_plans SET status = 'material_issued' WHERE id = ? AND status IN ('allocated','preparing','material_issuing')",
            [planId]
          );
          logger.info(`生产计划 ${planId} 所有任务已发料，状态更新为 material_issued`);
        }
      }
    }

    // 出库完成：若任务尚无工序则从模板自动创建
    if (outboundStatus === 'completed') {
      try {
        const [existing] = await connection.execute(
          'SELECT COUNT(*) as cnt FROM production_processes WHERE task_id = ?',
          [taskId]
        );
        if (Number(existing[0].cnt) === 0) {
          const [taskDetail] = await connection.execute(
            'SELECT product_id, quantity FROM production_tasks WHERE id = ?',
            [taskId]
          );
          if (taskDetail.length > 0) {
            const { product_id: productId, quantity: taskQuantity } = taskDetail[0];
            const [templates] = await connection.execute(
              'SELECT id FROM process_templates WHERE product_id = ? AND status = 1 ORDER BY created_at DESC LIMIT 1',
              [productId]
            );
            if (templates.length > 0) {
              const [steps] = await connection.execute(
                'SELECT * FROM process_template_details WHERE template_id = ? ORDER BY order_num',
                [templates[0].id]
              );
              for (const step of steps) {
                await connection.execute(
                  `INSERT INTO production_processes (task_id, process_name, sequence, quantity, progress, status, description, remarks)
                   VALUES (?, ?, ?, ?, 0, 'pending', ?, ?)`,
                  [taskId, step.name, step.order_num, taskQuantity, step.description || '', step.remark || '']
                );
              }
              logger.info(`✅ 出库完成后自动生成了 ${steps.length} 个工序（任务ID: ${taskId}）`);
            }
          }
        }
      } catch (processErr) {
        logger.error('出库完成后自动生成工序失败:', processErr);
      }
    }
  } catch (err) {
    logger.error(`[_syncProductionStatus] 联动更新失败 outboundStatus=${outboundStatus} taskId=${taskId}:`, err);
  }
};


const checkAndUpdateTaskStatus = async (connection, taskId) => {
  try {
    if (!taskId) return;

    // 1. 获取任务信息
    const [tasks] = await connection.execute(
      'SELECT product_id, quantity, status FROM production_tasks WHERE id = ?',
      [taskId]
    );
    if (tasks.length === 0) return;
    const task = tasks[0];

    // 如果状态已经是"生产中"或更后面的状态（完成、取消、检验、入库等），不处理
    // 这可以防止补料申请导致任务状态被重置
    const protectedStatuses = [
      'in_progress', // 生产中
      'inspection', // 检验中
      'warehousing', // 入库中
      'completed', // 已完成
      'cancelled', // 已取消
    ];

    if (protectedStatuses.includes(task.status)) {
      logger.info(
        `[checkAndUpdateTaskStatus] 任务 ${taskId} 状态为 ${task.status}，跳过发料状态检查`
      );
      return;
    }

    // 2. 获取BOM需求
    // 查找由于productId可能对应多版本BOM，取最新的已审核版本
    const [boms] = await connection.execute(
      `SELECT id FROM bom_masters 
       WHERE product_id = ? AND approved_by IS NOT NULL 
       ORDER BY created_at DESC LIMIT 1`,
      [task.product_id]
    );

    // 如果没有BOM，无法判断发料进度，跳过
    if (boms.length === 0) return;
    const bomId = boms[0].id;

    const [bomDetails] = await connection.execute(
      'SELECT material_id, quantity FROM bom_details WHERE bom_id = ?',
      [bomId]
    );

    if (bomDetails.length === 0) return;

    // 3. 计算发料情况
    let allIssued = true;

    // 获取该任务所有的出库明细汇总
    const [issuedSummary] = await connection.execute(
      `SELECT ioi.material_id, SUM(ioi.actual_quantity) as total_issued
       FROM inventory_outbound io
       JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
       WHERE io.production_task_id = ? AND io.status IN ('completed', 'partial_completed')
       GROUP BY ioi.material_id`,
      [taskId]
    );

    const issuedMap = {};
    issuedSummary.forEach((row) => {
      issuedMap[row.material_id] = parseFloat(row.total_issued || 0);
    });

    for (const item of bomDetails) {
      const requiredQty = item.quantity * task.quantity;
      const issuedQty = issuedMap[item.material_id] || 0;

      // 允许微小误差? 暂时严格 >=
      if (issuedQty < requiredQty) {
        allIssued = false;
        break;
      }
    }

    // 4. 更新状态
    if (allIssued) {
      // 全部已发料 -> material_issued
      if (task.status !== 'material_issued') {
        await connection.execute(
          "UPDATE production_tasks SET status = 'material_issued', updated_at = NOW() WHERE id = ?",
          [taskId]
        );
        logger.info(`生产任务 ${taskId} 所有物料已发齐，状态更新为 'material_issued'`);
      }
    } else {
      // 部分发料，设置任务为配料中（preparing），与生产计划状态统一
      if (['draft', 'allocated', 'preparing', 'material_issuing'].includes(task.status)) {
        await connection.execute(
          "UPDATE production_tasks SET status = 'preparing', updated_at = NOW() WHERE id = ?",
          [taskId]
        );
      }
    }
  } catch (error) {
    logger.error(`检查生产任务 ${taskId} 发料状态失败:`, error);
  }
};



/**
 * 智能出库函数 - 当父物料库存不足时自动使用子物料替代
 * @param {number} materialId - 物料ID
 * @param {number} locationId - 库位ID
 * @param {number} quantity - 出库数量
 * @param {string} operator - 操作员
 * @param {string} remark - 备注
 * @param {number} productionPlanId - 生产计划ID
 * @param {object} connection - 数据库连接
 * @param {object} extraData - 额外数据（如 issue_reason, is_excess）
 */
async function smartOutboundStock(
  materialId,
  locationId,
  quantity,
  operator,
  remark,
  productionPlanId,
  connection,
  extraData = {}
) {
  try {
    // 0. 从正规服务获取完整的物料默认配置
    const materialInfo = await InventoryService.getMaterialInfo(materialId, connection);
    const materialUnitId = materialInfo.unitId;

    // 0.1 获取物料成本单价，用于写入台账的 unit_cost 字段
    const [costPriceRow] = await connection.execute(
      'SELECT COALESCE(cost_price, 0) as cost_price FROM materials WHERE id = ?',
      [materialId]
    );
    const materialUnitCost = parseFloat(costPriceRow[0]?.cost_price) || 0;

    // 1. 获取当前仓库的可用库存（直接使用库存服务层统一接口）
    const currentStock = await InventoryService.getCurrentStock(materialId, locationId, connection, true);
    let remainingQuantity = parseFloat(quantity);

    // 2. 如果存在现货库存，则直接从目标库位优先发料
    if (currentStock > 0) {
      const deductQty = Math.min(currentStock, remainingQuantity);

      await InventoryService.updateStock(
        {
          materialId,
          locationId,
          transactionType: 'production_outbound',
          quantity: -deductQty,
          unitId: materialUnitId,
          referenceNo: remark.split(': ')[1] || remark,
          referenceType: 'production_task',
          operator,
          remark,
          issue_reason: extraData.issueReason || null,
          is_excess: extraData.isExcess || 0,
          batchNumber: extraData.batchNumber || null,
          unitCost: materialUnitCost,
        },
        connection
      );

      remainingQuantity -= deductQty;
    }

    // 3. 如果库存充足已经完全发料，直接返回
    if (remainingQuantity <= 0) {
      return;
    }

    // 4. 库存不足，进行混合出库：剩余部分尝试用子物料替代或由末尾逻辑强行作负库存兜底
    // 3.2 查找是否有子物料可以替代剩余数量

    // 获取生产计划的产品信息
    // 注意：productionPlanId 可能实际上是 production_task 的 ID
    // 需要先尝试从 production_tasks 获取 plan_id，如果不存在则直接使用
    let actualPlanId = productionPlanId;

    // 先尝试作为生产任务ID查询
    const [taskInfo] = await connection.execute(
      'SELECT plan_id, product_id FROM production_tasks WHERE id = ?',
      [productionPlanId]
    );

    let productId = null;

    if (taskInfo.length > 0) {
      // 这是一个生产任务ID
      productId = taskInfo[0].product_id;
      actualPlanId = taskInfo[0].plan_id;
      logger.debug(
        `智能出库：从生产任务 ${productionPlanId} 获取产品ID ${productId}，计划ID ${actualPlanId}`
      );
    } else {
      // 尝试作为生产计划ID查询
      const [planInfo] = await connection.execute(
        'SELECT product_id FROM production_plans WHERE id = ?',
        [productionPlanId]
      );

      if (planInfo.length === 0) {
        throw new Error(`找不到生产任务或生产计划 ID: ${productionPlanId}`);
      }

      productId = planInfo[0].product_id;
      logger.debug(`智能出库：从生产计划 ${productionPlanId} 获取产品ID ${productId}`);
    }

    // 通过产品ID查找已审核的BOM
    const [bomInfo] = await connection.execute(
      `SELECT bm.id as bom_id
       FROM bom_masters bm
       WHERE bm.product_id = ? AND bm.approved_by IS NOT NULL`,
      [productId]
    );

    if (bomInfo.length === 0) {
      throw new Error(`产品 ${productId} 没有有效的BOM`);
    }

    const bomId = bomInfo[0].bom_id;

    // 获取BOM详情，查找子物料
    const [bomDetails] = await connection.execute(
      `SELECT bd.id, bd.material_id, bd.quantity, bd.level, bd.parent_id,
              m.code, m.name, m.specs,
              COALESCE(s.quantity, 0) as stock_quantity
       FROM bom_details bd
       LEFT JOIN materials m ON bd.material_id = m.id
       LEFT JOIN (
         SELECT il.material_id, SUM(il.quantity) as quantity
         FROM inventory_ledger il
         JOIN materials mat ON il.material_id = mat.id
         WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
         GROUP BY il.material_id
       ) s ON m.id = s.material_id
       WHERE bd.bom_id = ?
       ORDER BY bd.level ASC, bd.id ASC`,
      [bomId]
    );

    // 查找当前物料在BOM中的信息
    const currentMaterial = bomDetails.find((detail) => detail.material_id === materialId);
    if (!currentMaterial) {
      throw new Error(`物料 ${materialId} 不在BOM中，无法进行智能替代`);
    }

    // 查找该物料的直接子物料
    const childMaterials = bomDetails.filter(
      (detail) => detail.parent_id === currentMaterial.id && detail.level > currentMaterial.level
    );

    if (childMaterials.length === 0) {
      // 没有子物料时，继续记录出库流水（允许负库存），不报错
      logger.warn(
        `物料 ${materialId} 没有子物料，直接记录剩余数量 ${remainingQuantity} 的出库流水（可能产生负库存）`
      );

      await InventoryService.updateStock(
        {
          materialId,
          locationId,
          transactionType: 'production_outbound',
          quantity: -remainingQuantity,
          unitId: materialUnitId,
          referenceNo: remark.split(': ')[1] || remark,
          referenceType: 'production_task',
          operator,
          remark: `${remark} (库存不足，无子物料替代)`,
          issue_reason: extraData.issueReason || null,
          is_excess: extraData.isExcess || 0,
          allowNegativeStock: true, // 明确允许兜底出库
          unitCost: materialUnitCost,
        },
        connection
      );

      return; // 完成出库，直接返回
    }

    // 4. 使用子物料进行剩余数量的替代出库
    // let totalOutboundQuantity = 0;
    const insufficientMaterials = [];
    const successfulOutbounds = [];

    // 批量预取所有子物料信息（消除循环内 getMaterialInfo + cost_price 双重 N+1 查询）
    const childMaterialIds = childMaterials.map(cm => cm.material_id);
    const childMaterialInfoMap = await InventoryService.getBatchMaterialInfo(childMaterialIds, connection);

    for (const childMaterial of childMaterials) {
      const childStockQuantity = parseFloat(childMaterial.stock_quantity) || 0;
      const _childRequiredQuantity = parseFloat(childMaterial.quantity) || 1;

      // 修改：子物料出库量应该等于剩余需要出库的主物料数量
      // 因为子物料是替代主物料的，所以应该是1:1的关系
      const childOutboundQuantity = remainingQuantity;

      if (childStockQuantity < childOutboundQuantity) {
        insufficientMaterials.push({
          code: childMaterial.code,
          name: childMaterial.name,
          required: childOutboundQuantity,
          available: childStockQuantity,
        });
        continue; // 跳过库存不足的子物料，继续检查其他子物料
      }

      try {
        // 从批量预取结果获取子物料属性（含 costPrice）
        const childMatInfo = childMaterialInfoMap.get(childMaterial.material_id);
        const childLocationId = childMatInfo.locationId || locationId;
        const childUnitId = childMatInfo.unitId || null;
        const childUnitCost = childMatInfo.costPrice || 0;

        await InventoryService.updateStock(
          {
            materialId: childMaterial.material_id,
            locationId: childLocationId,
            transactionType: 'production_outbound', // 🔥 修改为 production_outbound
            quantity: -parseFloat(childOutboundQuantity),
            unitId: childUnitId, // 从物料表获取正确的 unit_id
            referenceNo: remark.split(': ')[1] || remark, // 提取出库单号
            referenceType: 'production_task', // 🔥 修改为 production_task
            operator,
            remark: `${remark} (替代物料 ${materialId})`,
            issue_reason: extraData.issueReason || null,
            is_excess: extraData.isExcess || 0,
            allowNegativeStock: true, // 智能查子料默认允许一定程度透支
            unitCost: childUnitCost,
          },
          connection
        );

        // totalOutboundQuantity += childOutboundQuantity;
        successfulOutbounds.push({
          code: childMaterial.code,
          name: childMaterial.name,
          quantity: childOutboundQuantity,
        });
      } catch (outboundError) {
        logger.error(`出库子物料 ${childMaterial.code} 失败:`, outboundError);
        insufficientMaterials.push({
          code: childMaterial.code,
          name: childMaterial.name,
          required: childOutboundQuantity,
          error: outboundError.message,
        });
      }
    }

    // 检查是否有成功的出库
    if (successfulOutbounds.length > 0) {
      // 部分成功的情况
      if (insufficientMaterials.length > 0) {
        logger.warn('部分物料库存不足，但已完成部分出库');
      }
    } else {
      // 所有子物料都库存不足
      const errorMessage = `所有子物料库存不足: ${insufficientMaterials.map((m) => `${m.code}(需要${m.required},库存${m.available})`).join(', ')}`;
      throw new Error(errorMessage);
    }
  } catch (error) {
    logger.error('智能出库失败:', error);
    throw error;
  }
}






module.exports = {
  runConsistencyCheck,
  getNegativeStock,
  fixQuantityConsistency,
  fixNegativeStock,
  _syncProductionStatus,
  checkAndUpdateTaskStatus,
};
