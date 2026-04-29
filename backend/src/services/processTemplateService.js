/**
 * processTemplateService.js
 * @description 工序模板服务层 - 从Controller分离SQL逻辑
 * @date 2026-03-03
 * @version 1.0.0
 */

const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');

const processTemplateService = {
    /**
     * 获取工序模板列表（分页+过滤）
     * @param {number} page - 页码
     * @param {number} pageSize - 每页数量
     * @param {object} filters - 过滤条件 { name, status }
     */
    async getAll(page = 1, pageSize = 10, filters = {}) {
        try {
            const offset = (page - 1) * pageSize;
            let whereClause = 'WHERE pt.deleted_at IS NULL';
            const params = [];

            if (filters.name) {
                whereClause += ' AND pt.name LIKE ?';
                params.push(`%${filters.name}%`);
            }
            if (filters.status !== undefined) {
                whereClause += ' AND pt.status = ?';
                params.push(filters.status);
            }

            // 查询总数
            const [countResult] = await pool.query(
                `SELECT COUNT(*) as total FROM process_templates pt ${whereClause}`,
                params
            );
            const total = countResult[0].total;

            // 查询列表（JOIN materials表获取产品信息）
            const actualPageSize = parseInt(pageSize);
            const [templates] = await pool.query(
                `SELECT pt.*, m.code as product_code, m.name as product_name 
         FROM process_templates pt
         LEFT JOIN materials m ON pt.product_id = m.id
         ${whereClause} 
         ORDER BY pt.created_at DESC 
         LIMIT ${actualPageSize} OFFSET ${parseInt(offset)}`,
                params
            );

            // 批量查询所有模板的详情（避免N+1查询）
            if (templates.length > 0) {
                const templateIds = templates.map(t => t.id);
                const [allDetails] = await pool.query(
                    'SELECT * FROM process_template_details WHERE template_id IN (?) ORDER BY order_num',
                    [templateIds]
                );

                // 按template_id分组
                const detailsMap = {};
                allDetails.forEach(detail => {
                    if (!detailsMap[detail.template_id]) {
                        detailsMap[detail.template_id] = [];
                    }
                    detailsMap[detail.template_id].push(detail);
                });

                templates.forEach(template => {
                    template.details = detailsMap[template.id] || [];
                });
            }

            return { list: templates, total, page: parseInt(page), pageSize: parseInt(pageSize) };
        } catch (error) {
            logger.error('获取工序模板列表失败:', error);
            throw error;
        }
    },

    /**
     * 根据ID获取工序模板详情
     */
    async getById(id) {
        try {
            const [templates] = await pool.query('SELECT * FROM process_templates WHERE id = ? AND deleted_at IS NULL', [id]);
            if (templates.length === 0) return null;

            const template = templates[0];
            const [details] = await pool.query(
                'SELECT * FROM process_template_details WHERE template_id = ? ORDER BY order_num',
                [template.id]
            );
            template.details = details;

            return template;
        } catch (error) {
            logger.error(`获取工序模板详情失败 (ID: ${id}):`, error);
            throw error;
        }
    },

    /**
     * 创建工序模板（含事务处理）
     */
    async create(data) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const { name, code, description, product_id, details = [] } = data;
            const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
            const templateCode = code || `TPL-${dateStr}-${String(Math.floor(Math.random() * 900) + 100)}`;

            const [result] = await connection.query(
                'INSERT INTO process_templates (code, name, description, product_id, status) VALUES (?, ?, ?, ?, 1)',
                [templateCode, name, description || '', product_id || null]
            );

            const templateId = result.insertId;

            // 批量插入详情
            for (let i = 0; i < details.length; i++) {
                const detail = details[i];
                await connection.query(
                    `INSERT INTO process_template_details
          (template_id, name, order_num, description, standard_hours, department, remark)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        templateId,
                        detail.name,
                        detail.order_num || i + 1,
                        detail.description || '',
                        detail.standard_hours || 0,
                        detail.department || '',
                        detail.remark || '',
                    ]
                );
            }

            await connection.commit();
            return { id: templateId, name, code: templateCode, description, details };
        } catch (error) {
            await connection.rollback();
            logger.error('创建工序模板失败:', error);
            throw error;
        } finally {
            connection.release();
        }
    },

    /**
     * 更新工序模板（含事务处理，先删后插详情）
     */
    async update(id, data) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const { name, description, product_id, details = [] } = data;

            await connection.query(
                'UPDATE process_templates SET name = ?, description = ?, product_id = ? WHERE id = ?',
                [name, description || '', product_id || null, id]
            );

            // 先删后插详情
            await connection.query('DELETE FROM process_template_details WHERE template_id = ?', [id]);

            for (let i = 0; i < details.length; i++) {
                const detail = details[i];
                await connection.query(
                    `INSERT INTO process_template_details
          (template_id, name, order_num, description, standard_hours, department, remark)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        id,
                        detail.name,
                        detail.order_num || i + 1,
                        detail.description || '',
                        detail.standard_hours || 0,
                        detail.department || '',
                        detail.remark || '',
                    ]
                );
            }

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            logger.error('更新工序模板失败:', error);
            throw error;
        } finally {
            connection.release();
        }
    },

    /**
     * 删除工序模板（含事务处理）
     */
    async delete(id) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query('DELETE FROM process_template_details WHERE template_id = ?', [id]);
            // ✅ 软删除工序模板主表
            await softDelete(connection, 'process_templates', 'id', id);

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            logger.error('删除工序模板失败:', error);
            throw error;
        } finally {
            connection.release();
        }
    },

    /**
     * 更新工序模板状态
     */
    async updateStatus(id, status) {
        try {
            await pool.query('UPDATE process_templates SET status = ? WHERE id = ?', [status, id]);
            return true;
        } catch (error) {
            logger.error('更新工序模板状态失败:', error);
            throw error;
        }
    },

    /**
     * 根据产品ID获取工序模板
     */
    async getByProductId(productId) {
        try {
            const [templates] = await pool.query(
                `SELECT pt.* FROM process_templates pt
         WHERE pt.product_id = ? AND pt.status = 1
         ORDER BY pt.created_at DESC LIMIT 1`,
                [productId]
            );

            if (templates.length === 0) return null;

            const template = templates[0];
            const [details] = await pool.query(
                'SELECT * FROM process_template_details WHERE template_id = ? ORDER BY order_num',
                [template.id]
            );
            template.details = details;

            return template;
        } catch (error) {
            logger.error('获取产品工序模板失败:', error);
            throw error;
        }
    }
};

module.exports = processTemplateService;
