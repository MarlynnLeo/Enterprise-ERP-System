const BusinessError = require('../../utils/BusinessError');
const definitions = require('../ProductProcessRouteService');
const { snapshotStep } = require('../../utils/productProcessDefinition');

class ProductProcessTaskService {
  static async resolveDefinition(connection, productId, templateId = null, { allowInactive = false } = {}) {
    // Serialize the current-version choice with publication of a replacement.
    const [products] = await connection.query('SELECT id FROM materials WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [productId]);
    if (!products.length) throw new BusinessError('关联产品不存在', null, 'PRODUCT_NOT_FOUND', 404);
    const route = templateId
      ? await definitions.getById(templateId, connection, { lock: true })
      : await definitions.getByProductId(productId, connection, { lock: true });
    if (templateId && (!route || Number(route.product_id) !== Number(productId) || (!allowInactive && Number(route.status) !== 1))) {
      throw new BusinessError('所选工艺必须是该产品的当前生效版本', null, 'INVALID_TASK_PROCESS_VERSION', 409);
    }
    return route;
  }

  static async insertProcesses(connection, taskId, quantity, steps) {
    const ids = [];
    for (const step of steps) {
      const snapshot = snapshotStep(step);
      const [result] = await connection.query(
        `INSERT INTO production_processes
         (task_id, process_name, sequence, quantity, progress, status, standard_hours,
          description, remarks, template_detail_id, station_id, process_snapshot)
         VALUES (?, ?, ?, ?, 0, 'pending', ?, ?, ?, ?, ?, ?)`,
        [taskId, snapshot.name, snapshot.order_num, quantity, snapshot.standard_hours,
          snapshot.description, snapshot.remark, step.id || null, snapshot.station_id, JSON.stringify(snapshot)]
      );
      ids.push(result.insertId);
    }
    return ids;
  }

  static async initializeTask(connection, taskId, options = {}) {
    const [tasks] = await connection.query('SELECT * FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [taskId]);
    const task = tasks[0];
    if (!task) throw new BusinessError('生产任务不存在', null, 'PRODUCTION_TASK_NOT_FOUND', 404);
    const [existing] = await connection.query('SELECT * FROM production_processes WHERE task_id = ? ORDER BY sequence, id FOR UPDATE', [taskId]);
    if (existing.length && !options.replace) return { templateId: task.process_template_id, processIds: existing.map(row => row.id), created: false };

    if (options.replace) {
      const [reports] = await connection.query('SELECT id FROM production_reports WHERE task_id = ? LIMIT 1', [taskId]);
      if (!['pending', 'allocated', 'preparing'].includes(task.status) || reports.length ||
          existing.some(row => row.status !== 'pending' || row.actual_start_time)) {
        throw new BusinessError('任务已进入执行流程，不能更换工艺版本', null, 'TASK_PROCESS_VERSION_LOCKED', 409);
      }
    }
    const frozen = task.process_snapshot_at && !options.replace;
    const requestedId = frozen ? task.process_template_id : options.templateId;
    const route = frozen && !requestedId ? null : await this.resolveDefinition(
      connection, task.product_id, requestedId, { allowInactive: Boolean(frozen) }
    );
    if (options.replace) await connection.query('DELETE FROM production_processes WHERE task_id = ?', [taskId]);
    const steps = route?.details?.length ? route.details : [{
      name: '生产加工', order_num: 1, standard_hours: 0, description: '默认生产过程', remark: '请记录实际工时',
    }];
    const ids = await this.insertProcesses(connection, taskId, task.quantity, steps);
    await connection.query(
      `UPDATE production_tasks SET process_template_id = ?, process_template_version = ?,
       process_snapshot_at = IF(?, NOW(), COALESCE(process_snapshot_at, NOW())) WHERE id = ?`,
      [route?.id || null, route?.version || null, Boolean(options.replace), taskId]
    );
    return { templateId: route?.id || null, version: route?.version || null, processIds: ids, created: true };
  }
}

module.exports = ProductProcessTaskService;
