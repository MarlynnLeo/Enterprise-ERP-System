/**
 * assetInventory.js
 * @description 资产盘点数据模型
 */

const db = require('../config/db');
const logger = require('../utils/logger');

const assetInventoryModel = {
    /**
     * 获取盘点单列表
     */
    getInventories: async (filters, page = 1, limit = 10) => {
        try {
            let query = `
                SELECT i.*, i.inventory_name as title,
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
            const offset = (page - 1) * limit;
            query += ` LIMIT ? OFFSET ?`;
            params.push(limit, offset);

            const [inventories] = await db.pool.query(query, params);

            return {
                inventories,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
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
            const [inventories] = await db.pool.query('SELECT *, inventory_name as title FROM asset_inventories WHERE id = ?', [id]);

            if (inventories.length === 0) return null;

            const inventory = inventories[0];

            const [items] = await db.pool.query(
                `SELECT item.*, a.asset_code, a.asset_name, a.asset_type as category_name, a.location_id as location, a.department_id, a.custodian as responsible
                 FROM asset_inventory_items item
                 LEFT JOIN fixed_assets a ON item.asset_id = a.id
                 WHERE item.inventory_id = ?
                 ORDER BY a.asset_code ASC`,
                [id]
            );

            // 获取部门名称
            const [departments] = await db.pool.query('SELECT id, name FROM departments');
            const deptMap = {};
            departments.forEach(d => deptMap[d.id] = d.name);

            inventory.items = items.map(item => ({
                ...item,
                department: item.department_id ? deptMap[item.department_id] : ''
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

            // 检查是否有未完成的盘点单
            const [activeInventories] = await connection.query(
                'SELECT id FROM asset_inventories WHERE status = "进行中"'
            );
            if (activeInventories.length > 0) {
                throw new Error('存在未完成的盘点单，请先完成或取消当前盘点');
            }

            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const inventoryNo = `INV-${dateStr}-${String(Math.floor(Math.random() * 900) + 100)}`;

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
                const values = assets.map(a => [inventoryId, a.id, 1, null, '未盘点', null]);
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
    updateInventoryItem: async (itemId, data) => {
        try {
            await db.pool.query(
                `UPDATE asset_inventory_items 
                 SET actual_quantity = ?, status = ?, notes = ? 
                 WHERE id = ?`,
                [data.actual_quantity, data.status, data.notes || null, itemId]
            );
            return true;
        } catch (error) {
            logger.error('更新盘点明细失败模型:', error);
            throw error;
        }
    },

    /**
     * 完成盘点并计算盈亏
     */
    completeInventory: async (id, userId) => {
        const connection = await db.pool.getConnection();
        try {
            await connection.beginTransaction();

            // 检查是否所有明细都已盘点
            const [uncounted] = await connection.query(
                `SELECT id FROM asset_inventory_items WHERE inventory_id = ? AND status = '未盘点'`,
                [id]
            );

            if (uncounted.length > 0) {
                throw new Error('存在未确认实盘数量的资产明细，请完成所有明细盘点后再提交');
            }

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
    }
};

module.exports = assetInventoryModel;
