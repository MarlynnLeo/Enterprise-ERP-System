/**
 * assetInventory.js
 * @description 资产盘点数据模型
 */

const db = require('../config/db');
const { logger } = require('../utils/logger');
const { parsePagination, appendPaginationSQL } = require('../utils/safePagination');

function inventoryError(message) {
  return Object.assign(new Error(message), { code: 'VALIDATION_ERROR' });
}

async function lockActiveInventory(connection, id) {
  const [rows] = await connection.query(
    'SELECT id, status FROM asset_inventories WHERE id = ? FOR UPDATE',
    [id]
  );
  if (!rows.length) throw inventoryError('盘点单不存在或已被删除');
  if (rows[0].status !== '进行中') throw inventoryError('仅进行中的盘点单可以修改或完成');
}

const assetInventoryModel = {
  /**
   * 获取盘点单列表
   */
  getInventories: async (filters, page = 1, limit = 10) => {
    try {
      const pagination = parsePagination(page, limit, { defaultPageSize: 10, maxPageSize: 100 });
      let query = `
                SELECT i.id, i.inventory_no, i.inventory_name, i.status, i.start_date, i.end_date, i.created_by, i.notes, i.created_at, i.updated_at, i.completed_at, i.completed_by, i.inventory_name as title,
                       (SELECT COUNT(*) FROM asset_inventory_items item WHERE item.inventory_id = i.id) as total_items,
                       (SELECT COUNT(*) FROM asset_inventory_items item WHERE item.inventory_id = i.id AND item.status = '盘点相符') as matched_items,
                       (SELECT COUNT(*) FROM asset_inventory_items item WHERE item.inventory_id = i.id AND item.status = '盘盈') as surplus_items,
                       (SELECT COUNT(*) FROM asset_inventory_items item WHERE item.inventory_id = i.id AND item.status = '盘亏') as shortage_items
                FROM asset_inventories i
                WHERE 1=1
            `;
      const params = [];

      if (filters.status) {
        query += ` AND i.status = ?`;
        params.push(filters.status);
      }

      query += ` ORDER BY i.created_at DESC`;

      // 获取总数
      const countQuery = `SELECT COUNT(*) as total FROM asset_inventories WHERE 1=1 ${filters.status ? 'AND status = ?' : ''}`;
      const [countResult] = await db.pool.query(countQuery, filters.status ? [filters.status] : []);
      const total = countResult[0].total;

      // 分页
      query = appendPaginationSQL(query, pagination.limit, pagination.offset);

      const [inventories] = await db.pool.query(query, params);

      return {
        inventories,
        pagination: {
          total,
          page: pagination.page,
          limit: pagination.pageSize,
          totalPages: Math.ceil(total / pagination.pageSize),
        },
      };
    } catch (error) {
      logger.error('获取盘点单列表失败模型:', error);
      throw error;
    }
  },

  /**
   * 获取盘点单详情及明细
   */
  getInventoryById: async (id) => {
    try {
      const [inventories] = await db.pool.query(
        'SELECT id, inventory_no, inventory_name, status, start_date, end_date, created_by, notes, created_at, updated_at, completed_at, completed_by, inventory_name as title FROM asset_inventories WHERE id = ?',
        [id]
      );

      if (inventories.length === 0) return null;

      const inventory = inventories[0];

      const [items] = await db.pool.query(
        `SELECT item.id, item.inventory_id, item.asset_id, item.book_quantity, item.actual_quantity, item.status, item.handled_by, item.inventory_date, item.notes, a.asset_code, a.asset_name, a.asset_type as category_name, a.location_id as location, a.department_id, a.custodian as responsible
                 FROM asset_inventory_items item
                 LEFT JOIN fixed_assets a ON item.asset_id = a.id
                 WHERE item.inventory_id = ?
                 ORDER BY a.asset_code ASC`,
        [id]
      );

      // 获取部门名称
      const [departments] = await db.pool.query('SELECT id, name FROM departments');
      const deptMap = {};
      departments.forEach((d) => (deptMap[d.id] = d.name));

      inventory.items = items.map((item) => ({
        ...item,
        department: item.department_id ? deptMap[item.department_id] : '',
      }));

      return inventory;
    } catch (error) {
      logger.error('获取盘点单详情失败模型:', error);
      throw error;
    }
  },

  /**
   * 创建盘点单并生成明细
   */
  createInventory: async (data, userId) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 编码规则是一条稳定的公共锁，串行化“当前没有进行中盘点”的判断。
      await connection.query(
        "SELECT id FROM coding_rules WHERE business_type = 'asset_inventory' FOR UPDATE"
      );
      // 检查是否有未完成的盘点单
      const [activeInventories] = await connection.query(
        'SELECT id FROM asset_inventories WHERE status = "进行中" FOR UPDATE'
      );
      if (activeInventories.length > 0) {
        throw new Error('存在未完成的盘点单，请先完成或取消当前盘点');
      }

      // 生成盘点单号 — 使用统一编码引擎
      const { CodeGenerators } = require('../utils/codeGenerator');
      const inventoryNo = await CodeGenerators.generateAssetInventoryCode(connection);

      // 创建主单
      const [result] = await connection.query(
        `INSERT INTO asset_inventories (inventory_no, inventory_name, status, created_by, notes)
                 VALUES (?, ?, '进行中', ?, ?)`,
        [inventoryNo, data.title, userId, data.notes || null]
      );

      const inventoryId = result.insertId;

      // 获取所有在用且未报废的固定资产
      const [assets] = await connection.query(
        `SELECT id, asset_code FROM fixed_assets WHERE status IN ('在用', '闲置')`
      );

      // 批量生成盘点明细（默认账面数量1，实盘数量未定状态'未盘点'）
      if (assets.length > 0) {
        const values = assets.map((a) => [inventoryId, a.id, 1, null, '未盘点', null]);
        await connection.query(
          `INSERT INTO asset_inventory_items (inventory_id, asset_id, book_quantity, actual_quantity, status, notes)
                     VALUES ?`,
          [values]
        );
      }

      await connection.commit();
      return inventoryId;
    } catch (error) {
      await connection.rollback();
      logger.error('创建盘点单失败模型:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 更新单条盘点明细（实盘数据）
   */
  updateInventoryItem: async (itemId, data, inventoryId) => {
    const quantity = Number(data.actual_quantity);
    if (
      !['number', 'string'].includes(typeof data.actual_quantity) ||
      String(data.actual_quantity).trim() === '' ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0
    ) {
      throw inventoryError('实盘数量必须为非负整数');
    }
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      // 与完成操作使用同一个主单锁，防止完成后仍写入盘点结果。
      await lockActiveInventory(connection, inventoryId);
      const [items] = await connection.query(
        'SELECT id, book_quantity FROM asset_inventory_items WHERE id = ? AND inventory_id = ? FOR UPDATE',
        [itemId, inventoryId]
      );
      if (!items.length) throw inventoryError('盘点明细不属于当前盘点单');
      const bookQuantity = Number(items[0].book_quantity);
      const status =
        quantity === bookQuantity ? '盘点相符' : quantity > bookQuantity ? '盘盈' : '盘亏';
      await connection.query(
        `UPDATE asset_inventory_items
                 SET actual_quantity = ?, status = ?, notes = ?
                 WHERE id = ? AND inventory_id = ?`,
        [quantity, status, data.notes || null, itemId, inventoryId]
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('更新盘点明细失败模型:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 完成盘点并计算盈亏
   */
  completeInventory: async (id, userId) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      await lockActiveInventory(connection, id);

      // 检查是否所有明细都已盘点
      const [uncounted] = await connection.query(
        `SELECT id FROM asset_inventory_items WHERE inventory_id = ?
         AND (status = '未盘点' OR actual_quantity IS NULL OR actual_quantity < 0
              OR actual_quantity <> FLOOR(actual_quantity)) FOR UPDATE`,
        [id]
      );

      if (uncounted.length > 0) {
        throw inventoryError('存在未确认实盘数量的资产明细，请完成所有明细盘点后再提交');
      }

      // 重新由数量推导历史明细状态，避免客户端状态与实盘结果不一致。
      await connection.query(
        `UPDATE asset_inventory_items SET status = CASE
           WHEN actual_quantity = book_quantity THEN '盘点相符'
           WHEN actual_quantity > book_quantity THEN '盘盈' ELSE '盘亏' END
         WHERE inventory_id = ?`,
        [id]
      );

      // 更新主单状态
      await connection.query(
        `UPDATE asset_inventories
                 SET status = '已完成', completed_at = NOW(), completed_by = ?
                 WHERE id = ?`,
        [userId, id]
      );

      // 获取最终统计结果
      const [stats] = await connection.query(
        `SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status = '盘点相符' THEN 1 ELSE 0 END) as matched,
                    SUM(CASE WHEN status = '盘盈' THEN 1 ELSE 0 END) as surplus,
                    SUM(CASE WHEN status = '盘亏' THEN 1 ELSE 0 END) as shortage
                 FROM asset_inventory_items
                 WHERE inventory_id = ?`,
        [id]
      );

      await connection.commit();
      return stats[0];
    } catch (error) {
      await connection.rollback();
      logger.error('完成盘点失败模型:', error);
      throw error;
    } finally {
      connection.release();
    }
  },
};

module.exports = assetInventoryModel;
