/**
 * TaskLifecycleService.js
 * @description 生产任务生命周期服务 — 提取自 taskController.js 的公共业务逻辑
 *
 * 职责：
 *  1. syncPlanStatus()   — 根据子任务汇总状态同步更新父级生产计划（消除重复 #2）
 *  2. TASK_STATE_MACHINE — 任务状态转移矩阵（修复 #6 缺失状态机）
 *  3. generateBatchNo()  — 统一生成有业务意义的批次号（修复 #3）
 *
 * @date 2026-04-28
 * @version 1.0.0
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');

// ===================== 1. 任务状态机 =====================
/**
 * 任务状态转移矩阵
 * key = 当前状态，value = 允许转移到的目标状态列表
 *
 * 状态流转路径（排程只写日期不改状态）：
 *   pending → material_issuing → material_issued → in_progress → inspection → warehousing → completed
 *   pending 也可先经过 allocated / preparing 再进入 material_issuing
 *   任何非终态 → cancelled
 */
const TASK_STATE_MACHINE = {
  // 待处理：排程后仍为此状态，可直接发料或先分配
  pending: [
    'allocated',
    'preparing',
    'material_issuing',
    'material_partial_issued',
    'material_issued',
    'cancelled',
  ],
  // 已分配：可开始配料或直接发料
  allocated: [
    'preparing',
    'material_issuing',
    'material_partial_issued',
    'material_issued',
    'cancelled',
  ],
  // 配料中：正在准备物料
  preparing: ['material_issuing', 'material_partial_issued', 'material_issued', 'cancelled'],
  // 发料中：仓库正在出库
  material_issuing: ['material_partial_issued', 'material_issued', 'preparing', 'cancelled'],
  // 部分发料：可继续发料或确认已发完
  material_partial_issued: ['material_issuing', 'material_issued', 'in_progress', 'cancelled'],
  // 已发料：物料齐套，可开始生产
  material_issued: ['in_progress', 'preparing', 'cancelled'],
  // 生产中：完工数量走 completeTask；状态只能进待检/暂停，禁止 PUT 直达 completed
  in_progress: ['inspection', 'paused', 'cancelled'],
  // 暂停
  paused: ['in_progress', 'cancelled'],
  // 待检验：成品入库确认可直接 completed，也可经 warehousing
  inspection: ['warehousing', 'completed', 'in_progress', 'cancelled'],
  // 入库中：由生产入库完成写入 completed
  warehousing: ['completed', 'cancelled'],
  // 终态
  completed: [],
  cancelled: [],
};

/**
 * 校验任务状态转移是否合法
 * @param {string} currentStatus - 当前状态
 * @param {string} targetStatus  - 目标状态
 * @returns {{ valid: boolean, message: string }}
 */
function validateTaskTransition(currentStatus, targetStatus) {
  const allowed = TASK_STATE_MACHINE[currentStatus];

  if (!allowed) {
    return {
      valid: false,
      message: `未知的当前状态: ${currentStatus}`,
    };
  }

  if (currentStatus === targetStatus) {
    return { valid: true, message: '状态未变化' };
  }

  if (!allowed.includes(targetStatus)) {
    const allowedText = allowed.length > 0 ? allowed.join(', ') : '无（终态）';
    return {
      valid: false,
      message: `任务状态不允许从 [${currentStatus}] 转移到 [${targetStatus}]。允许的目标: [${allowedText}]`,
    };
  }

  return { valid: true, message: '' };
}

// ===================== 2. 计划状态同步 =====================
/**
 * 根据任务统计结果推导生产计划的正确状态
 * 统一规则 — 优先级从高到低：
 *   全部完成 → completed
 *   有入库中 → warehousing
 *   有待检验 → inspection
 *   有生产中 → in_progress
 *   有已发料 → material_issued
 *   有配料中/发料中/分配中 → preparing
 *   全部待处理 → draft
 *
 * @param {number} planId     - 生产计划ID
 * @param {Object} connection - 事务中的数据库连接
 * @returns {Promise<{ updated: boolean, from: string, to: string }>}
 */
