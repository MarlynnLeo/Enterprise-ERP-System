/**
 * costSettingsController.js
 * @description 成本设置与费率历史控制器
 * @date 2026-06-11
 */

const db = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { parsePagination } = require('../../../utils/safePagination');
const { currentDateString, toLocalDateString } = require('../../../utils/dateUtils');

module.exports = {
  /**
   * 获取成本设置
   */
  getCostSettings: async (req, res) => {
    try {
      const [settings] = await db.pool.execute(
        `SELECT id, setting_name, overhead_rate, labor_rate, costing_method,
                wage_payment_method, piece_rate, overhead_allocation_rules,
                fallback_material_ratio, fallback_labor_ratio, fallback_overhead_ratio,
                is_active, description, created_at, updated_at
         FROM cost_settings
         WHERE is_active = 1
         ORDER BY id DESC LIMIT 1`
      );

      if (settings.length === 0) {
        return ResponseHandler.error(
          res,
          '系统成本基础配置缺失，请先完成初始化配置',
          'CONFIG_MISSING',
          404
        );
      }

      const s = settings[0];
      ResponseHandler.success(res, {
        id: s.id,
        settingName: s.setting_name,
        overheadRate: parseFloat(s.overhead_rate),
        laborRate: parseFloat(s.labor_rate),
        costingMethod: s.costing_method,
        wagePaymentMethod: s.wage_payment_method,
        pieceRate: parseFloat(s.piece_rate),
        isActive: Boolean(s.is_active),
        description: s.description || '',
        overheadAllocationRules: s.overhead_allocation_rules || [],
        fallbackMaterialRatio: parseFloat(s.fallback_material_ratio),
        fallbackLaborRatio: parseFloat(s.fallback_labor_ratio),
        fallbackOverheadRatio: parseFloat(s.fallback_overhead_ratio),
        updatedAt: s.updated_at ? new Date(s.updated_at).toLocaleString('zh-CN') : '',
      });
    } catch (error) {
      logger.error('获取成本设置失败:', error);
      ResponseHandler.error(res, '获取成本设置失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 保存成本设置
   */
  saveCostSettings: async (req, res) => {
    try {
      const {
        overheadRate,
        laborRate,
        costingMethod,
        description,
        wagePaymentMethod,
        pieceRate,
        overheadAllocationRules,
        fallbackMaterialRatio,
        fallbackLaborRatio,
        fallbackOverheadRatio,
      } = req.body;

      // 验证参数
      if (overheadRate === undefined || laborRate === undefined) {
        return ResponseHandler.error(res, '请提供制造费用分摊率和人工费率', 'VALIDATION_ERROR', 400);
      }

      // 校验拆分比例（三项之和必须等于 1.0）
      const mr = parseFloat(fallbackMaterialRatio);
      const lr = parseFloat(fallbackLaborRatio);
      const or = parseFloat(fallbackOverheadRatio);
      if (isNaN(mr) || isNaN(lr) || isNaN(or)) {
        return ResponseHandler.error(res, '请提供完整的成本拆分比例', 'VALIDATION_ERROR', 400);
      }
      if (Math.abs((mr + lr + or) - 1.0) > 0.001) {
        return ResponseHandler.error(res, `成本拆分比例之和必须等于1.0（当前: ${(mr + lr + or).toFixed(4)}）`, 'VALIDATION_ERROR', 400);
      }

      // 检查是否存在激活的设置
      const [existing] = await db.pool.execute(
        'SELECT id FROM cost_settings WHERE is_active = 1 LIMIT 1'
      );

      if (existing.length > 0) {
        // 保存当前设置到历史表
        try {
          const [currentSettings] = await db.pool.execute(
            'SELECT id, setting_name, overhead_rate, wage_payment_method, labor_rate, piece_rate, costing_method, is_active, description, overhead_allocation_rules, created_at, updated_at, fallback_material_ratio, fallback_labor_ratio, fallback_overhead_ratio FROM cost_settings WHERE id = ?',
            [existing[0].id]
          );
          if (currentSettings.length > 0) {
            const cs = currentSettings[0];
            await db.pool.execute(
              `INSERT INTO cost_settings_history
                             (settings_id, setting_name, overhead_rate, labor_rate, costing_method,
                              wage_payment_method, piece_rate, overhead_allocation_rules,
                              effective_from, effective_to, changed_by, change_reason)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, ?)`,
              [
                cs.id,
                cs.setting_name,
                cs.overhead_rate,
                cs.labor_rate,
                cs.costing_method,
                cs.wage_payment_method || 'hourly',
                cs.piece_rate || 0,
                cs.overhead_allocation_rules || null,
                cs.updated_at ? toLocalDateString(cs.updated_at) : '2020-01-01',
                req.user?.name || 'system',
                '费率变更',
              ]
            );
          }
        } catch (historyError) {
          logger.warn('保存费率历史失败:', historyError.message);
        }

        // 更新现有设置
        await db.pool.execute(
          `UPDATE cost_settings
                     SET overhead_rate = ?, labor_rate = ?, costing_method = ?,
                         wage_payment_method = ?, piece_rate = ?, overhead_allocation_rules = ?,
                         fallback_material_ratio = ?, fallback_labor_ratio = ?, fallback_overhead_ratio = ?,
                         description = ?, updated_at = NOW()
                     WHERE id = ?`,
          [
            parseFloat(overheadRate),
            parseFloat(laborRate),
            costingMethod || 'weighted_average',
            wagePaymentMethod || 'hourly',
            parseFloat(pieceRate) || 0,
            JSON.stringify(overheadAllocationRules || []),
            mr,
            lr,
            or,
            description || '',
            existing[0].id,
          ]
        );
        logger.info(
          `成本设置已更新: 人工费率=${laborRate}, 制造费用率=${overheadRate}, 计薪=${wagePaymentMethod}`
        );
      } else {
        // 创建新设置
        await db.pool.execute(
          `INSERT INTO cost_settings
                     (setting_name, overhead_rate, labor_rate, costing_method, wage_payment_method, piece_rate, overhead_allocation_rules, is_active, description, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
          [
            '默认成本配置',
            parseFloat(overheadRate),
            parseFloat(laborRate),
            costingMethod || 'weighted_average',
            wagePaymentMethod || 'hourly',
            parseFloat(pieceRate) || 0,
            JSON.stringify(overheadAllocationRules || []),
            description || '',
          ]
        );
        logger.info(
          `成本设置已创建: 人工费率=${laborRate}, 制造费用率=${overheadRate}, 计薪=${wagePaymentMethod}`
        );
      }

      // 热重载SSOT配置，确保内存中的配置树立即生效
      try {
        const globalConfigManager = require('../../../config/globalConfig');
        await globalConfigManager.reload();
        logger.info('SSOT 配置树已热重载');
      } catch (reloadErr) {
        logger.warn('SSOT 配置热重载失败:', reloadErr.message);
      }

      ResponseHandler.success(res, { message: '成本设置保存成功' });
    } catch (error) {
      logger.error('保存成本设置失败:', error);
      ResponseHandler.error(res, '保存成本设置失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 费率历史管理 ====================

  /**
   * 获取费率变更历史
   */
  getCostSettingsHistory: async (req, res) => {
    try {
      const { page, pageSize, offset } = parsePagination(req.query.page, req.query.pageSize, {
        defaultPageSize: 20,
        maxPageSize: 100,
      });

      const [rows] = await db.pool.query(`
                SELECT id, settings_id, setting_name, overhead_rate, labor_rate, costing_method, wage_payment_method, piece_rate, overhead_allocation_rules, effective_from, effective_to, changed_by, change_reason, created_at FROM cost_settings_history
                ORDER BY COALESCE(effective_from, created_at) DESC, id DESC
                LIMIT ${pageSize} OFFSET ${offset}
            `);

      const [countResult] = await db.pool.execute(
        'SELECT COUNT(*) as total FROM cost_settings_history'
      );

      ResponseHandler.paginated(res, rows, countResult[0].total, page, pageSize, undefined, {
        items: rows,
      });
    } catch (error) {
      logger.error('获取费率历史失败:', error);
      ResponseHandler.error(res, '获取费率历史失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 根据日期获取历史费率
   */
  getCostSettingsByDate: async (req, res) => {
    try {
      const { date } = req.query;
      const queryDate = date || currentDateString();

      const [settings] = await db.pool.execute(
        `
                SELECT id, settings_id, setting_name, overhead_rate, labor_rate, costing_method, wage_payment_method, piece_rate, overhead_allocation_rules, effective_from, effective_to, changed_by, change_reason, created_at FROM cost_settings_history
                WHERE effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
                ORDER BY effective_from DESC LIMIT 1
            `,
        [queryDate, queryDate]
      );

      if (settings.length > 0) {
        ResponseHandler.success(res, settings[0]);
      } else {
        // 返回当前设置
        const [current] = await db.pool.execute(
          'SELECT id, setting_name, overhead_rate, wage_payment_method, labor_rate, piece_rate, costing_method, is_active, description, overhead_allocation_rules, created_at, updated_at, fallback_material_ratio, fallback_labor_ratio, fallback_overhead_ratio FROM cost_settings WHERE is_active = 1 LIMIT 1'
        );
        ResponseHandler.success(res, current[0] || null);
      }
    } catch (error) {
      logger.error('获取历史费率失败:', error);
      ResponseHandler.error(res, '获取历史费率失败', 'SERVER_ERROR', 500);
    }
  },
};
