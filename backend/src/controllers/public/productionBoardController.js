/**
 * productionBoardController.js
 * @description 生产流程可视化看板控制器（公开访问，无需认证）
 * @date 2025-10-30
 * @version 1.0.0
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const { ResponseHandler } = require('../../utils/responseHandler');

/**
 * 获取生产流程看板数据
 */
exports.getProductionBoardData = async (req, res) => {
  try {
    // 获取最近计划的显示条数，默认12条，最大30条
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 30);

    // 1. 获取各状态的计划数量
    const [planStats] = await pool.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM production_plans
      GROUP BY status
    `);

    // 2. 获取各状态的任务数量
    const [taskStats] = await pool.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM production_tasks
      GROUP BY status
    `);

    // 3. 获取今日生产统计
    const [todayStats] = await pool.query(`
      SELECT
        COUNT(DISTINCT pp.id) as plans_count,
        COUNT(DISTINCT pt.id) as tasks_count,
        SUM(CASE WHEN pp.status = 'completed' THEN 1 ELSE 0 END) as completed_plans,
        SUM(CASE WHEN pt.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
      FROM production_plans pp
      LEFT JOIN production_tasks pt ON pp.id = pt.plan_id
      WHERE DATE(pp.created_at) = CURDATE()
    `);

    // 4. 获取最近的生产计划（动态条数）
    const [recentPlans] = await pool.query(
      `
      SELECT
        pp.id,
        pp.code,
        pp.name,
        pp.status,
        pp.quantity,
        DATE_FORMAT(pp.start_date, '%Y-%m-%d') as start_date,
        DATE_FORMAT(pp.end_date, '%Y-%m-%d') as end_date,
        m.code as product_code,
        m.name as product_name,
        u.name as unit,
        (SELECT COUNT(*) FROM production_tasks WHERE plan_id = pp.id) as task_count,
        (SELECT COUNT(*) FROM production_tasks WHERE plan_id = pp.id AND status = 'completed') as completed_task_count
      FROM production_plans pp
      LEFT JOIN materials m ON pp.product_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      ORDER BY pp.created_at DESC
      LIMIT ${limit}
    `
    );

    // 5. 获取工序完成率统计
    const [processStats] = await pool.query(`
      SELECT
        COUNT(*) as total_processes,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_processes,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_processes,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_processes,
        SUM(CASE WHEN status = 'warehousing' THEN 1 ELSE 0 END) as warehousing_processes
      FROM production_processes
    `);

    // 6. 获取检验统计
    const [inspectionStats] = await pool.query(`
      SELECT
        COUNT(*) as total_inspections,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed_inspections,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_inspections,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_inspections
      FROM quality_inspections
      WHERE inspection_type = 'final'
    `);

    // 7. 获取入库统计（通过检验单关联判断是生产入库）
    const [inboundStats] = await pool.query(`
      SELECT
        COUNT(*) as total_inbounds,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_inbounds,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_inbounds,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_inbounds
      FROM inventory_inbound
      WHERE inspection_id IS NOT NULL
    `);

    // 格式化计划状态统计
    const planStatusMap = {
      draft: 0,
      allocated: 0,
      material_issuing: 0,
      preparing: 0,
      material_issued: 0,
      in_progress: 0,
      inspection: 0,
      warehousing: 0,
      completed: 0,
    };

    planStats.forEach((stat) => {
      if (planStatusMap.hasOwnProperty(stat.status)) {
        planStatusMap[stat.status] = Number(stat.count);
      }
    });

    // 格式化任务状态统计
    const taskStatusMap = {
      pending: 0,
      draft: 0,
      allocated: 0,
      material_issuing: 0,
      preparing: 0,
      material_partial_issued: 0,
      material_issued: 0,
      in_progress: 0,
      inspection: 0,
      warehousing: 0,
      completed: 0,
      cancelled: 0,
    };

    taskStats.forEach((stat) => {
      taskStatusMap[stat.status] = Number(stat.count);
    });

    // 计算完成率
    const totalPlans = Object.values(planStatusMap).reduce((a, b) => a + b, 0);
    const totalTasks = Object.values(taskStatusMap).reduce((a, b) => a + b, 0);
    const planCompletionRate =
      totalPlans > 0 ? ((planStatusMap.completed / totalPlans) * 100).toFixed(2) : 0;
    const taskCompletionRate =
      totalTasks > 0 ? ((taskStatusMap.completed / totalTasks) * 100).toFixed(2) : 0;

    // 计算工序完成率
    const processData = processStats[0] || {
      total_processes: 0,
      completed_processes: 0,
      in_progress_processes: 0,
      pending_processes: 0,
    };
    const processCompletionRate =
      processData.total_processes > 0
        ? ((processData.completed_processes / processData.total_processes) * 100).toFixed(2)
        : 0;

    // 计算检验合格率
    const inspectionData = inspectionStats[0] || {
      total_inspections: 0,
      passed_inspections: 0,
      failed_inspections: 0,
      pending_inspections: 0,
    };
    const inspectionPassRate =
      inspectionData.total_inspections > 0
        ? ((inspectionData.passed_inspections / inspectionData.total_inspections) * 100).toFixed(2)
        : 0;

    // 计算入库完成率
    const inboundData = inboundStats[0] || {
      total_inbounds: 0,
      completed_inbounds: 0,
      confirmed_inbounds: 0,
      draft_inbounds: 0,
    };
    const inboundCompletionRate =
      inboundData.total_inbounds > 0
        ? ((inboundData.completed_inbounds / inboundData.total_inbounds) * 100).toFixed(2)
        : 0;

    // 返回数据
    ResponseHandler.success(res, {
      // 流程步骤统计
      flowStats: {
        plans: planStatusMap,
        tasks: taskStatusMap,
        totalPlans,
        totalTasks,
        planCompletionRate: Number(planCompletionRate),
        taskCompletionRate: Number(taskCompletionRate),
      },
      // 今日统计
      todayStats: {
        plansCount: Number(todayStats[0]?.plans_count || 0),
        tasksCount: Number(todayStats[0]?.tasks_count || 0),
        completedPlans: Number(todayStats[0]?.completed_plans || 0),
        completedTasks: Number(todayStats[0]?.completed_tasks || 0),
      },
      // 工序统计
      processStats: {
        total: Number(processData.total_processes),
        completed: Number(processData.completed_processes),
        inProgress: Number(processData.in_progress_processes),
        pending: Number(processData.pending_processes),
        completionRate: Number(processCompletionRate),
      },
      // 检验统计
      inspectionStats: {
        total: Number(inspectionData.total_inspections),
        passed: Number(inspectionData.passed_inspections),
        failed: Number(inspectionData.failed_inspections),
        pending: Number(inspectionData.pending_inspections),
        passRate: Number(inspectionPassRate),
      },
      // 入库统计
      inboundStats: {
        total: Number(inboundData.total_inbounds),
        completed: Number(inboundData.completed_inbounds),
        confirmed: Number(inboundData.confirmed_inbounds),
        draft: Number(inboundData.draft_inbounds),
        completionRate: Number(inboundCompletionRate),
      },
      // 最近的生产计划
      recentPlans: recentPlans.map((plan) => ({
        ...plan,
        task_count: Number(plan.task_count),
        completed_task_count: Number(plan.completed_task_count),
        taskCompletionRate:
          plan.task_count > 0
            ? ((plan.completed_task_count / plan.task_count) * 100).toFixed(2)
            : 0,
      })),
      // 更新时间
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('获取生产流程看板数据失败:', error);
    ResponseHandler.error(res, '获取生产流程看板数据失败');
  }
};

/**
 * 获取生产流程实时统计（简化版，用于轮询更新）
 */
exports.getProductionBoardStats = async (req, res) => {
  try {
    // 获取各状态的计划和任务数量
    const [stats] = await pool.query(`
      SELECT
        'plans' as type,
        status,
        COUNT(*) as count
      FROM production_plans
      GROUP BY status

      UNION ALL

      SELECT
        'tasks' as type,
        status,
        COUNT(*) as count
      FROM production_tasks
      GROUP BY status
    `);

    const planStats = {};
    const taskStats = {};

    stats.forEach((stat) => {
      if (stat.type === 'plans') {
        planStats[stat.status] = Number(stat.count);
      } else {
        taskStats[stat.status] = Number(stat.count);
      }
    });

    ResponseHandler.success(res, {
      plans: planStats,
      tasks: taskStats,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('获取生产流程实时统计失败:', error);
    ResponseHandler.error(res, '获取生产流程实时统计失败');
  }
};
