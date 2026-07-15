/**
 * costConfigController.js
 * @description 补料原因配置与GL映射控制器
 * @date 2026-06-11
 */

const db = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

module.exports = {
  // =========================================================================
  // 补料原因配置 API
  // =========================================================================

  /**
   * 获取补料原因列表
   */
  getSupplementReasons: async (req, res) => {
    try {
      const [reasons] = await db.pool.execute(
        'SELECT id, reason_code, reason_name, is_included_in_cost, is_active, created_at, updated_at FROM cost_supplement_configs ORDER BY created_at DESC'
      );
      return ResponseHandler.success(res, reasons);
    } catch (error) {
      logger.error('获取补料原因失败:', error);
      return ResponseHandler.error(res, error);
    }
  },

  /**
   * 保存补料原因 (新增或更新)
   */
  saveSupplementReason: async (req, res) => {
    try {
      const { reason_code, reason_name } = req.body;
      const isIncludedInCost = req.body.is_included_in_cost !== undefined
        ? req.body.is_included_in_cost
        : 1;
      const isActive = req.body.is_active !== undefined ? req.body.is_active : 1;
      const id = req.params.id || req.body.id;
      logger.debug('Supplement reason payload normalized', {
        id,
        reasonCode: reason_code,
        hasReasonName: Boolean(reason_name),
        isIncludedInCost: Boolean(isIncludedInCost),
        isActive: Boolean(isActive),
      });

      if (!reason_code || !reason_name) {
        return ResponseHandler.error(res, '原因代码和名称不能为空');
      }

      if (id) {
        // 更新
        await db.pool.execute(
          `UPDATE cost_supplement_configs
                     SET reason_code = ?, reason_name = ?, is_included_in_cost = ?, is_active = ?
                     WHERE id = ?`,
          [reason_code, reason_name, isIncludedInCost, isActive, id]
        );
      } else {
        // 新增
        await db.pool.execute(
          `INSERT INTO cost_supplement_configs (reason_code, reason_name, is_included_in_cost, is_active)
                     VALUES (?, ?, ?, ?)`,
          [reason_code, reason_name, isIncludedInCost, isActive]
        );
      }
      return ResponseHandler.success(res, { message: '保存成功' });
    } catch (error) {
      logger.error('保存补料原因失败:', error);
      return ResponseHandler.error(res, error);
    }
  },

  /**
   * 删除补料原因
   */
  deleteSupplementReason: async (req, res) => {
    try {
      const { id } = req.params;
      await db.pool.execute('DELETE FROM cost_supplement_configs WHERE id = ?', [id]);
      return ResponseHandler.success(res, { message: '删除成功' });
    } catch (error) {
      logger.error('删除补料原因失败:', error);
      return ResponseHandler.error(res, error);
    }
  },

  // ==================== 财务合规接口 (GL Integration) ====================

  /**
   * 获取总账科目列表
   */
  getGLAccounts: async (req, res) => {
    try {
      const [accounts] = await db.pool.execute('SELECT id, account_code, account_name, account_type, parent_id, is_debit, is_active, currency_code, description, created_at, updated_at, type, opening_debit, opening_credit, opening_balance_date, opening_balance_set, opening_source_type, opening_source_details, opening_source_updated_at, has_customer, has_supplier, has_employee, has_department, has_project FROM gl_accounts ORDER BY account_code');
      return ResponseHandler.success(res, accounts);
    } catch (error) {
      logger.error('获取科目列表失败:', error);
      return ResponseHandler.error(res, error);
    }
  },

  /**
   * 获取科目映射配置
   */
  getGLMappings: async (req, res) => {
    try {
      const [mappings] = await db.pool.execute(`
                SELECT m.*, a.account_code, a.account_name
                FROM gl_account_mappings m
                LEFT JOIN gl_accounts a ON m.account_id = a.id
                ORDER BY m.id
            `);
      return ResponseHandler.success(res, mappings);
    } catch (error) {
      logger.error('获取科目映射失败:', error);
      return ResponseHandler.error(res, error);
    }
  },

  /**
   * 保存科目映射
   */
  saveGLMapping: async (req, res) => {
    try {
      const { mappings } = req.body; // Expect array of { mapping_key, account_id }

      if (!mappings || !Array.isArray(mappings)) {
        return ResponseHandler.error(res, '参数格式错误');
      }

      for (const item of mappings) {
        if (item.mapping_key && item.account_id) {
          await db.pool.execute(
            'UPDATE gl_account_mappings SET account_id = ? WHERE mapping_key = ?',
            [item.account_id, item.mapping_key]
          );
        }
      }
      return ResponseHandler.success(res, { message: '映射保存成功' });
    } catch (error) {
      logger.error('保存科目映射失败:', error);
      return ResponseHandler.error(res, error);
    }
  },
};
