/**
 * AssemblyVerificationService.js
 * @description 扫码防错服务 — 验证装配物料正确性
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');

class AssemblyVerificationService {
  /**
   * 验证扫码物料是否匹配生产任务 BOM
   * @param {Object} data - { taskId, scannedBarcode, station }
   * @param {number} operatorId - 操作人ID
   */
  static async verify(data, operatorId) {
    const { taskId, scannedBarcode, station } = data;

    // 1. 获取任务 + BOM
    const [tasks] = await pool.query(
      'SELECT id, product_id, code FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
      [taskId]
    );
    if (tasks.length === 0) throw new Error('生产任务不存在');

    // 2. 通过条码查找物料（按物料编码匹配）
    const [materials] = await pool.query(
      'SELECT id, code, name FROM materials WHERE code = ? LIMIT 1',
      [scannedBarcode]
    );

    if (materials.length === 0) {
      // 物料不存在，直接返回失败（material_id NOT NULL 约束不允许写入空值）
      return { result: 'fail', reason: '未识别的物料条码', material: null };
    }

    const material = materials[0];

    // 3. 检查该物料是否在任务的 BOM 中
    const [bomCheck] = await pool.query(
      `SELECT bd.id AS bom_detail_id, bd.quantity AS unit_quantity
       FROM bom_details bd
       INNER JOIN bom_masters bm ON bd.bom_id = bm.id
       WHERE bm.product_id = ? AND bd.material_id = ?`,
      [tasks[0].product_id, material.id]
    );

    if (bomCheck.length === 0) {
      // 物料不在 BOM 中
      const log = await this._saveLog({
        taskId, materialId: material.id, scannedBarcode,
        expectedBarcode: material.code, result: 'fail',
        failReason: `物料 ${material.code}(${material.name}) 不在该任务的 BOM 中`,
        operatorId, station,
      });
      return {
        result: 'fail',
        reason: `物料 ${material.name} 不在 BOM 中`,
        material: { id: material.id, code: material.code, name: material.name },
        log,
      };
    }

    // 4. 验证通过
    const log = await this._saveLog({
      taskId, materialId: material.id, scannedBarcode,
      expectedBarcode: material.code, result: 'pass',
      failReason: null, operatorId, station,
      bomDetailId: bomCheck[0].bom_detail_id,
    });

    return {
      result: 'pass',
      material: { id: material.id, code: material.code, name: material.name },
      bomQuantity: bomCheck[0].unit_quantity,
      log,
    };
  }

  /** 保存验证日志 */
  static async _saveLog(data) {
    const [result] = await pool.query(
      `INSERT INTO assembly_verification_logs
       (task_id, bom_detail_id, material_id, scanned_barcode, expected_barcode, result, fail_reason, operator_id, station)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.taskId, data.bomDetailId || null, data.materialId, data.scannedBarcode,
       data.expectedBarcode, data.result, data.failReason, data.operatorId, data.station || null]
    );
    return { id: result.insertId, result: data.result };
  }

  /** 查询验证日志 */
  static async getLogs(params = {}) {
    const page = parseInt(params.page, 10) || 1;
    const pageSize = parseInt(params.pageSize, 10) || 20;
    const { taskId, operatorId, result } = params;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE 1=1';
    const values = [];

    if (taskId) { where += ' AND avl.task_id = ?'; values.push(taskId); }
    if (operatorId) { where += ' AND avl.operator_id = ?'; values.push(operatorId); }
    if (result) { where += ' AND avl.result = ?'; values.push(result); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM assembly_verification_logs avl ${where}`, values
    );

    const [list] = await pool.query(
      `SELECT avl.*, m.code AS material_code, m.name AS material_name,
              u.real_name AS operator_name, pt.code AS task_code
       FROM assembly_verification_logs avl
       LEFT JOIN materials m ON avl.material_id = m.id
       LEFT JOIN users u ON avl.operator_id = u.id
       LEFT JOIN production_tasks pt ON avl.task_id = pt.id
       ${where}
       ORDER BY avl.created_at DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return { list, total, page, pageSize };
  }
}

module.exports = AssemblyVerificationService;
