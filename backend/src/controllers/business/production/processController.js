/**
 * processController.js
 * @description 鐢熶骇宸ュ簭鎺у埗鍣?
 * @date 2025-10-16
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { pool } = require('../../../config/db');
const { handleError } = require('./shared/errorHandler');
const businessConfig = require('../../../config/businessConfig');
const { apiStatusToDbStatus } = require('../../../utils/statusMapper');
const { PRODUCTION_STATUS_KEYS } = require('../../../constants/systemConstants');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { parsePagination } = require('../../../utils/paginationHelper');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const { generateBatchNo, syncPlanStatus } = require('../../../services/business/TaskLifecycleService');
const QualityInspection = require('../../../models/qualityInspection');
const BusinessError = require('../../../utils/BusinessError');

// 鐘舵€佸父閲忥紙缁熶竴寮曠敤 businessConfig锛屾秷闄ょ‖缂栫爜锛?
const TASK_STATUS = businessConfig.status.productionTask;
const PROC_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const PROCESS_STATE_MACHINE = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

function validateProcessTransition(currentStatus, targetStatus) {
  if (currentStatus === targetStatus) {
    return { valid: true, message: '' };
  }

  const allowed = PROCESS_STATE_MACHINE[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    return {
      valid: false,
      message: `宸ュ簭鐘舵€佷笉鍏佽浠?[${currentStatus}] 杞负 [${targetStatus}]`,
    };
  }

  return { valid: true, message: '' };
}

/**
 * 鑾峰彇鐢熶骇宸ュ簭鍒楄〃
 */
