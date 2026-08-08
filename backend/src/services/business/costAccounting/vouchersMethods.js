/**
 * CostAccountingService — vouchers methods (mixin)
 * Attached via Object.assign so `this` resolves to CostAccountingService.
 * @module services/business/costAccounting/vouchersMethods
 */

const {
  logger,
} = require('./runtime');

module.exports = {
  /**
     * 获取科目ID（通过科目编码）
     * @param {Object} connection 数据库连接
     * @param {string} accountCode 科目编码
     * @returns {Promise<number|null>} 科目ID
     */
    async getAccountIdByCode(connection, accountCode) {
      try {
        const [accounts] = await connection.execute(
          'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = true LIMIT 1',
          [accountCode]
        );
        return accounts.length > 0 ? accounts[0].id : null;
      } catch (error) {
        logger.error(`获取科目ID失败 (${accountCode}):`, error);
        throw error;
      }
    },

  /**
     * 生成领料凭证
     * Dr: 生产成本-直接材料
     * Cr: 原材料
     *
     * @param {number} taskId 生产任务ID
     * @param {Object} connection 数据库连接（用于事务）
     * @param {number} outboundId 可选，指定出库单ID（用于补料等场景，只计算该出库单的成本）
     * @returns {Promise<Object>} 凭证信息
     */
    async generateMaterialVoucher(taskId, connection = null, outboundId = null) {
      // 已废弃：生产领料/成本统一由 calculateActualCost 使用 document_type=PRODUCTION_MATERIAL 生成。
      throw new Error(
        'generateMaterialVoucher 已废弃。请使用 CostAccountingService.calculateActualCost(taskId) 作为唯一成本过账入口。'
      );
    },

  /**
     * 生成销售成本结转凭证
     * 借: 主营业务成本 (MAIN_BUSINESS_COST)
     * 贷: 库存商品 (INVENTORY_GOODS)
     *
     * @param {number} salesId 销售单ID
     * @param {number} productId 产品ID
     * @param {number} quantity 数量
     * @param {number} unitCost 单位成本
     * @param {Object} connection 数据库连接
     * @returns {Promise<Object>} 凭证信息
     */
    async generateSalesCostVoucher(salesId, productId, quantity, unitCost, connection = null) {
      // 已废弃：销售成本统一由 FinanceIntegrationService.generateCostEntryFromSalesOutbound 生成。
      throw new Error(
        'generateSalesCostVoucher 已废弃。请使用 FinanceIntegrationService.generateCostEntryFromSalesOutbound。'
      );
    },

  async assertOpenPeriod(connection, periodId) {
      if (!periodId) {
        throw new Error('缺少会计期间');
      }
  
      const [periods] = await connection.execute(
        'SELECT id, period_name, is_closed FROM gl_periods WHERE id = ? FOR UPDATE',
        [periodId]
      );
  
      if (periods.length === 0) {
        throw new Error('会计期间不存在');
      }
  
      if (Number(periods[0].is_closed) === 1 || periods[0].is_closed === true) {
        throw new Error(
          `会计期间 ${periods[0].period_name || periodId} 已关闭，不能执行成本期末动作`
        );
      }
  
      return periods[0];
    },
};
