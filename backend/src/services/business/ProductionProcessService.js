/**
 * ProductionProcessService.js
 * @description 生产过程服务
 * @date 2025-11-07
 * @version 1.0.0
 */

const { logger } = require('../../utils/logger');

/**
 * 创建默认生产过程记录
 * @param {Connection} connection - 数据库连接（事务连接）
 * @param {number} taskId - 任务ID
 * @param {string} remarks - 备注
 * @returns {Promise<number|null>} 创建的生产过程ID，如果已存在则返回null
 */
async function createDefaultProductionProcess(connection, taskId, remarks = '自动创建') {
  try {
    // 获取任务详情
    const [taskDetails] = await connection.execute(
      'SELECT id, code, product_id, quantity FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
      [taskId]
    );

    if (taskDetails.length === 0) {
      logger.warn(`[生产过程] 任务 ${taskId} 不存在`);
      return null;
    }

    const task = taskDetails[0];
    logger.debug(`[生产过程] 任务详情 - ID: ${task.id}, 代码: ${task.code}, 数量: ${task.quantity}`);

    // 检查是否已存在生产过程记录
    const [existingProcesses] = await connection.execute(
      'SELECT id, process_name, remarks, created_at FROM production_processes WHERE task_id = ?',
      [task.id]
    );

    logger.debug(
      `[生产过程] 检查结果 - 任务${task.id}现有生产过程数量: ${existingProcesses.length}`
    );

    if (existingProcesses.length > 0) {
      logger.debug(`[生产过程] 任务 ${task.id} 已存在生产过程记录，跳过创建`);
      logger.debug('[生产过程] 已存在的记录:', JSON.stringify(existingProcesses, null, 2));
      return existingProcesses[0].id;
    }

    // 创建默认生产过程
    logger.debug(
      `[生产过程] 准备插入 - 任务ID: ${task.id}, 数量: ${task.quantity}, 备注: ${remarks}`
    );

    const [insertResult] = await connection.execute(
      `
      INSERT INTO production_processes
      (task_id, process_name, sequence, quantity, progress, status, description, remarks)
      VALUES (?, ?, 1, ?, 0, 'pending', ?, ?)
    `,
      [task.id, '生产加工', task.quantity, '默认生产过程', remarks]
    );

    logger.debug(`[生产过程] 创建成功 - 任务${task.id}, 生产过程ID: ${insertResult.insertId}`);
    return insertResult.insertId;
  } catch (error) {
    logger.error(`[生产过程] 创建失败 - 任务${taskId}:`, error);
    throw error;
  }
}

/**
 * 为生产任务创建生产过程记录（如果需要）
 * @param {Connection} connection - 数据库连接（事务连接）
 * @param {number} taskId - 任务ID
 * @param {string} taskStatus - 任务状态
 * @param {string} remarks - 备注
 * @returns {Promise<number|null>} 创建的生产过程ID，如果不需要创建则返回null
 */
async function createProductionProcessIfNeeded(
  connection,
  taskId,
  taskStatus,
  remarks = '自动创建'
) {
  // 只有在已发料或部分发料状态时才创建生产过程
  if (taskStatus !== 'material_issued' && taskStatus !== 'material_partial_issued') {
    logger.debug(`[生产过程] 任务 ${taskId} 状态为 ${taskStatus}，不需要创建生产过程`);
    return null;
  }

  const statusDesc = taskStatus === 'material_issued' ? '已发料' : '部分发料';
  logger.debug(`[生产过程] 任务 ${taskId} 状态为 ${statusDesc}，准备创建生产过程记录`);

  return await createDefaultProductionProcess(connection, taskId, remarks);
}

module.exports = {
  createDefaultProductionProcess,
  createProductionProcessIfNeeded,
};
