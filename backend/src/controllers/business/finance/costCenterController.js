/**
 * costCenterController.js
 * @description 成本中心管理控制器
 * @date 2026-06-11
 */

const db = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

module.exports = {
  // ==================== 成本中心管理 ====================

  /**
   * 获取成本中心列表
   */
  getCostCenters: async (req, res) => {
    try {
      const [centers] = await db.pool.execute(`
                SELECT cc.*, d.name as department_name, cc.manager as manager_name
                FROM cost_centers cc
                LEFT JOIN departments d ON cc.department_id = d.id
                WHERE cc.is_active = 1
                ORDER BY cc.code
            `);
      ResponseHandler.success(res, { items: centers, total: centers.length });
    } catch (error) {
      logger.error('获取成本中心列表失败:', error);
      ResponseHandler.error(res, '获取成本中心列表失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 创建成本中心
   */
  createCostCenter: async (req, res) => {
    try {
      const { code, name, type, parent_id, department_id, manager, manager_id, description } =
        req.body;

      if (!code || !name) {
        return ResponseHandler.error(res, '成本中心编码和名称不能为空', 'VALIDATION_ERROR', 400);
      }

      const [result] = await db.pool.execute(
        `INSERT INTO cost_centers (code, name, type, parent_id, department_id, manager, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          name,
          type || 'production',
          parent_id || null,
          department_id || null,
          manager || manager_id || null,
          description || '',
        ]
      );

      logger.info(`创建成本中心: ${code} - ${name}`);
      ResponseHandler.success(res, { id: result.insertId, message: '成本中心创建成功' });
    } catch (error) {
      logger.error('创建成本中心失败:', error);
      ResponseHandler.error(res, error.message || '创建成本中心失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 更新成本中心
   */
  updateCostCenter: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        type,
        parent_id,
        department_id,
        manager,
        manager_id,
        description,
        is_active,
      } = req.body;

      await db.pool.execute(
        `UPDATE cost_centers SET name = ?, type = ?, parent_id = ?, department_id = ?,
                 manager = ?, description = ?, is_active = ? WHERE id = ?`,
        [
          name,
          type,
          parent_id || null,
          department_id || null,
          manager || manager_id || null,
          description || '',
          is_active !== false ? 1 : 0,
          id,
        ]
      );

      ResponseHandler.success(res, { message: '成本中心更新成功' });
    } catch (error) {
      logger.error('更新成本中心失败:', error);
      ResponseHandler.error(res, '更新成本中心失败', 'SERVER_ERROR', 500);
    }
  },
};
