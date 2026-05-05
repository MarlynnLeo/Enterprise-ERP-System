/**
 * cip.js
 * @description 在建工程(CIP)数据模型
 * @date 2025-08-27
 */

const db = require('../config/db');
const { logger } = require('../utils/logger');


const cipModel = {
    /**
     * 获取在建工程列表
     */
    getCipProjects: async (filters = {}, page = 1, limit = 10) => {
        try {
            let query = 'SELECT * FROM cip_projects WHERE 1=1';
            const queryParams = [];

            if (filters.project_code) {
                query += ' AND project_code LIKE ?';
                queryParams.push(`%${filters.project_code}%`);
            }
            if (filters.project_name) {
                query += ' AND project_name LIKE ?';
                queryParams.push(`%${filters.project_name}%`);
            }
            if (filters.status) {
                query += ' AND status = ?';
                queryParams.push(filters.status);
            }

            // 获取总数
            const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
            const [countResult] = await db.pool.query(countQuery, queryParams);
            const total = countResult[0].total;

            // 分页
            const offset = (page - 1) * limit;
            query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            queryParams.push(limit, offset);

            const [projects] = await db.pool.query(query, queryParams);

            return {
                projects,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error('获取在建工程列表失败:', error);
            throw error;
        }
    },

    /**
     * 获取单个在建工程详情
     */
    getCipProjectById: async (id) => {
        try {
            const [projects] = await db.pool.query('SELECT * FROM cip_projects WHERE id = ?', [id]);
            return projects.length > 0 ? projects[0] : null;
        } catch (error) {
            logger.error('获取在建工程详情失败:', error);
            throw error;
        }
    },

    /**
     * 创建在建工程
     */
    createCipProject: async (data) => {
        try {
            const [result] = await db.pool.query(
                `INSERT INTO cip_projects 
         (project_code, project_name, budget, accumulated_amount, start_date, estimated_end_date, status, responsible, department, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.project_code,
                    data.project_name,
                    data.budget || 0,
                    data.accumulated_amount || 0,
                    data.start_date || null,
                    data.estimated_end_date || null,
                    data.status || '建设中',
                    data.responsible || null,
                    data.department || null,
                    data.notes || null
                ]
            );
            return result.insertId;
        } catch (error) {
            logger.error('创建在建工程失败:', error);
            throw error;
        }
    },

    /**
     * 更新在建工程
     */
    updateCipProject: async (id, data) => {
        try {
            const fields = [];
            const values = [];

            Object.keys(data).forEach(key => {
                if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
                    fields.push(`${key} = ?`);
                    values.push(data[key]);
                }
            });

            if (fields.length === 0) return true;

            values.push(id);

            const [result] = await db.pool.query(
                `UPDATE cip_projects SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('更新在建工程失败:', error);
            throw error;
        }
    },

    /**
     * 删除在建工程
     */
    deleteCipProject: async (id) => {
        try {
            // 检查状态，只有建设中且无发生成本的才允许删除
            const [project] = await db.pool.query('SELECT * FROM cip_projects WHERE id = ?', [id]);
            if (project.length === 0) throw new Error('在建工程不存在');

            if (project[0].status !== '建设中' || project[0].accumulated_amount > 0) {
                throw new Error('该工程已有发生成本或已转固，不允许删除');
            }

            const [result] = await db.pool.query('DELETE FROM cip_projects WHERE id = ?', [id]);
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('删除在建工程失败:', error);
            throw error;
        }
    },

    /**
     * 将在建工程转为固定资产
     */
    transferToFixedAsset: async (id, assetData, userId) => {
        const connection = await db.pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. 检查工程状态
            const [projects] = await connection.query('SELECT * FROM cip_projects WHERE id = ? FOR UPDATE', [id]);
            if (projects.length === 0) throw new Error('在建工程不存在');

            const project = projects[0];
            if (project.status === '已转固') {
                throw new Error('该工程已经转固，不能重复操作');
            }

            // 强制资产原值等于工程归集成本
            const assetCost = parseFloat(project.accumulated_amount || 0);
            if (assetCost <= 0) {
                throw new Error('在建工程归集成本为0，不能转为无形/固定资产');
            }

            assetData.acquisition_cost = assetCost;
            assetData.current_value = assetCost;

            // 2. 插入新固定资产 (复用 assetsModel 的构建逻辑，或者直接执行 INSERT)
            // 为保持独立性，自己执行INSERT
            const [assetResult] = await connection.query(
                `INSERT INTO fixed_assets 
         (asset_code, asset_name, category_id, asset_type, acquisition_date, acquisition_cost, 
          salvage_value, current_value, useful_life, depreciation_method, status, 
          location_id, department_id, custodian, supplier_id, invoice_no, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', ?, ?, ?, ?, ?, ?)`,
                [
                    assetData.asset_code,
                    assetData.asset_name,
                    assetData.category_id || null,
                    assetData.asset_type || null,
                    assetData.acquisition_date || new Date(),
                    assetCost,
                    assetData.salvage_value || 0,
                    assetCost,
                    assetData.useful_life || 5, // 默认5年
                    assetData.depreciation_method || 'straight_line',
                    assetData.location_id || null, // 文本
                    assetData.department_id || null,
                    assetData.custodian || null,
                    assetData.supplier_id || null,
                    assetData.invoice_no || null,
                    `由在建工程 [${project.project_code}] ${project.project_name} 结转生成。${assetData.notes || ''}`
                ]
            );

            const newAssetId = assetResult.insertId;

            // 3. 记录固定资产变更日志
            await connection.query(
                `INSERT INTO asset_change_logs 
         (asset_id, change_type, change_date, changed_by, field_name, old_value, new_value, remarks)
         VALUES (?, '在建工程转固', ?, ?, 'status', null, 'in_use', ?)`,
                [
                    newAssetId,
                    assetData.acquisition_date || new Date(),
                    userId || 'system',
                    `从在建工程 ${project.project_name} 结转而来，结转金额: ${assetCost}`
                ]
            );

            // 4. 更新在建工程状态
            await connection.query(
                'UPDATE cip_projects SET status = ?, updated_at = NOW() WHERE id = ?',
                ['已转固', id]
            );

            // 如需，5. 这里可补充关联总账的【在建工程转固分录】（借:固定资产，贷:在建工程）

            await connection.commit();
            return newAssetId;
        } catch (error) {
            await connection.rollback();
            logger.error('在建工程转固失败:', error);
            throw error;
        } finally {
            connection.release();
        }
    }
};

module.exports = cipModel;
