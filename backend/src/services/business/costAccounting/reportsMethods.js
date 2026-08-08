/**
 * CostAccountingService — reports methods (mixin)
 * Attached via Object.assign so `this` resolves to CostAccountingService.
 * @module services/business/costAccounting/reportsMethods
 */

const {
  logger,
  db,
  BusinessError,
  globalConfigManager,
  businessConfig,
  currentDateString,
  toLocalDateString,
  resolveActorUserId,
  GLService,
  InventoryService,
  Precision,
  financeConfig,
  DOCUMENT_TYPES,
} = require('./runtime');

module.exports = {
  /**
     * 解析期间字符串为日期范围
     * @param {string} period 期间，格式 'YYYY-MM'，为空则取当月
     * @returns {{ year: string, month: string, startDate: string, endDate: string }}
     */
    parsePeriodRange(period) {
      const now = new Date();
      const periodText = String(period || '');
      const [inputYear, inputMonth] = periodText.split('-').map(Number);
      const normalizedPeriod =
        /^\d{4}-\d{2}$/.test(periodText) && inputMonth >= 1 && inputMonth <= 12
          ? `${inputYear}-${String(inputMonth).padStart(2, '0')}`
          : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [year, month] = normalizedPeriod.split('-');
      const startDate = `${year}-${month}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const endDate = `${year}-${month}-${lastDay}`;
      return { year, month, startDate, endDate };
    },

  /**
     * 获取指定期间的成本汇总数据
     * 优先级: actual_costs -> wip_snapshots(同期)
     * @param {string} startDate 开始日期
     * @param {string} endDate 结束日期
     * @param {string[]} fields 查询字段列表
     * @returns {Promise<Object>}
     */
    async getCostSummaryForPeriod(
      startDate,
      endDate,
      fields = ['materialCost', 'laborCost', 'overheadCost', 'totalCost']
    ) {
      const defaultResult = {};
      fields.forEach((f) => {
        defaultResult[f] = 0;
      });
  
      const actualFieldMap = {
        materialCost: 'COALESCE(SUM(material_cost), 0) as materialCost',
        laborCost: 'COALESCE(SUM(labor_cost), 0) as laborCost',
        overheadCost: 'COALESCE(SUM(overhead_cost), 0) as overheadCost',
        totalCost: 'COALESCE(SUM(total_cost), 0) as totalCost',
      };
      const wipFieldMap = {
        materialCost: 'COALESCE(SUM(wip_material_cost), 0) as materialCost',
        laborCost: 'COALESCE(SUM(wip_labor_cost), 0) as laborCost',
        overheadCost: 'COALESCE(SUM(wip_overhead_cost), 0) as overheadCost',
        totalCost: 'COALESCE(SUM(wip_total_cost), 0) as totalCost',
      };
      const actualSelectClause = fields
        .map((f) => actualFieldMap[f])
        .filter(Boolean)
        .join(', ');
      const wipSelectClause = fields
        .map((f) => wipFieldMap[f])
        .filter(Boolean)
        .join(', ');
  
      // 1. 优先从 actual_costs 获取
      try {
        const [costData] = await db.pool.execute(
          `SELECT ${actualSelectClause} FROM actual_costs WHERE calculated_at BETWEEN ? AND ?`,
          [startDate, endDate]
        );
        const row = costData[0];
        if (fields.some((f) => parseFloat(row[f]) > 0)) return this._parseNumericFields(row, fields);
      } catch {
        /* actual_costs表可能不存在 */
      }
  
      // 2. 从 wip_snapshots 同期数据获取
      try {
        const [wipData] = await db.pool.execute(
          `SELECT ${wipSelectClause} FROM wip_snapshots WHERE snapshot_date BETWEEN ? AND ?`,
          [startDate, endDate]
        );
        const row = wipData[0];
        if (fields.some((f) => parseFloat(row[f]) > 0)) return this._parseNumericFields(row, fields);
      } catch {
        /* 降级 */
      }
  
      return defaultResult;
    },

  /**
     * 批量获取多个月份的成本趋势数据
     * @param {number} monthCount 月份数量
     * @returns {Promise<Array>}
     */
    async getCostTrendData(monthCount = 6) {
      const trendData = [];
      const now = new Date();
      for (let i = parseInt(monthCount) - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = String(date.getFullYear());
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const { startDate, endDate } = this.parsePeriodRange(`${year}-${month}`);
        const stats = await this.getCostSummaryForPeriod(startDate, endDate);
        trendData.push({ month: `${month}月`, period: `${year}-${month}`, ...stats });
      }
      return trendData;
    },

  /** @private 将查询结果字段统一转为 number */
    _parseNumericFields(row, fields) {
      const result = {};
      fields.forEach((f) => {
        result[f] = parseFloat(row[f]) || 0;
      });
      return result;
    },
};