async function syncPlanStatus(planId, connection) {
  if (!planId) return { updated: false, from: null, to: null };

  const conn = connection || pool;

  // 使用参数化查询替代模板字符串（修复 #8 SQL注入风险）
  const [taskStats] = await conn.query(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'pending'           THEN 1 ELSE 0 END) as pending_count,
       SUM(CASE WHEN status = 'allocated'          THEN 1 ELSE 0 END) as allocated_count,
       SUM(CASE WHEN status = 'material_issuing'   THEN 1 ELSE 0 END) as material_issuing_count,
       SUM(CASE WHEN status = 'preparing'          THEN 1 ELSE 0 END) as preparing_count,
       SUM(CASE WHEN status = 'material_issued'    THEN 1 ELSE 0 END) as material_issued_count,
       SUM(CASE WHEN status = 'in_progress'        THEN 1 ELSE 0 END) as in_progress_count,
       SUM(CASE WHEN status = 'inspection'         THEN 1 ELSE 0 END) as inspection_count,
       SUM(CASE WHEN status = 'warehousing'        THEN 1 ELSE 0 END) as warehousing_count,
       SUM(CASE WHEN status = 'completed'          THEN 1 ELSE 0 END) as completed_count,
       SUM(CASE WHEN status = 'cancelled'          THEN 1 ELSE 0 END) as cancelled_count
     FROM production_tasks
     WHERE plan_id = ? AND deleted_at IS NULL`,
    [planId]
  );

  const stats = taskStats[0];
  const activeTotal = stats.total - stats.cancelled_count;

  const [planInfo] = await conn.query(
    'SELECT status FROM production_plans WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
    [planId]
  );

  if (planInfo.length === 0) return { updated: false, from: null, to: null };

  const currentPlanStatus = planInfo[0].status;
  let newPlanStatus = currentPlanStatus;

  // 统一的优先级判断（完整版 — 修复 #2 两处不一致的问题）
  if (stats.completed_count === activeTotal && activeTotal > 0) {
    newPlanStatus = 'completed';
  } else if (stats.warehousing_count > 0) {
    newPlanStatus = 'warehousing';
  } else if (stats.inspection_count > 0) {
    newPlanStatus = 'inspection';
  } else if (stats.in_progress_count > 0) {
    newPlanStatus = 'in_progress';
  } else if (stats.material_issued_count > 0) {
    newPlanStatus = 'material_issued';
  } else if (
    stats.preparing_count > 0 ||
    stats.material_issuing_count > 0 ||
    stats.allocated_count > 0
  ) {
    newPlanStatus = 'preparing';
  } else if (stats.pending_count === activeTotal && activeTotal > 0) {
    newPlanStatus = 'draft';
  }

  if (newPlanStatus !== currentPlanStatus) {
    await conn.query('UPDATE production_plans SET status = ? WHERE id = ? AND deleted_at IS NULL', [
      newPlanStatus,
      planId,
    ]);
    logger.info(`[计划同步] 计划 ${planId} 状态更新: ${currentPlanStatus} → ${newPlanStatus}`);
    return { updated: true, from: currentPlanStatus, to: newPlanStatus };
  }

  return { updated: false, from: currentPlanStatus, to: currentPlanStatus };
}

/**
 * 生成有业务意义的批次号
 * 格式: B-{任务编号去掉横杠}
 * 例如: B-PT202605110001
 *
 * 同一任务的所有检验单、追溯记录共用同一个批次号
 *
 * @param {string} taskCode - 任务编号（如 PT-20260511-0001）
 * @param {Object} [connection] - 可选数据库连接
 * @returns {Promise<string>} 批次号
 */
function buildTaskBatchNo(taskCode) {
  const shortCode = String(taskCode || '').replace(/[-\s]/g, '');
  return shortCode ? `B-${shortCode}` : '';
}

function normalizeTaskBatchNo(batchNo, taskCode) {
  const generatedBatchNo = buildTaskBatchNo(taskCode);
  const rawBatchNo = String(batchNo || '').trim();
  if (!rawBatchNo) return generatedBatchNo;

  const productionTaskMatch = rawBatchNo.match(/^B-?(PT\d{12})(?:-\d{6}-\d+)?$/i);
  if (productionTaskMatch) {
    return `B-${productionTaskMatch[1].toUpperCase()}`;
  }

  if (generatedBatchNo) {
    const compactGenerated = generatedBatchNo.replace('-', '');
    const compactRaw = rawBatchNo.replace(/[-\s]/g, '');
    if (compactRaw === compactGenerated || rawBatchNo.startsWith(`${generatedBatchNo}-`)) {
      return generatedBatchNo;
    }
  }

  return rawBatchNo;
}

async function generateBatchNo(taskCode, connection) {
  const conn = connection || pool;
  const generatedBatchNo = buildTaskBatchNo(taskCode);
  // 查询该任务是否已有批次号
  const [existing] = await conn.query(
    "SELECT batch_no FROM quality_inspections WHERE reference_no = ? AND batch_no IS NOT NULL AND batch_no != '' ORDER BY id ASC LIMIT 1",
    [taskCode]
  );

  if (existing.length > 0 && existing[0].batch_no && !existing[0].batch_no.startsWith('BATCH')) {
    // 已有有意义的批次号，复用
    return normalizeTaskBatchNo(existing[0].batch_no, taskCode);
  }

  return generatedBatchNo;
}

/**
 * 统一将任务推进到 inspection（待检验）。
 * completeTask / 工序全完成 / 报工全完成 必须走此入口，禁止各自旁路改状态。
 *
 * @param {Object} connection - 事务连接（必须）
 * @param {number} taskId
 * @param {Object} [options]
 * @param {boolean} [options.setCompletedQuantityToPlan=false] - 工序全完成时把 completed_quantity 对齐计划量
 * @param {boolean} [options.requireOpenInspectionClear=true] - 要求首检/过程检已关闭
 * @returns {Promise<{ promoted: boolean, status: string, reason?: string }>}
 */
async function promoteTaskToInspection(connection, taskId, options = {}) {
  if (!connection) {
    throw new Error('promoteTaskToInspection 必须在事务中调用');
  }

  const {
    setCompletedQuantityToPlan = false,
    requireOpenInspectionClear = true,
  } = options;

  const [taskRows] = await connection.query(
    `SELECT id, code, status, quantity, completed_quantity, plan_id, product_id
     FROM production_tasks
     WHERE id = ? AND deleted_at IS NULL
     FOR UPDATE`,
    [taskId]
  );

  if (taskRows.length === 0) {
    throw new Error(`生产任务不存在: ${taskId}`);
  }

  const task = taskRows[0];

  if (task.status === 'inspection') {
    return { promoted: false, status: task.status, reason: 'already_inspection' };
  }

  const transition = validateTaskTransition(task.status, 'inspection');
  if (!transition.valid) {
    throw new Error(transition.message);
  }

  if (requireOpenInspectionClear) {
    const [openInspections] = await connection.query(
      `SELECT id, inspection_no, inspection_type, status
       FROM quality_inspections
       WHERE task_id = ?
         AND inspection_type IN ('first_article', 'process')
         AND deleted_at IS NULL
         AND (status IS NULL OR status NOT IN ('passed', 'completed', 'cancelled'))`,
      [taskId]
    );
    if (openInspections.length > 0) {
      const err = new Error(
        `任务 ${task.code} 仍有 ${openInspections.length} 个首检/过程检验未关闭，不能进入待检`
      );
      err.code = 'OPEN_INSPECTIONS';
      err.openInspections = openInspections;
      throw err;
    }
  }

  const planQty = Number(task.quantity) || 0;
  const sets = ['status = ?'];
  const params = ['inspection'];

  if (setCompletedQuantityToPlan && planQty > 0) {
    sets.push(
      'completed_quantity = CASE WHEN COALESCE(completed_quantity, 0) < ? THEN ? ELSE completed_quantity END'
    );
    params.push(planQty, planQty);
    sets.push('progress = 100');
  }

  params.push(taskId);
  await connection.query(
    `UPDATE production_tasks SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  if (task.plan_id) {
    await syncPlanStatus(task.plan_id, connection);
  }

  logger.info(`[任务生命周期] 任务 ${task.code}(${taskId}) ${task.status} → inspection`);
  return { promoted: true, status: 'inspection' };
}

