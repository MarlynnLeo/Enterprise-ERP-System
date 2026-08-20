/**
 * processTemplateService.js
 * @description 工序模板服务层 - 从Controller分离SQL逻辑
 * @date 2026-03-03
 * @version 1.0.0
 */

const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');
const FileAccessService = require('./FileAccessService');
const crypto = require('crypto');

async function normalizeInstructionDocs(connection, docs, templateId, userId) {
    if (docs === undefined || docs === null || docs === '') return null;
    if (!Array.isArray(docs)) {
        const error = new Error('作业指导书必须是数组');
        error.code = 'INVALID_INSTRUCTION_DOCS';
        throw error;
    }

    const normalized = [];
    for (const doc of docs) {
        const url = FileAccessService.normalizeUploadUrl(doc?.url || doc?.fileUrl || doc?.file_url);
        if (!url) {
            const error = new Error('作业指导书文件路径无效');
            error.code = 'INVALID_FILE_REFERENCE';
            throw error;
        }
        const [rows] = await connection.execute(
            `SELECT id, business_type, business_id, uploaded_by, deleted_at
               FROM file_access_records
              WHERE file_url = ? LIMIT 1 FOR UPDATE`,
            [url]
        );
        const record = rows[0];
        if (!record || record.deleted_at) {
            const error = new Error('作业指导书未通过受控上传接口登记');
            error.code = 'FILE_ACCESS_RECORD_NOT_FOUND';
            throw error;
        }

        if (record.business_type || record.business_id) {
            if (
                record.business_type !== 'process_template' ||
                Number(record.business_id) !== Number(templateId)
            ) {
                const error = new Error('作业指导书已绑定到其他业务对象');
                error.code = 'FILE_ACCESS_BINDING_CONFLICT';
                throw error;
            }
        } else if (!userId || Number(record.uploaded_by) !== Number(userId)) {
            const error = new Error('只能绑定自己上传的作业指导书');
            error.code = 'FILE_OWNER_MISMATCH';
            throw error;
        } else {
            await connection.execute(
                `UPDATE file_access_records
                    SET business_type = 'process_template', business_id = ?, updated_at = NOW()
                  WHERE id = ?`,
                [templateId, record.id]
            );
        }

        normalized.push({
            name: String(doc?.name || doc?.originalName || '作业指导书').slice(0, 255),
            url,
            uploadTime: doc?.uploadTime || doc?.upload_time || null,
        });
    }
    return JSON.stringify(normalized);
}

async function retireRemovedInstructionDocs(connection, templateId, activeUrls) {
    const urls = [...new Set(activeUrls.filter(Boolean))];
    let sql = `UPDATE file_access_records
                  SET deleted_at = NOW(), updated_at = NOW()
                WHERE business_type = 'process_template'
                  AND business_id = ?
                  AND deleted_at IS NULL`;
    const params = [templateId];
    if (urls.length) {
        sql += ` AND file_url NOT IN (${urls.map(() => '?').join(',')})`;
        params.push(...urls);
    }
    await connection.execute(sql, params);
}

const processTemplateService = {
    /**
     * 获取工序模板列表（分页+过滤）
     * @param {number} page - 页码
     * @param {number} pageSize - 每页数量
     * @param {object} filters - 过滤条件 { name, status }
     */
    async getAll(page = 1, pageSize = 10, filters = {}) {
        try {
            const noPagination = pageSize === null || pageSize === undefined;
            const safePage = Math.max(parseInt(page, 10) || 1, 1);
            const safePageSize = noPagination ? null : Math.min(Math.max(parseInt(pageSize, 10) || 10, 1), 100);
            const offset = noPagination ? 0 : (safePage - 1) * safePageSize;
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
            const [templates] = await pool.query(
                `SELECT pt.*, m.code as product_code, m.name as product_name
         FROM process_templates pt
         LEFT JOIN materials m ON pt.product_id = m.id
         ${whereClause}
         ORDER BY pt.created_at DESC
         ${noPagination ? '' : `LIMIT ${safePageSize} OFFSET ${offset}`}`,
                params
            );

            // 批量查询所有模板的详情（避免N+1查询）
            if (templates.length > 0) {
                const templateIds = templates.map(t => t.id);
                const [allDetails] = await pool.query(
                    'SELECT id, template_id, order_num, name, description, standard_hours, department, remark, created_at, updated_at, instruction_docs FROM process_template_details WHERE template_id IN (?) ORDER BY order_num',
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

            return {
                list: templates,
                total,
                page: safePage,
                pageSize: noPagination ? templates.length : safePageSize
            };
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
            const [templates] = await pool.query('SELECT id, code, name, product_id, description, status, created_at, updated_at, deleted_at FROM process_templates WHERE id = ? AND deleted_at IS NULL', [id]);
            if (templates.length === 0) return null;

            const template = templates[0];
            const [details] = await pool.query(
                'SELECT id, template_id, order_num, name, description, standard_hours, department, remark, created_at, updated_at, instruction_docs FROM process_template_details WHERE template_id = ? ORDER BY order_num',
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
            const templateCode = code || `TPL-${dateStr}-${String(crypto.randomInt(100, 1000))}`;

            const [result] = await connection.query(
                'INSERT INTO process_templates (code, name, description, product_id, status) VALUES (?, ?, ?, ?, 1)',
                [templateCode, name, description || '', product_id || null]
            );

            const templateId = result.insertId;
            const activeInstructionUrls = [];

            // 批量插入详情
            for (let i = 0; i < details.length; i++) {
                const detail = details[i];
                const instructionDocs = await normalizeInstructionDocs(
                    connection,
                    detail.instruction_docs ?? detail.instructionDocs,
                    templateId,
                    data.created_by || data.createdBy || null
                );
                if (instructionDocs) {
                    activeInstructionUrls.push(...JSON.parse(instructionDocs).map((doc) => doc.url));
                }
                await connection.query(
                    `INSERT INTO process_template_details
          (template_id, name, order_num, description, standard_hours, department, remark, instruction_docs)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        templateId,
                        detail.name,
                        detail.order_num || i + 1,
                        detail.description || '',
                        detail.standard_hours || 0,
                        detail.department || '',
                        detail.remark || '',
                        instructionDocs,
                    ]
                );
            }
            await retireRemovedInstructionDocs(connection, templateId, activeInstructionUrls);

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
            const activeInstructionUrls = [];

            for (let i = 0; i < details.length; i++) {
                const detail = details[i];
                const instructionDocs = await normalizeInstructionDocs(
                    connection,
                    detail.instruction_docs ?? detail.instructionDocs,
                    id,
                    data.updated_by || data.updatedBy || null
                );
                if (instructionDocs) {
                    activeInstructionUrls.push(...JSON.parse(instructionDocs).map((doc) => doc.url));
                }
                await connection.query(
                    `INSERT INTO process_template_details
          (template_id, name, order_num, description, standard_hours, department, remark, instruction_docs)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        id,
                        detail.name,
                        detail.order_num || i + 1,
                        detail.description || '',
                        detail.standard_hours || 0,
                        detail.department || '',
                        detail.remark || '',
                        instructionDocs,
                    ]
                );
            }
            await retireRemovedInstructionDocs(connection, id, activeInstructionUrls);

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
            await retireRemovedInstructionDocs(connection, id, []);
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
                'SELECT id, template_id, order_num, name, description, standard_hours, department, remark, created_at, updated_at, instruction_docs FROM process_template_details WHERE template_id = ? ORDER BY order_num',
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