exports.getProcesses = async (req, res) => {
  try {
    const { taskId, status, page = 1, pageSize = 10 } = req.query;
    const { safePage, safePageSize, safeOffset } = parsePagination(page, pageSize);

    const conditions = [];
    const params = [];

    if (taskId) {
      conditions.push('pp.task_id = ?');
      params.push(taskId);
    }

    if (status) {
      conditions.push('pp.status = ?');
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [total] = await pool.query(
      `SELECT COUNT(*) as count FROM production_processes pp ${whereClause}`,
      params
    );

    const query = `
      SELECT pp.*, pt.code as task_code, pt.product_id, m.name as product_name
      FROM production_processes pp
      LEFT JOIN production_tasks pt ON pp.task_id = pt.id
      LEFT JOIN materials m ON pt.product_id = m.id
      ${whereClause}
      ORDER BY pp.task_id, pp.sequence
      LIMIT ${safePageSize} OFFSET ${safeOffset}
    `;

    const [processes] = await pool.query(query, params);

    return ResponseHandler.success(res, {
      items: processes,
      total: total[0].count,
      page: safePage,
      pageSize: safePageSize,
    });
  } catch (error) {
    logger.error('鑾峰彇鐢熶骇宸ュ簭鍒楄〃澶辫触:', error);
    handleError(res, error);
  }
};

/**
 * 鑾峰彇宸ュ簭璇︽儏
 */
exports.getProcessById = async (req, res) => {
  try {
    const { id } = req.params;

    const [processes] = await pool.query(
      `
      SELECT pp.*, pt.code as task_code, pt.product_id, m.name as product_name
      FROM production_processes pp
      LEFT JOIN production_tasks pt ON pp.task_id = pt.id
      LEFT JOIN materials m ON pt.product_id = m.id
      WHERE pp.id = ?
    `,
      [id]
    );

    if (processes.length === 0) {
      return ResponseHandler.error(res, 'Production process not found', 'NOT_FOUND', 404);
    }

    return ResponseHandler.success(res, processes[0]);
  } catch (error) {
    logger.error('鑾峰彇宸ュ簭璇︽儏澶辫触:', error);
    handleError(res, error);
  }
};

/**
 * 鍒涘缓鐢熶骇宸ュ簭
 */
exports.createProcess = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { task_id, process_name, sequence, quantity, description, remarks } = req.body;

    const [taskCheck] = await connection.query('SELECT id, status FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [
      task_id,
    ]);

    if (taskCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, 'Production task not found', 'NOT_FOUND', 404);
    }

    if ([TASK_STATUS.INSPECTION, TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED].includes(taskCheck[0].status)) {
      await connection.rollback();
      return ResponseHandler.error(res, 'Production task status does not allow process creation', 'INVALID_STATUS', 400);
    }

    const [result] = await connection.query(
      `
      INSERT INTO production_processes
      (task_id, process_name, sequence, quantity, progress, status, description, remarks)
      VALUES (?, ?, ?, ?, 0, 'pending', ?, ?)
    `,
      [task_id, process_name, sequence || 1, quantity, description || '', remarks || '']
    );

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        id: result.insertId,
        message: '鐢熶骇宸ュ簭鍒涘缓鎴愬姛',
      },
      '鍒涘缓鎴愬姛',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('鍒涘缓鐢熶骇宸ュ簭澶辫触:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 鏇存柊鐢熶骇宸ュ簭
 */
exports.updateProcess = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      process_name,
      sequence,
      quantity,
      progress,
      status,
      description,
      remarks,
      actual_start_date,
      actual_end_date,
      actual_start_time, // 鏀寔澶氱鍛藉悕
      actual_end_time,
      actualStartTime, // 鍓嶇甯哥敤鍛藉悕
      actualEndTime,
    } = req.body;

    // 鍙傛暟褰掍竴鍖栵細鍏煎鍓嶇澶氱鍛藉悕锛坅ctualStartTime / actual_start_time / actual_start_date锛?
    const startTimeResult = actualStartTime !== undefined ? actualStartTime : (actual_start_time !== undefined ? actual_start_time : actual_start_date);
    const endTimeResult = actualEndTime !== undefined ? actualEndTime : (actual_end_time !== undefined ? actual_end_time : actual_end_date);

    const [processCheck] = await connection.query(
      `SELECT pp.id, pp.task_id, pp.status,
              pt.status as task_status,
              pt.plan_id,
              pt.code as task_code
       FROM production_processes pp
       JOIN production_tasks pt ON pp.task_id = pt.id AND pt.deleted_at IS NULL
       WHERE pp.id = ?
       FOR UPDATE`,
      [id]
    );

    if (processCheck.length === 0) {
      await connection.rollback();
      await connection.rollback();
      return ResponseHandler.error(res, 'Production process not found', 'NOT_FOUND', 404);
    }

    const processRow = processCheck[0];
    const taskId = processRow.task_id;
    const planId = processRow.plan_id;

    if (status !== undefined) {
      const validProcessStatuses = Object.values(PROC_STATUS);
      if (!validProcessStatuses.includes(status)) {
        await connection.rollback();
        return ResponseHandler.error(res, `鏃犳晥鐨勫伐搴忕姸鎬? ${status}`, 'VALIDATION_ERROR', 400);
      }

      const transitionCheck = validateProcessTransition(processRow.status, status);
      if (!transitionCheck.valid) {
        await connection.rollback();
        return ResponseHandler.error(res, transitionCheck.message, 'INVALID_TRANSITION', 400);
      }

      const startableTaskStatuses = new Set([
        TASK_STATUS.MATERIAL_ISSUED,
        TASK_STATUS.MATERIAL_PARTIAL_ISSUED,
        TASK_STATUS.IN_PROGRESS,
      ]);

      if (status === PROC_STATUS.IN_PROGRESS && !startableTaskStatuses.has(processRow.task_status)) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `Task ${processRow.task_code || taskId} is not ready to start process`,
          'INVALID_STATUS',
          400
        );
      }

      if (status === PROC_STATUS.COMPLETED && processRow.task_status !== TASK_STATUS.IN_PROGRESS) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `Task ${processRow.task_code || taskId} is not in production`,
          'INVALID_STATUS',
          400
        );
      }
    }

    // 鍔ㄦ€佹瀯寤烘洿鏂拌鍙ワ紝鍙洿鏂颁紶鍏ョ殑瀛楁
    const updateFields = [];
    const updateParams = [];

    if (process_name !== undefined) {
      updateFields.push('process_name = ?');
      updateParams.push(process_name);
    }
    if (sequence !== undefined) {
      updateFields.push('sequence = ?');
      updateParams.push(sequence);
    }
    if (quantity !== undefined) {
      updateFields.push('quantity = ?');
      updateParams.push(quantity);
    }
    if (progress !== undefined) {
      updateFields.push('progress = ?');
      updateParams.push(progress);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateParams.push(status);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateParams.push(description);
    }
    if (remarks !== undefined) {
      updateFields.push('remarks = ?');
      updateParams.push(remarks);
    }
    // 灏嗘椂闂村瓧娈靛悎骞跺埌鍚屼竴涓?UPDATE 璇彞涓紙閬垮厤鍙?UPDATE锛?
    if (startTimeResult !== undefined) {
      updateFields.push('actual_start_time = ?');
      updateParams.push(startTimeResult || null);
    }
    if (endTimeResult !== undefined) {
      updateFields.push('actual_end_time = ?');
      updateParams.push(endTimeResult || null);
    }

    if (updateFields.length > 0) {
      updateParams.push(id);
      await connection.query(
        `UPDATE production_processes SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );
    }

    // 宸ュ簭寮€濮嬫垨杩涜涓椂锛屾洿鏂扮敓浜т换鍔″拰璁″垝鐘舵€佷负"鐢熶骇涓?
    if (status === PROC_STATUS.IN_PROGRESS) {
      await connection.query(
        'UPDATE production_tasks SET status = "in_progress" WHERE id = ? AND status IN ("material_issued", "material_partial_issued")',
        [taskId]
      );

      if (planId) {
        await syncPlanStatus(planId, connection);
      }
    }

    let shouldTriggerCostAccounting = false;

    // 宸ュ簭瀹屾垚鏃舵鏌ユ槸鍚︽墍鏈夊伐搴忛兘宸插畬鎴?
    if (status === PROC_STATUS.COMPLETED) {
      // 缁熻璇ヤ换鍔′笅鐨勬墍鏈夊伐搴忕姸鎬?
      const [allProcesses] = await connection.query(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.CANCELLED}' THEN 1 ELSE 0 END) as cancelled
        FROM production_processes
        WHERE task_id = ?
      `,
        [taskId]
      );

      const { total, completed, cancelled } = allProcesses[0];
      const activeProcessesCompleted = completed === total - cancelled;

      // 鎵€鏈夋湁鏁堝伐搴忥紙闈炲彇娑堬級閮藉畬鎴愭椂锛岃嚜鍔ㄥ皢浠诲姟鐘舵€佹洿鏂颁负寰呮楠?
      if (activeProcessesCompleted && total > 0) {
        const [openInspections] = await connection.query(
          `SELECT id, inspection_no, inspection_type, status
           FROM quality_inspections
           WHERE task_id = ?
             AND inspection_type IN ('first_article', 'process')
             AND (status IS NULL OR status NOT IN ('passed', 'completed', 'cancelled'))`,
          [taskId]
        );
        if (openInspections.length > 0) {
          throw new BusinessError(
            `Task ${taskId} has ${openInspections.length} open first-article/process inspections`,
            { route: `/quality/process?taskId=${taskId}`, buttonText: 'Open inspections' }
          );
        }

        // 灏咥PI鐘舵€佽浆鎹负鏁版嵁搴揈NUM鐘舵€?
        const dbStatus = apiStatusToDbStatus(TASK_STATUS.INSPECTION, 'productionTask');

        // 鏇存柊浠诲姟鐘舵€佷负寰呮楠?
        await connection.query(
          'UPDATE production_tasks SET status = ?, progress = 100 WHERE id = ?',
          [dbStatus, taskId]
        );

        logger.info(
          `Task ${taskId} processes completed (${completed}/${total}); status updated to ${dbStatus}`
        );

        // 鑷姩鍒涘缓妫€楠屽崟
        try {
          // 鑾峰彇浠诲姟璇︾粏淇℃伅
          const [taskDetail] = await connection.query(
            'SELECT id, code, product_id, quantity FROM production_tasks WHERE id = ?',
            [taskId]
          );

          if (taskDetail.length > 0) {
            const task = taskDetail[0];

            // 妫€鏌ユ槸鍚﹀凡缁忓瓨鍦ㄦ楠屽崟
            const [existingInspection] = await connection.query(
              'SELECT id FROM quality_inspections WHERE inspection_type = ? AND reference_id = ?',
              ['final', taskId]
            );

            // 濡傛灉涓嶅瓨鍦ㄦ楠屽崟锛屽垯鍒涘缓
            if (existingInspection.length === 0) {


              await QualityInspection.createInspection({
                inspection_type: 'final',
                reference_id: taskId,
                reference_no: task.code,
                product_id: task.product_id,
                batch_no: await generateBatchNo(task.code, connection),
                quantity: task.quantity || 0,
                unit: 'pcs',
                planned_date: new Date(),
                status: PROC_STATUS.PENDING,
                note: 'Auto-created after process completion',
              }, connection);

              logger.info(`浠诲姟 ${taskId} 宸ュ簭瀹屾垚锛岃嚜鍔ㄥ垱寤烘楠屽崟鎴愬姛`);
            } else {
              logger.info(`Task ${taskId} already has a final inspection; skip creating`);
            }
          }
        } catch (inspectionError) {
          logger.error(`浠诲姟 ${taskId} 鑷姩鍒涘缓妫€楠屽崟澶辫触:`, inspectionError);
          throw inspectionError;
        }

        // ===== 宸ュ簭瀹屽伐鐨勯檮鍔犲鐞嗭紙涓讳簨鍔″唴鎵ц锛屼繚闅滄暟鎹竴鑷存€э級=====

        // 1. 鏇存柊 completed_quantity = quantity锛堝叏閮ㄥ畬宸ワ級
        await connection.query(
          'UPDATE production_tasks SET completed_quantity = quantity WHERE id = ? AND (completed_quantity IS NULL OR completed_quantity < quantity)',
          [taskId]
        );

        // 2. 鑷姩鍒涘缓鎶ュ伐璁板綍锛堝鏋滆繕娌℃湁锛?
        const [existingReports] = await connection.query(
          'SELECT COUNT(*) as count FROM production_reports WHERE task_id = ?',
          [taskId]
        );

        if (existingReports[0].count === 0) {
          const [processHours] = await connection.query(
            'SELECT COALESCE(SUM(standard_hours), 0) as total_hours FROM production_processes WHERE task_id = ?',
            [taskId]
          );
          const estimatedHours = parseFloat(processHours[0]?.total_hours) || 0;

          if (estimatedHours <= 0) {
            throw new BusinessError(
              'Process standard hours are required before auto report and cost accounting',
              { route: '/basedata/processes', buttonText: 'Configure standard hours' }
            );
          }

          const reportNo = await CodeGenerators.generateReportCode(connection);
          const [taskInfoForHook] = await connection.query('SELECT manager, quantity FROM production_tasks WHERE id = ?', [taskId]);
          const operatorName = taskInfoForHook[0]?.manager || await getCurrentUserName(req);
          const finalQuantity = taskInfoForHook[0]?.quantity || 0;

          await connection.query(
            `INSERT INTO production_reports
            (report_no, task_id, operator_id, operator_name, report_time, report_quantity,
             completed_quantity, qualified_quantity, defective_quantity, unqualified_quantity,
             work_hours, remarks, created_at)
            VALUES (?, ?, 0, ?, NOW(), ?, ?, ?, 0, 0, ?, ?, NOW())`,
            [
              reportNo, taskId, operatorName, finalQuantity, finalQuantity, 0,
              estimatedHours, 'Auto generated after process completion'
            ]
          );
          logger.info(`浠诲姟 ${taskId} 宸ュ簭瀹屾垚闄勫姞澶勭悊锛氳嚜鍔ㄥ垱寤烘姤宸ヨ褰曪紝宸ユ椂: ${estimatedHours}h`);
        }

        // 3. 鎴愭湰鏍哥畻鏍囪锛坈ommit 鍚庡紓姝ヨЕ鍙戯紝閬垮厤璇诲埌鏈彁浜ゆ暟鎹級
        // 鐢变笅鏂?commit 鍚庣殑 setImmediate 缁熶竴鎵ц
        // ==============================================================


        // ==============================================================


        // 澶嶇敤澶栭儴鏃╁凡鏌ヨ鍒扮殑 planId锛屽悓姝ヨ鍒掔姸鎬?
        if (planId) {
          await syncPlanStatus(planId, connection);
        }
        shouldTriggerCostAccounting = true;
      } else {
        logger.info(`浠诲姟 ${taskId} 杩樻湁鏈畬鎴愮殑宸ュ簭 (${completed}/${total - cancelled})`);
      }
    }

    await connection.commit();

    // 鎴愭湰鏍哥畻鍦ㄤ簨鍔℃彁浜ゅ悗寮傛鎵ц
    if (shouldTriggerCostAccounting && taskId) {
      setImmediate(async () => {
        try {
          const CostAccountingService = require('../../../services/business/CostAccountingService');
          await CostAccountingService.calculateActualCost(parseInt(taskId));
          logger.info(`Task ${taskId} process completion cost accounting triggered`);
        } catch (costErr) {
          logger.warn(`浠诲姟 ${taskId} 宸ュ簭瀹屾垚璺緞鎴愭湰鏍哥畻鎸傝捣: ${costErr.message}`);
        }
      });
    }

    return ResponseHandler.success(res, null, '鐢熶骇宸ュ簭鏇存柊鎴愬姛');
  } catch (error) {
    await connection.rollback();
    logger.error('鏇存柊鐢熶骇宸ュ簭澶辫触:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 鍒犻櫎鐢熶骇宸ュ簭
 */
exports.deleteProcess = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [processCheck] = await connection.query(
      'SELECT id, status FROM production_processes WHERE id = ? FOR UPDATE',
      [id]
    );

    if (processCheck.length === 0) {
      return ResponseHandler.error(res, 'Production process not found', 'NOT_FOUND', 404);
    }

    if (processCheck[0].status !== PROC_STATUS.PENDING) {
      await connection.rollback();
      return ResponseHandler.error(res, '鍙兘鍒犻櫎寰呭鐞嗙姸鎬佺殑宸ュ簭', 'VALIDATION_ERROR', 400);
    }

    await connection.query('DELETE FROM production_processes WHERE id = ?', [id]);

    await connection.commit();

    return ResponseHandler.success(res, null, '鐢熶骇宸ュ簭鍒犻櫎鎴愬姛');
  } catch (error) {
    await connection.rollback();
    logger.error('鍒犻櫎鐢熶骇宸ュ簭澶辫触:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 鑾峰彇宸ュ簭瀹屾垚鐜囷紙鐢ㄤ簬浠〃鐩橈級
 */
exports.getProcessCompletionRates = async (req, res) => {
  try {
    const query = `
      SELECT
        process_name as processName,
        COUNT(*) as total,
        SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed,
        ROUND(IFNULL(SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100, 0), 2) as completionRate
      FROM production_processes
      GROUP BY process_name
      ORDER BY total DESC
      LIMIT 10
    `;

    const [rates] = await pool.query(query);
    ResponseHandler.success(res, rates, 'Process completion rates loaded');
  } catch (error) {
    logger.error('Failed to get process completion rates', error);
    ResponseHandler.error(res, 'Failed to get process completion rates', 'SERVER_ERROR', 500, error);
  }
};