/**
 * 在合法转移下将任务推进到 in_progress（发料完成开始生产）。
 */
async function promoteTaskToInProgress(connection, taskId) {
  if (!connection) {
    throw new Error('promoteTaskToInProgress 必须在事务中调用');
  }

  const [taskRows] = await connection.query(
    `SELECT id, code, status, plan_id
     FROM production_tasks
     WHERE id = ? AND deleted_at IS NULL
     FOR UPDATE`,
    [taskId]
  );
  if (taskRows.length === 0) {
    throw new Error(`生产任务不存在: ${taskId}`);
  }

  const task = taskRows[0];
  if (task.status === 'in_progress') {
    return { promoted: false, status: task.status, reason: 'already_in_progress' };
  }

  const transition = validateTaskTransition(task.status, 'in_progress');
  if (!transition.valid) {
    throw new Error(transition.message);
  }

  await connection.query(
    'UPDATE production_tasks SET status = ? WHERE id = ? AND deleted_at IS NULL',
    ['in_progress', taskId]
  );

  if (task.plan_id) {
    await syncPlanStatus(task.plan_id, connection);
  }

  logger.info(`[任务生命周期] 任务 ${task.code}(${taskId}) ${task.status} → in_progress`);
  return { promoted: true, status: 'in_progress' };
}

