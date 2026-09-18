'use strict';

const db = require('../../config/db');
const ScopeGuard = require('../../authorization/ScopeGuard');

const MODULES = {
  requisitions: { table: 'purchase_requisitions', resource: 'purchase_requisition', pending: ['draft', 'submitted'], number: 'requisition_number', date: 'request_date', requester: 'real_name' },
  orders: { table: 'purchase_orders', resource: 'purchase_order', pending: ['draft', 'pending'], number: 'order_no', date: 'order_date' },
  receipts: { table: 'purchase_receipts', resource: 'purchase_receipt', pending: ['draft', 'confirmed'], number: 'receipt_no', date: 'receipt_date', requester: 'operator' },
  returns: { table: 'purchase_returns', resource: 'purchase_return', pending: ['draft', 'confirmed'], number: 'return_no', date: 'return_date', requester: 'operator' },
};
const STATES = ['draft', 'submitted', 'pending', 'approved', 'confirmed', 'completed'];

class PurchaseDashboardService {
  constructor() {
    this.pool = db.pool;
  }

  async getStatistics(module, scope) {
    const columns = STATES.map(state => `COALESCE(SUM(t.status = '${state}'), 0) AS ${state}`).join(', ');
    const [[row]] = await this.pool.query(`
      SELECT COUNT(*) AS total, ${columns},
        COALESCE(SUM(t.status = 'completed'
          AND t.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
          AND t.created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)), 0) AS completed_this_month
      FROM ${module.table} t ${scope.join}
      WHERE t.deleted_at IS NULL ${scope.where}`, scope.params);
    const stats = Object.fromEntries(STATES.map(state => [state, Number(row[state])]));
    return {
      ...stats,
      total: Number(row.total),
      pending: module.pending.reduce((sum, state) => sum + Number(row[state]), 0),
      completedThisMonth: Number(row.completed_this_month),
    };
  }

  async getTrendData(months, requisitions, orders) {
    const [rows] = await this.pool.query(`
      SELECT month, SUM(requisition_count) AS requisition_count,
        SUM(order_count) AS order_count, SUM(order_amount) AS order_amount
      FROM (
        SELECT DATE_FORMAT(t.created_at, '%Y-%m') AS month,
          1 AS requisition_count, 0 AS order_count, 0 AS order_amount
        FROM purchase_requisitions t ${requisitions.join}
        WHERE t.deleted_at IS NULL ${requisitions.where}
          AND t.created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
          AND t.created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
        UNION ALL
        SELECT DATE_FORMAT(t.created_at, '%Y-%m') AS month,
          0 AS requisition_count, 1 AS order_count,
          CASE WHEN t.status <> 'cancelled' THEN COALESCE(t.total_amount, 0) ELSE 0 END AS order_amount
        FROM purchase_orders t ${orders.join}
        WHERE t.deleted_at IS NULL ${orders.where}
          AND t.created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
          AND t.created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
      ) combined
      GROUP BY month ORDER BY month ASC`,
    [...requisitions.params, months - 1, ...orders.params, months - 1]);
    return rows.map(row => ({
      month: row.month, requisitionCount: Number(row.requisition_count),
      orderCount: Number(row.order_count), orderAmount: Number(row.order_amount),
    }));
  }

  async getCategoryDistribution(months, scope) {
    const [rows] = await this.pool.query(`
      SELECT COALESCE(c.name, '未分类') AS category_name,
        COUNT(DISTINCT t.id) AS order_count,
        COALESCE(SUM(COALESCE(poi.amount_excluding_tax, poi.total, 0) + COALESCE(poi.tax_amount, 0)), 0) AS total_amount
      FROM purchase_orders t
      INNER JOIN purchase_order_items poi ON poi.order_id = t.id
      LEFT JOIN materials m ON poi.material_id = m.id
      LEFT JOIN categories c ON m.category_id = c.id
      ${scope.join}
      WHERE t.deleted_at IS NULL AND t.status <> 'cancelled' ${scope.where}
        AND t.created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
        AND t.created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
      GROUP BY c.id, c.name ORDER BY total_amount DESC LIMIT 6`,
    [...scope.params, months - 1]);
    return rows.map(row => ({
      categoryName: row.category_name, orderCount: Number(row.order_count), totalAmount: Number(row.total_amount),
    }));
  }

  async getPendingItems(scopes) {
    const params = [];
    const types = { requisitions: 'requisition', orders: 'order', receipts: 'receipt', returns: 'return' };
    const queries = Object.entries(MODULES).map(([key, module]) => {
      const scope = scopes[key];
      params.push(...module.pending, ...scope.params);
      return `SELECT '${types[key]}' AS type, t.${module.number} AS number, t.${module.date} AS date,
        t.status, ${module.requester ? `t.${module.requester}` : 'NULL'} AS requester,
        ${key === 'requisitions' ? 'NULL' : 't.supplier_name'} AS supplier,
        ${key === 'orders' ? 't.total_amount' : 'NULL'} AS amount
      FROM ${module.table} t ${scope.join}
      WHERE t.deleted_at IS NULL AND t.status IN (?, ?) ${scope.where}`;
    });
    const [rows] = await this.pool.query(`${queries.join(' UNION ALL ')} ORDER BY date DESC, number DESC LIMIT 20`, params);
    return rows;
  }

  async getDashboardData(req, { months = 6 } = {}) {
    const scopeEntries = await Promise.all(Object.entries(MODULES).map(async ([key, module]) => [
      key, await ScopeGuard.applyListScope(req, module.resource, {
        tableAlias: 't', ownerAlias: `${module.resource}_dashboard_owner_scope`, accessMode: 'read',
      }),
    ]));
    const scopes = Object.fromEntries(scopeEntries);
    const [statisticsEntries, trendData, categoryDistribution, pendingItems] = await Promise.all([
      Promise.all(Object.entries(MODULES).map(async ([key, module]) => [key, await this.getStatistics(module, scopes[key])])),
      this.getTrendData(months, scopes.requisitions, scopes.orders),
      this.getCategoryDistribution(months, scopes.orders),
      this.getPendingItems(scopes),
    ]);
    return { statistics: Object.fromEntries(statisticsEntries), months, trendData, categoryDistribution, pendingItems };
  }
}

module.exports = new PurchaseDashboardService();
