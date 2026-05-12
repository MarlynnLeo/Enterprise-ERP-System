/**
 * CostLedgerService.js
 * 成本明细账服务
 * 提供多维度成本查询和汇总功能
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');

class CostLedgerService {
  /**
   * 获取成本明细账
   * @param {Object} filters - 筛选条件
   * @param {string} filters.startDate - 开始日期
   * @param {string} filters.endDate - 结束日期
   * @param {number} filters.productId - 产品ID
   * @param {number} filters.costCenterId - 成本中心ID
   * @param {number} filters.taskId - 生产任务ID
   * @param {string} filters.costType - 成本类型: material/labor/overhead
   * @param {number} filters.page - 页码
   * @param {number} filters.pageSize - 每页条数
   * @returns {Promise<Object>} 明细账数据
   */
  static async getCostLedger(filters = {}) {
    try {
      const page = parseInt(filters.page) || 1;
      const pageSize = parseInt(filters.pageSize) || 20;
      const offset = (page - 1) * pageSize;

      let whereClause = '1=1';
      const params = [];

      // 日期筛选
      if (filters.startDate) {
        whereClause += ' AND pt.updated_at >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereClause += ' AND pt.updated_at <= ?';
        params.push(filters.endDate + ' 23:59:59');
      }

      // 产品筛选
      if (filters.productId) {
        whereClause += ' AND pt.product_id = ?';
        params.push(filters.productId);
      }

      // 成本中心筛选
      if (filters.costCenterId) {
        whereClause += ' AND pt.cost_center_id = ?';
        params.push(filters.costCenterId);
      }

      // 任务筛选
      if (filters.taskId) {
        whereClause += ' AND pt.id = ?';
        params.push(filters.taskId);
      }

      // 查询明细
      const sql = `
                SELECT
                    pt.id as task_id,
                    pt.code as task_code,
                    pt.status,
                    DATE_FORMAT(pt.updated_at, '%Y-%m-%d') as cost_date,
                    m.id as product_id,
                    m.code as product_code,
                    m.name as product_name,
                    pt.quantity,
                    cc.id as cost_center_id,
                    cc.code as cost_center_code,
                    cc.name as cost_center_name,
                    pt.material_cost,
                    pt.labor_cost,
                    pt.overhead_cost,
                    pt.actual_cost as total_cost,
                    CASE WHEN pt.quantity > 0 THEN pt.actual_cost / pt.quantity ELSE 0 END as unit_cost
                FROM production_tasks pt
                LEFT JOIN materials m ON pt.product_id = m.id
                LEFT JOIN cost_centers cc ON pt.cost_center_id = cc.id
                WHERE ${whereClause} AND pt.status = 'completed'
                ORDER BY pt.updated_at DESC
                LIMIT ? OFFSET ?
            `;

      const countSql = `
                SELECT COUNT(*) as total
                FROM production_tasks pt
                WHERE ${whereClause} AND pt.status = 'completed'
            `;

      // 将LIMIT和OFFSET参数转为字符串，避免mysql2参数类型问题
      const [rows] = await db.pool.execute(sql, [...params, String(pageSize), String(offset)]);
      const [countResult] = await db.pool.execute(countSql, params);

      return {
        list: rows,
        total: countResult[0].total,
        page,
        pageSize,
      };
    } catch (error) {
      logger.error('[CostLedger] 获取成本明细账失败:', error);
      throw error;
    }
  }

  /**
   * 按维度汇总成本
   * @param {string} dimension - 维度: product/task/cost_center/month
   * @param {Object} filters - 筛选条件
   * @returns {Promise<Array>} 汇总数据
   */
  static async getCostSummary(dimension, filters = {}) {
    try {
      let groupBy = '';
      let selectFields = '';

      switch (dimension) {
        case 'product':
          groupBy = 'm.id, m.code, m.name';
          selectFields = `
                        m.id as dimension_id,
                        m.code as dimension_code,
                        m.name as dimension_name,
                        '产品' as dimension_type
                    `;
          break;
        case 'cost_center':
          groupBy = 'cc.id, cc.code, cc.name';
          selectFields = `
                        cc.id as dimension_id,
                        cc.code as dimension_code,
                        COALESCE(cc.name, '未分配') as dimension_name,
                        '成本中心' as dimension_type
                    `;
          break;
        case 'month':
          groupBy = "DATE_FORMAT(pt.updated_at, '%Y-%m')";
          selectFields = `
                        DATE_FORMAT(pt.updated_at, '%Y-%m') as dimension_id,
                        DATE_FORMAT(pt.updated_at, '%Y-%m') as dimension_code,
                        DATE_FORMAT(pt.updated_at, '%Y-%m') as dimension_name,
                        '月份' as dimension_type
                    `;
          break;
        default: // task
          groupBy = 'pt.id, pt.code';
          selectFields = `
                        pt.id as dimension_id,
                        pt.code as dimension_code,
                        pt.code as dimension_name,
                        '生产任务' as dimension_type
                    `;
      }

      let whereClause = "pt.status = 'completed'";
      const params = [];

      if (filters.startDate) {
        whereClause += ' AND pt.updated_at >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereClause += ' AND pt.updated_at <= ?';
        params.push(filters.endDate + ' 23:59:59');
      }
      if (filters.costCenterId) {
        whereClause += ' AND pt.cost_center_id = ?';
        params.push(filters.costCenterId);
      }
      if (filters.productId) {
        whereClause += ' AND pt.product_id = ?';
        params.push(filters.productId);
      }

      const sql = `
                SELECT
                    ${selectFields},
                    COUNT(pt.id) as task_count,
                    COALESCE(SUM(pt.quantity), 0) as total_quantity,
                    COALESCE(SUM(pt.material_cost), 0) as material_cost,
                    COALESCE(SUM(pt.labor_cost), 0) as labor_cost,
                    COALESCE(SUM(pt.overhead_cost), 0) as overhead_cost,
                    COALESCE(SUM(pt.actual_cost), 0) as total_cost,
                    CASE WHEN SUM(pt.quantity) > 0 THEN SUM(pt.actual_cost) / SUM(pt.quantity) ELSE 0 END as avg_unit_cost
                FROM production_tasks pt
                LEFT JOIN materials m ON pt.product_id = m.id
                LEFT JOIN cost_centers cc ON pt.cost_center_id = cc.id
                WHERE ${whereClause}
                GROUP BY ${groupBy}
                ORDER BY total_cost DESC
            `;

      const [rows] = await db.pool.execute(sql, params);
      return rows;
    } catch (error) {
      logger.error('[CostLedger] 获取成本汇总失败:', error);
      throw error;
    }
  }

  /**
   * 获取成本趋势数据
   * @param {Object} filters - 筛选条件
   * @param {string} filters.period - 周期: day/week/month
   * @param {number} filters.count - 周期数量
   * @returns {Promise<Array>} 趋势数据
   */
  static async getCostTrend(filters = {}) {
    try {
      const period = filters.period || 'month';
      // ✅ 安全修复：强制整数化 + 极值限制，防止注入
      const count = Math.max(1, Math.min(365, parseInt(filters.count) || 12));

      // ✅ 安全修复：严格白名单控制 dateFormat 和 interval 单位
      // 不再使用用户输入直接拼接 SQL
      const PERIOD_CONFIG = {
        day:   { dateFormat: '%Y-%m-%d', intervalUnit: 'DAY' },
        week:  { dateFormat: '%Y-W%V',   intervalUnit: 'WEEK' },
        month: { dateFormat: '%Y-%m',    intervalUnit: 'MONTH' },
      };
      const config = PERIOD_CONFIG[period] || PERIOD_CONFIG.month;

      // ✅ 安全修复：dateFormat 来自白名单常量，intervalUnit 也来自白名单
      // count 通过参数绑定传入，彻底消除拼接注入风险
      const sql = `
                SELECT
                    DATE_FORMAT(pt.updated_at, '${config.dateFormat}') as period,
                    COUNT(pt.id) as task_count,
                    COALESCE(SUM(pt.quantity), 0) as total_quantity,
                    COALESCE(SUM(pt.material_cost), 0) as material_cost,
                    COALESCE(SUM(pt.labor_cost), 0) as labor_cost,
                    COALESCE(SUM(pt.overhead_cost), 0) as overhead_cost,
                    COALESCE(SUM(pt.actual_cost), 0) as total_cost
                FROM production_tasks pt
                WHERE pt.status = 'completed'
                  AND pt.updated_at >= DATE_SUB(CURDATE(), INTERVAL ? ${config.intervalUnit})
                GROUP BY DATE_FORMAT(pt.updated_at, '${config.dateFormat}')
                ORDER BY period ASC
            `;

      const [rows] = await db.pool.execute(sql, [count]);
      return rows;
    } catch (error) {
      logger.error('[CostLedger] 获取成本趋势失败:', error);
      throw error;
    }
  }

  /**
   * 获取任务成本钻取详情
   * @param {number} taskId - 任务ID
   * @returns {Promise<Object>} 成本钻取详情
   */
  static async getTaskCostDrilldown(taskId) {
    try {
      // 获取任务基本信息
      const [tasks] = await db.pool.execute(
        `
                SELECT
                    pt.*,
                    m.code as product_code,
                    m.name as product_name,
                    cc.code as cost_center_code,
                    cc.name as cost_center_name
                FROM production_tasks pt
                LEFT JOIN materials m ON pt.product_id = m.id
                LEFT JOIN cost_centers cc ON pt.cost_center_id = cc.id
                WHERE pt.id = ?
            `,
        [taskId]
      );

      if (tasks.length === 0) {
        return null;
      }

      const task = tasks[0];

      // 获取材料消耗明细
      const [materials] = await db.pool.execute(
        `
                SELECT
                    m.code as material_code,
                    m.name as material_name,
                    SUM(CASE WHEN ioi.actual_quantity IS NULL THEN ioi.quantity ELSE ioi.actual_quantity END) as quantity,
                    SUM(
                        (CASE WHEN ioi.actual_quantity IS NULL THEN ioi.quantity ELSE ioi.actual_quantity END)
                        * COALESCE(NULLIF(ioi.price, 0), NULLIF(m.cost_price, 0), NULLIF(m.price, 0), 0)
                    ) / NULLIF(SUM(CASE WHEN ioi.actual_quantity IS NULL THEN ioi.quantity ELSE ioi.actual_quantity END), 0) as unit_cost,
                    SUM(
                        (CASE WHEN ioi.actual_quantity IS NULL THEN ioi.quantity ELSE ioi.actual_quantity END)
                        * COALESCE(NULLIF(ioi.price, 0), NULLIF(m.cost_price, 0), NULLIF(m.price, 0), 0)
                    ) as total_cost
                FROM inventory_outbound io
                JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
                JOIN materials m ON ioi.material_id = m.id
                WHERE io.production_task_id = ?
                GROUP BY m.id, m.code, m.name
            `,
        [taskId]
      );

      // 获取工序工时明细
      const [processes] = await db.pool.execute(
        `
                SELECT
                    process_name,
                    standard_hours,
                    TIMESTAMPDIFF(SECOND, actual_start_time, actual_end_time) / 3600 as actual_hours,
                    efficiency_rate,
                    status
                FROM production_processes
                WHERE task_id = ?
                ORDER BY id
            `,
        [taskId]
      );

      // 获取关联凭证
      const [vouchers] = await db.pool.execute(
        `
                SELECT
                    ge.id,
                    ge.entry_number,
                    ge.description,
                    ge.transaction_type,
                    DATE_FORMAT(ge.entry_date, '%Y-%m-%d') as entry_date,
                    (SELECT SUM(debit_amount) FROM gl_entry_items WHERE entry_id = ge.id) as total_amount
                FROM gl_entries ge
                WHERE ge.document_number = ? OR ge.transaction_id = ?
                ORDER BY ge.id
            `,
        [task.code, taskId]
      );

      return {
        task: {
          id: task.id,
          code: task.code,
          status: task.status,
          product_code: task.product_code,
          product_name: task.product_name,
          quantity: task.quantity,
          cost_center_code: task.cost_center_code,
          cost_center_name: task.cost_center_name,
          material_cost: task.material_cost,
          labor_cost: task.labor_cost,
          overhead_cost: task.overhead_cost,
          actual_cost: task.actual_cost,
          unit_cost: task.quantity > 0 ? task.actual_cost / task.quantity : 0,
        },
        materials,
        processes,
        vouchers,
      };
    } catch (error) {
      logger.error('[CostLedger] 获取任务成本钻取失败:', error);
      throw error;
    }
  }
}

module.exports = CostLedgerService;
