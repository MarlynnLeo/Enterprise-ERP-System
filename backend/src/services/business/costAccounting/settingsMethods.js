/**
 * CostAccountingService — settings methods (mixin)
 * Attached via Object.assign so `this` resolves to CostAccountingService.
 * @module services/business/costAccounting/settingsMethods
 */

const {
  logger,
  db,
  BusinessError,
  globalConfigManager,
} = require('./runtime');

module.exports = {
  /**
     * 获取成本配置（直接从数据库读取，不依赖全局单例）
     * @returns {Object} 配置对象 { laborRate, overheadRate, costingMethod, ... }
     */
    async getCostSettings() {
      const [rows] = await db.pool.execute(
        `SELECT labor_rate, overhead_rate, costing_method, wage_payment_method, piece_rate,
                fallback_material_ratio, fallback_labor_ratio, fallback_overhead_ratio
         FROM cost_settings WHERE is_active = 1 LIMIT 1`
      );
  
      if (rows.length === 0) {
        throw new BusinessError('系统成本基础配置缺失，请在「财务管理 → 成本设置」中完成初始化配置', {
          route: '/finance/cost/settings',
          buttonText: '去配置成本参数',
        });
      }
  
      const row = rows[0];
      return {
        laborRate: Number(row.labor_rate),
        overheadRate: Number(row.overhead_rate),
        costingMethod: row.costing_method,
        wagePaymentMethod: row.wage_payment_method,
        pieceRate: Number(row.piece_rate),
        fallbackMaterialRatio: Number(row.fallback_material_ratio),
        fallbackLaborRatio: Number(row.fallback_labor_ratio),
        fallbackOverheadRatio: Number(row.fallback_overhead_ratio),
      };
    },

  /**
     * 补齐成本核算默认配置，表结构由 Knex migration 管理。
     */
    async initializeCostAccountingTables() {
      const connection = await db.pool.getConnection();
      try {
        // 注意：standard_costs, actual_costs, cost_settings 表已由 Knex migration 管理
        // 仅保留默认配置检查逻辑
        const [existingSettings] = await connection.execute(
          'SELECT id FROM cost_settings WHERE is_active = true LIMIT 1'
        );
  
        if (existingSettings.length === 0) {
          // 从全局配置读取初始值，严禁硬编码
          const costConfig = globalConfigManager.getConfig().cost;
          await connection.execute(
            `
            INSERT INTO cost_settings (setting_name, overhead_rate, labor_rate, costing_method, is_active, description)
            VALUES ('默认成本配置', ?, ?, ?, true, '系统默认成本核算配置')
          `,
            [
              costConfig.overheadRate,
              costConfig.laborRate,
              costConfig.costingMethod || 'weighted_average',
            ]
          );
          logger.info('[CostAccountingService] 已创建默认成本配置');
        }
  
        logger.info('[CostAccountingService] 成本核算相关表初始化完成');
      } catch (error) {
        logger.error('初始化成本核算表失败:', error);
        throw error;
      } finally {
        connection.release();
      }
    },
};