/**
 * 通用任务状态推进（发料/确认等库存侧联动入口）。
 * @param {Object} connection
 * @param {number} taskId
 * @param {string} targetStatus
 * @param {Object} [options]
 * @param {string[]} [options.onlyFrom] - 仅当当前状态在此列表时才推进（否则 no-op）
 * @returns {Promise<{promoted:boolean,status:string,reason?:string}>}
 */
async function promoteTaskStatus(connection, taskId, targetStatus, options = {}) {
  if (!connection) {
    throw new Error('promoteTaskStatus 必须在事务中调用');
  }
  if (!taskId || !targetStatus) {
    return { promoted: false, status: null, reason: 'missing_args' };
  }

  const { onlyFrom = null } = options;
  const [taskRows] = await connection.query(
    `SELECT id, code, status, plan_id
     FROM production_tasks
     WHERE id = ? AND deleted_at IS NULL
     FOR UPDATE`,
    [taskId]
  );
  if (taskRows.length === 0) {
    throw new Error(`生产任务不存在: ${taskId}`);
  }

  const task = taskRows[0];
  if (task.status === targetStatus) {
    return { promoted: false, status: task.status, reason: 'already' };
  }

  if (Array.isArray(onlyFrom) && onlyFrom.length > 0 && !onlyFrom.includes(task.status)) {
    return { promoted: false, status: task.status, reason: 'source_not_allowed' };
  }

  const transition = validateTaskTransition(task.status, targetStatus);
  if (!transition.valid) {
    // 库存联动不应因状态机拒绝而炸掉整单；记录并跳过
    logger.warn(
      `[任务生命周期] 跳过推进 ${task.code}(${taskId}): ${task.status} → ${targetStatus}: ${transition.message}`
    );
    return { promoted: false, status: task.status, reason: 'invalid_transition' };
  }

  await connection.query(
    'UPDATE production_tasks SET status = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL',
    [targetStatus, taskId]
  );

  if (task.plan_id) {
    await syncPlanStatus(task.plan_id, connection);
  }

  logger.info(
    `[任务生命周期] 任务 ${task.code}(${taskId}) ${task.status} → ${targetStatus}`
  );
  return { promoted: true, status: targetStatus };
}

