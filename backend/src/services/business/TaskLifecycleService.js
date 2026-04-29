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
  pending: ['allocated', 'preparing', 'material_issuing', 'cancelled'],
  // 已分配：可开始配料或直接发料
  allocated: ['preparing', 'material_issuing', 'cancelled'],
  // 配料中：正在准备物料
  preparing: ['material_issuing', 'material_partial_issued', 'material_issued', 'cancelled'],
  // 发料中：仓库正在出库
  material_issuing: ['material_partial_issued', 'material_issued', 'preparing', 'cancelled'],
  // 部分发料：可继续发料或确认已发完
  material_partial_issued: ['material_issuing', 'material_issued', 'cancelled'],
  // 已发料：物料齐套，可开始生产
  material_issued: ['in_progress', 'cancelled'],
  // 生产中
  in_progress: ['inspection', 'completed', 'paused', 'cancelled'],
  // 暂停
  paused: ['in_progress', 'cancelled'],
  // 待检验
  inspection: ['warehousing', 'in_progress', 'cancelled'],
  // 入库中
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
    'SELECT status FROM production_plans WHERE id = ? FOR UPDATE',
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
  } else if (stats.preparing_count > 0 || stats.material_issuing_count > 0 || stats.allocated_count > 0) {
    newPlanStatus = 'preparing';
  } else if (stats.pending_count === activeTotal && activeTotal > 0) {
    newPlanStatus = 'draft';
  }

  if (newPlanStatus !== currentPlanStatus) {
    await conn.query('UPDATE production_plans SET status = ? WHERE id = ?', [
      newPlanStatus,
      planId,
    ]);
    logger.info(`[计划同步] 计划 ${planId} 状态更新: ${currentPlanStatus} → ${newPlanStatus}`);
    return { updated: true, from: currentPlanStatus, to: newPlanStatus };
  }

  return { updated: false, from: currentPlanStatus, to: currentPlanStatus };
}

// ===================== 3. 批次号生成 =====================
/**
 * 生成有业务意义的批次号
 * 格式: B-{任务编号}-{YYMMDD}-{3位序号}
 * 例如: B-PT20260428001-260428-001
 *
 * 同一任务的所有检验单、追溯记录应共用同一个批次号
 *
 * @param {string} taskCode - 任务编号（如 PT-20260428-001）
 * @param {Object} [connection] - 可选数据库连接
 * @returns {Promise<string>} 批次号
 */
async function generateBatchNo(taskCode, connection) {
  const conn = connection || pool;
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const shortCode = taskCode.replace(/[-]/g, '');

  // 查询该任务是否已有批次号
  const [existing] = await conn.query(
    "SELECT batch_no FROM quality_inspections WHERE reference_no = ? AND batch_no IS NOT NULL AND batch_no != '' ORDER BY id ASC LIMIT 1",
    [taskCode]
  );

  if (existing.length > 0 && existing[0].batch_no && !existing[0].batch_no.startsWith('BATCH')) {
    // 已有有意义的批次号，复用
    return existing[0].batch_no;
  }

  // 生成新批次号
  const [seqRows] = await conn.query(
    "SELECT COUNT(*) as cnt FROM quality_inspections WHERE batch_no LIKE ? AND reference_no = ?",
    [`B-${shortCode}-%`, taskCode]
  );
  const seq = String((seqRows[0]?.cnt || 0) + 1).padStart(3, '0');

  return `B-${shortCode}-${dateStr}-${seq}`;
}

module.exports = {
  TASK_STATE_MACHINE,
  validateTaskTransition,
  syncPlanStatus,
  generateBatchNo,
};
