/**
 * AssemblyExecutionService.js
 * @description 装配执行服务 — 工序级任务执行、状态机、进度计算
 * @date 2026-06-23
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const ProcessRouteService = require('./ProcessRouteService');

class AssemblyExecutionService {
  // ==================== 工序任务生成 ====================

  /**
   * 为生产任务生成装配工序步骤
   * @param {number} taskId - 生产任务ID
   * @returns {Object} 生成结果
   */
  static async generateSteps(taskId) {
    // 1. 获取任务信息
    const [tasks] = await pool.query(
      'SELECT id, product_id, code FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
      [taskId]
    );
    if (tasks.length === 0) throw new Error('生产任务不存在');

    const task = tasks[0];

    // 2. 检查是否已有步骤
    const [[{ existCount }]] = await pool.query(
      'SELECT COUNT(*) as existCount FROM assembly_task_steps WHERE task_id = ?',
      [taskId]
    );
    if (existCount > 0) {
      throw new Error('该任务已有装配工序，请勿重复生成');
    }

    // 3. 获取产品的活跃工序路线
    const route = await ProcessRouteService.getActiveByProduct(task.product_id);
    if (!route || !route.steps || route.steps.length === 0) {
      throw new Error('该产品没有配置工序路线，请先在工序路线管理中配置');
    }

    // 4. 生成装配步骤
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const step of route.steps) {
        await connection.query(
          `INSERT INTO assembly_task_steps
           (task_id, route_step_id, sequence, step_name, station_id, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`,
          [taskId, step.id, step.sequence, step.step_name, step.station_id || null]
        );
      }

      await connection.commit();

      logger.info(`[装配执行] 任务 ${task.code} 生成 ${route.steps.length} 道工序`);
      return {
        taskId,
        taskCode: task.code,
        routeName: route.name,
        stepCount: route.steps.length,
        totalStandardMinutes: route.total_standard_minutes,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== 工序执行 ====================

  /**
   * 获取任务的装配步骤列表
   */
  static async getTaskSteps(taskId) {
    const [steps] = await pool.query(
      `SELECT ats.id, ats.task_id, ats.route_step_id, ats.sequence, ats.step_name,
              ats.station_id, ats.operator_id, ats.status,
              ats.started_at, ats.completed_at, ats.actual_minutes, ats.remark,
              ws.code AS station_code, ws.name AS station_name,
              u.real_name AS operator_name,
              prs.standard_minutes, prs.sop_content, prs.sop_images, prs.description AS step_description
       FROM assembly_task_steps ats
       LEFT JOIN work_stations ws ON ats.station_id = ws.id
       LEFT JOIN users u ON ats.operator_id = u.id
       LEFT JOIN process_route_steps prs ON ats.route_step_id = prs.id
       WHERE ats.task_id = ?
       ORDER BY ats.sequence ASC`,
      [taskId]
    );

    // 获取每步骤的所需物料
    for (const step of steps) {
      const [materials] = await pool.query(
        `SELECT psm.material_id, psm.quantity, psm.is_scan_required,
                m.code AS material_code, m.name AS material_name
         FROM process_step_materials psm
         JOIN materials m ON psm.material_id = m.id
         WHERE psm.step_id = ?`,
        [step.route_step_id]
      );
      step.materials = materials;
    }

    // 计算进度
    const total = steps.length;
    const completed = steps.filter(s => s.status === 'completed').length;
    const inProgress = steps.filter(s => s.status === 'in_progress').length;

    return {
      steps,
      progress: {
        total,
        completed,
        inProgress,
        pending: total - completed - inProgress,
        percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
    };
  }

  /**
   * 开始工序 (pending → in_progress)
   * @param {number} stepId - assembly_task_steps.id
   * @param {number} operatorId - 操作人ID
   * @param {number} stationId - 工位ID(可选)
   */
  static async startStep(stepId, operatorId, stationId = null) {
    // 获取当前步骤
    const [steps] = await pool.query(
      'SELECT id, task_id, sequence, status FROM assembly_task_steps WHERE id = ?',
      [stepId]
    );
    if (steps.length === 0) throw new Error('工序步骤不存在');

    const step = steps[0];
    if (step.status !== 'pending') {
      throw new Error(`当前状态为 ${step.status}，仅 pending 状态可开始`);
    }

    // 检查前置工序是否都已完成
    const [[{ prevIncomplete }]] = await pool.query(
      `SELECT COUNT(*) as prevIncomplete FROM assembly_task_steps
       WHERE task_id = ? AND sequence < ? AND status NOT IN ('completed', 'skipped')`,
      [step.task_id, step.sequence]
    );
    if (prevIncomplete > 0) {
      throw new Error('前置工序尚未完成，请按顺序执行');
    }

    const updateFields = {
      status: 'in_progress',
      operator_id: operatorId,
      started_at: new Date(),
    };
    if (stationId) updateFields.station_id = stationId;

    await pool.query(
      `UPDATE assembly_task_steps SET status = ?, operator_id = ?, started_at = ?,
       station_id = COALESCE(?, station_id) WHERE id = ?`,
      [updateFields.status, updateFields.operator_id, updateFields.started_at,
       stationId, stepId]
    );

    logger.info(`[装配执行] 工序开始: stepId=${stepId}, operator=${operatorId}`);
    return this.getStepDetail(stepId);
  }

  /**
   * 完成工序 (in_progress → completed)
   * 全部装配工序完成后：与主过程闭环对齐 — 推进任务待检 + 自动建终检（能推则推）
   */
  static async completeStep(stepId, data = {}) {
    const { remark } = data;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [steps] = await connection.query(
        'SELECT id, task_id, sequence, status, started_at FROM assembly_task_steps WHERE id = ? FOR UPDATE',
        [stepId]
      );
      if (steps.length === 0) throw new Error('工序步骤不存在');

      const step = steps[0];
      if (step.status !== 'in_progress') {
        throw new Error(`当前状态为 ${step.status}，仅 in_progress 状态可完成`);
      }

      const now = new Date();
      const startedAt = new Date(step.started_at);
      const actualMinutes = Math.round(((now - startedAt) / 60000) * 100) / 100;

      await connection.query(
        `UPDATE assembly_task_steps
         SET status = 'completed', completed_at = ?, actual_minutes = ?, remark = COALESCE(?, remark)
         WHERE id = ?`,
        [now, actualMinutes, remark, stepId]
      );

      const [[{ totalSteps, completedSteps, remaining }]] = await connection.query(
        `SELECT COUNT(*) as totalSteps,
                SUM(CASE WHEN status IN ('completed', 'skipped') THEN 1 ELSE 0 END) as completedSteps,
                SUM(CASE WHEN status NOT IN ('completed', 'skipped') THEN 1 ELSE 0 END) as remaining
         FROM assembly_task_steps WHERE task_id = ?`,
        [step.task_id]
      );

      const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
      // 全部完成时进度由主链待检/完工接管；未全完成封顶 99
      const progressToWrite = remaining === 0 ? 100 : Math.min(progressPercent, 99);
      await connection.query(
        'UPDATE production_tasks SET progress = ? WHERE id = ? AND deleted_at IS NULL',
        [progressToWrite, step.task_id]
      );

      const allDone = Number(remaining) === 0;
      let mainChainPromoted = false;
      let finalInspectionCreated = false;

      if (allDone) {
        logger.info(`[装配执行] 任务 ${step.task_id} 全部工序完成，对齐主链待检闭环`);
        const result = await this._promoteTaskOnAssemblyComplete(connection, step.task_id);
        mainChainPromoted = result.promoted;
        finalInspectionCreated = result.finalInspectionCreated;
      }

      await connection.commit();

      if (allDone) {
        try {
          const EventBus = require('../../events/EventBus');
          EventBus.emit('ASSEMBLY_ALL_STEPS_COMPLETED', {
            taskId: step.task_id,
            totalSteps,
            totalActualMinutes: await this._getTotalActualMinutes(step.task_id),
            completedAt: now,
            mainChainPromoted,
            finalInspectionCreated,
          });
        } catch (e) {
          logger.warn('[装配执行] 发送 ASSEMBLY_ALL_STEPS_COMPLETED 事件失败:', e.message);
        }
      }

      return {
        step: await this.getStepDetail(stepId),
        actualMinutes,
        progressPercent: progressToWrite,
        allStepsCompleted: allDone,
        taskId: step.task_id,
        mainChainPromoted,
        finalInspectionCreated,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 装配全完成 → 主链待检 + 终检（与工序全完成共用 FinalInspectionService / 状态机路径）
   * 未发料任务在自动推进子图中不可达 inspection，返回 promoted=false
   */
  static async _promoteTaskOnAssemblyComplete(connection, taskId) {
    const { promoteTaskToward } = require('./TaskLifecycleService');
    const FinalInspectionService = require('./FinalInspectionService');

    const [tasks] = await connection.query(
      `SELECT id, code, status FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [taskId]
    );
    if (tasks.length === 0) {
      return { promoted: false, finalInspectionCreated: false };
    }
    const task = tasks[0];

    let promoteResult;
    try {
      promoteResult = await promoteTaskToward(connection, taskId, 'inspection', {
        requireOpenInspectionClear: true,
        setCompletedQuantityToPlan: true,
        strict: true,
      });
    } catch (promoteErr) {
      logger.warn(`[装配执行] 任务 ${task.code} 推进待检失败: ${promoteErr.message}`);
      return { promoted: false, finalInspectionCreated: false };
    }

    if (
      !promoteResult.promoted &&
      promoteResult.reason !== 'already' &&
      promoteResult.status !== 'inspection'
    ) {
      logger.warn(
        `[装配执行] 任务 ${task.code} 状态 ${task.status} 无法进入待检: ${promoteResult.reason}`
      );
      return { promoted: false, finalInspectionCreated: false };
    }

    const promoted =
      !!promoteResult.promoted ||
      promoteResult.reason === 'already' ||
      promoteResult.status === 'inspection';

    let finalInspectionCreated = false;
    try {
      const ensure = await FinalInspectionService.ensureForTask(connection, taskId, {
        note: '装配工序全部完成后自动创建',
      });
      finalInspectionCreated = !!ensure.created;
      if (finalInspectionCreated) {
        logger.info(`[装配执行] 任务 ${task.code} 已自动创建终检单`);
      }
    } catch (inspErr) {
      logger.warn(`[装配执行] 任务 ${task.code} 创建终检失败: ${inspErr.message}`);
    }

    return { promoted, finalInspectionCreated };
  }

  /**
   * 获取任务的总实际工时
   */
  static async _getTotalActualMinutes(taskId) {
    const [[{ total }]] = await pool.query(
      'SELECT COALESCE(SUM(actual_minutes), 0) as total FROM assembly_task_steps WHERE task_id = ? AND status = \'completed\'',
      [taskId]
    );
    return total;
  }

  /**
   * 跳过工序 (pending → skipped)
   */
  static async skipStep(stepId, reason) {
    // 先获取 task_id
    const [rows] = await pool.query(
      'SELECT id, task_id, status FROM assembly_task_steps WHERE id = ?',
      [stepId]
    );
    if (rows.length === 0) throw new Error('工序步骤不存在');
    if (rows[0].status !== 'pending') {
      throw new Error('仅 pending 状态的工序可以跳过');
    }

    await pool.query(
      `UPDATE assembly_task_steps SET status = 'skipped', remark = ? WHERE id = ?`,
      [reason || '跳过', stepId]
    );

    const taskId = rows[0].task_id;

    // 同步进度（跳过也算"处理完成"）
    const [[{ totalSteps, completedSteps, remaining }]] = await pool.query(
      `SELECT COUNT(*) as totalSteps,
              SUM(CASE WHEN status IN ('completed', 'skipped') THEN 1 ELSE 0 END) as completedSteps,
              SUM(CASE WHEN status NOT IN ('completed', 'skipped') THEN 1 ELSE 0 END) as remaining
       FROM assembly_task_steps WHERE task_id = ?`,
      [taskId]
    );

    const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    await pool.query(
      'UPDATE production_tasks SET progress = ? WHERE id = ? AND deleted_at IS NULL',
      [Math.min(progressPercent, 99), taskId]
    );

    // 如果全部完成/跳过，也触发事件
    if (remaining === 0) {
      logger.info(`[装配执行] 任务 ${taskId} 全部工序完成（含跳过），触发通知`);
      try {
        const EventBus = require('../../events/EventBus');
        EventBus.emit('ASSEMBLY_ALL_STEPS_COMPLETED', {
          taskId,
          totalSteps,
          totalActualMinutes: await this._getTotalActualMinutes(taskId),
          completedAt: new Date(),
        });
      } catch (e) {
        logger.warn('[装配执行] 发送事件失败:', e.message);
      }
    }

    return this.getStepDetail(stepId);
  }

  /**
   * 获取单个步骤详情
   */
  static async getStepDetail(stepId) {
    const [rows] = await pool.query(
      `SELECT ats.*, ws.code AS station_code, ws.name AS station_name,
              u.real_name AS operator_name,
              prs.standard_minutes, prs.sop_content, prs.sop_images,
              prs.description AS step_description
       FROM assembly_task_steps ats
       LEFT JOIN work_stations ws ON ats.station_id = ws.id
       LEFT JOIN users u ON ats.operator_id = u.id
       LEFT JOIN process_route_steps prs ON ats.route_step_id = prs.id
       WHERE ats.id = ?`,
      [stepId]
    );
    if (rows.length === 0) return null;

    const step = rows[0];

    // 获取物料
    const [materials] = await pool.query(
      `SELECT psm.material_id, psm.quantity, psm.is_scan_required,
              m.code AS material_code, m.name AS material_name
       FROM process_step_materials psm
       JOIN materials m ON psm.material_id = m.id
       WHERE psm.step_id = ?`,
      [step.route_step_id]
    );
    step.materials = materials;

    return step;
  }

  // ==================== 看板数据 ====================

  /**
   * 获取装配看板数据 (所有工位实时状态 + 任务进度)
   */
  static async getBoardData() {
    // 获取所有活跃工位及其当前任务
    const [stations] = await pool.query(
      `SELECT ws.id, ws.code, ws.name, ws.line_code, ws.line_name, ws.station_type,
              ats.task_id, ats.step_name AS current_step,
              ats.operator_id, u.real_name AS operator_name,
              ats.started_at,
              pt.code AS task_code,
              m.name AS product_name,
              CASE WHEN ats.id IS NOT NULL THEN 'busy' ELSE 'idle' END AS status
       FROM work_stations ws
       LEFT JOIN assembly_task_steps ats ON ws.id = ats.station_id AND ats.status = 'in_progress'
       LEFT JOIN production_tasks pt ON ats.task_id = pt.id
       LEFT JOIN materials m ON pt.product_id = m.id
       LEFT JOIN users u ON ats.operator_id = u.id
       WHERE ws.is_active = 1
       ORDER BY ws.line_code, ws.sort_order`
    );

    // 获取当前所有进行中的任务进度
    const [taskProgress] = await pool.query(
      `SELECT ats.task_id, pt.code AS task_code, m.name AS product_name,
              COUNT(*) AS total_steps,
              SUM(CASE WHEN ats.status = 'completed' THEN 1 ELSE 0 END) AS completed_steps,
              SUM(CASE WHEN ats.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_steps,
              ROUND(SUM(CASE WHEN ats.status = 'completed' THEN 1 ELSE 0 END) / COUNT(*) * 100) AS progress_percent
       FROM assembly_task_steps ats
       JOIN production_tasks pt ON ats.task_id = pt.id
       LEFT JOIN materials m ON pt.product_id = m.id
       WHERE pt.status IN ('in_progress', 'material_issued', 'material_partial_issued')
         AND pt.deleted_at IS NULL
       GROUP BY ats.task_id, pt.code, m.name
       ORDER BY progress_percent DESC`
    );

    return { stations, taskProgress };
  }
}

module.exports = AssemblyExecutionService;