/**
 * 自动多步推进子图：仅覆盖「发料完成后」的生产生命周期前进
 * 不包含 pending→material_*（发料必须由库存出库闭环推进，禁止自动跳过）
 * 每条边仍须能通过 TASK_STATE_MACHINE 校验
 */
const AUTO_PROGRESSION_GRAPH = Object.freeze({
  material_partial_issued: Object.freeze(['in_progress']),
  material_issued: Object.freeze(['in_progress']),
  in_progress: Object.freeze(['inspection']),
  paused: Object.freeze(['in_progress']),
  inspection: Object.freeze(['warehousing', 'completed']),
  warehousing: Object.freeze(['completed']),
});

/**
 * 在自动推进子图上求最短路径（BFS）
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {string[]|null} 不含起点、含终点；不可达 null
 */
function findTransitionPath(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return null;
  if (fromStatus === toStatus) return [];

  const queue = [[fromStatus, []]];
  const visited = new Set([fromStatus]);

  while (queue.length > 0) {
    const [current, path] = queue.shift();
    const candidates = AUTO_PROGRESSION_GRAPH[current] || [];
    for (const next of candidates) {
      // 子图边必须在权威状态机中合法
      const allowed = TASK_STATE_MACHINE[current] || [];
      if (!allowed.includes(next)) continue;
      if (visited.has(next)) continue;
      const nextPath = path.concat(next);
      if (next === toStatus) return nextPath;
      visited.add(next);
      queue.push([next, nextPath]);
    }
  }
  return null;
}

/**
 * 按状态机最短路径多步推进到目标状态
 * 专用副作用状态走 promoteTaskToInProgress / promoteTaskToInspection
 */
async function promoteTaskToward(connection, taskId, targetStatus, options = {}) {
  if (!connection || !taskId || !targetStatus) {
    return { promoted: false, status: null, reason: 'missing_args' };
  }

  const [taskRows] = await connection.query(
    `SELECT id, code, status FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
    [taskId]
  );
  if (taskRows.length === 0) {
    throw new Error(`生产任务不存在: ${taskId}`);
  }

  const startStatus = taskRows[0].status;
  if (startStatus === targetStatus) {
    return { promoted: false, status: startStatus, reason: 'already' };
  }

  const path = findTransitionPath(startStatus, targetStatus);
  if (!path) {
    logger.warn(
      `[任务生命周期] 不可达: ${taskRows[0].code} ${startStatus} → ${targetStatus}`
    );
    return { promoted: false, status: startStatus, reason: 'unreachable' };
  }

  const requireOpenInspectionClear =
    options.requireOpenInspectionClear !== undefined
      ? options.requireOpenInspectionClear
      : false;
  const setCompletedQuantityToPlan = !!options.setCompletedQuantityToPlan;
  const strict = options.strict !== false;

  let last = { promoted: false, status: startStatus, reason: 'no_op' };
  for (const hop of path) {
    try {
      if (hop === 'in_progress') {
        last = await promoteTaskToInProgress(connection, taskId);
      } else if (hop === 'inspection') {
        last = await promoteTaskToInspection(connection, taskId, {
          requireOpenInspectionClear,
          setCompletedQuantityToPlan,
        });
      } else {
        last = await promoteTaskStatus(connection, taskId, hop);
        if (!last.promoted && last.reason === 'invalid_transition') {
          if (strict) {
            return { ...last, reason: `failed_at_${hop}` };
          }
          break;
        }
      }
    } catch (error) {
      if (strict) {
        throw error;
      }
      last = {
        promoted: false,
        status: last.status || startStatus,
        reason: error.message,
      };
      break;
    }
  }

  return last;
}

module.exports = {
  TASK_STATE_MACHINE,
  AUTO_PROGRESSION_GRAPH,
  validateTaskTransition,
  findTransitionPath,
  syncPlanStatus,
  generateBatchNo,
  normalizeTaskBatchNo,
  promoteTaskToInspection,
  promoteTaskToInProgress,
  promoteTaskStatus,
  promoteTaskToward,
};
