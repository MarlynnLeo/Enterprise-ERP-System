/**
 * cip.js
 * @description 在建工程(CIP)数据模型
 * @date 2025-08-27
 */

const db = require('../config/db');
const { logger } = require('../utils/logger');
const financeModel = require('./finance');
const DocumentLinkService = require('../services/business/DocumentLinkService');

function mapAssetType(value) {
    const typeMap = {
        machine: '机器设备',
        electronic: '电子设备',
        furniture: '办公家具',
        building: '房屋建筑',
        vehicle: '车辆',
        other: '其他',
        机器设备: '机器设备',
        电子设备: '电子设备',
        办公家具: '办公家具',
        房屋建筑: '房屋建筑',
        车辆: '车辆',
        其他: '其他',
    };
    return typeMap[value] || '其他';
}

function mapDepreciationMethod(value) {
    const methodMap = {
        straight_line: '直线法',
        double_declining: '双倍余额递减法',
        sum_of_years: '年数总和法',
        units_of_production: '工作量法',
        no_depreciation: '不计提',
        直线法: '直线法',
        双倍余额递减法: '双倍余额递减法',
        年数总和法: '年数总和法',
        工作量法: '工作量法',
        不计提: '不计提',
    };
    return methodMap[value] || '直线法';
}

async function getOpenAccountingPeriodId(connection, accountingDate) {
    const [periods] = await connection.execute(
        `SELECT id FROM gl_periods
         WHERE is_closed = 0
           AND start_date <= ?
           AND end_date >= ?
         ORDER BY start_date DESC
         LIMIT 1`,
        [accountingDate, accountingDate]
    );

    if (periods.length === 0) {
        throw new Error(`未找到日期 ${accountingDate} 对应的开放会计期间`);
    }

    return periods[0].id;
}

async function getRequiredAccountId(connection, accountCode, accountName) {
    const [rows] = await connection.execute(
        'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = 1 LIMIT 1',
        [accountCode]
    );

    if (rows.length === 0) {
        throw new Error(`在建工程转固缺少${accountName}科目(${accountCode})`);
    }

    return rows[0].id;
}

async function getEntryNumberById(connection, entryId) {
    const [entries] = await connection.execute(
        'SELECT entry_number FROM gl_entries WHERE id = ?',
        [entryId]
    );
    return entries[0]?.entry_number || null;
}


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
    transferToFixedAsset: async (id, assetData, operator = {}) => {
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
            const acquisitionDate = assetData.acquisition_date || new Date().toISOString().slice(0, 10);
            const usefulLifeMonths = Math.max(1, Number.parseInt(assetData.useful_life, 10) || 5) * 12;
            const assetType = mapAssetType(assetData.asset_type);
            const depreciationMethod = mapDepreciationMethod(assetData.depreciation_method);
            const operatorName = operator.operatorName || String(operator.userId || operator || 'system');
            const createdBy = operator.userId || operator;

            // 2. 插入新固定资产 (复用 assetsModel 的构建逻辑，或者直接执行 INSERT)
            // 为保持独立性，自己执行INSERT
            const [assetResult] = await connection.query(
                `INSERT INTO fixed_assets
         (asset_code, asset_name, category_id, asset_type, acquisition_date, acquisition_cost,
          salvage_value, current_value, net_value, useful_life, depreciation_method, status,
          location_id, department_id, custodian, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '在用', ?, ?, ?, ?)`,
                [
                    assetData.asset_code,
                    assetData.asset_name,
                    assetData.category_id || null,
                    assetType,
                    acquisitionDate,
                    assetCost,
                    assetData.salvage_value || 0,
                    assetCost,
                    assetCost,
                    usefulLifeMonths,
                    depreciationMethod,
                    assetData.location_id || null, // 文本
                    assetData.department_id || null,
                    assetData.custodian || null,
                    `由在建工程 [${project.project_code}] ${project.project_name} 结转生成。${assetData.notes || ''}`
                ]
            );

            const newAssetId = assetResult.insertId;

            // 3. 记录固定资产变更日志
            await connection.query(
                `INSERT INTO asset_change_logs
         (asset_id, change_type, change_date, changed_by, field_name, old_value, new_value, remarks)
         VALUES (?, '在建工程转固', ?, ?, 'status', null, '在用', ?)`,
                [
                    newAssetId,
                    acquisitionDate,
                    operatorName,
                    `从在建工程 ${project.project_name} 结转而来，结转金额: ${assetCost}`
                ]
            );

            const fixedAssetAccountId = await getRequiredAccountId(connection, '1601', '固定资产');
            const cipAccountId = await getRequiredAccountId(connection, '1604', '在建工程');
            const periodId = await getOpenAccountingPeriodId(connection, acquisitionDate);

            const entryId = await financeModel.createEntry(
                {
                    entry_date: acquisitionDate,
                    posting_date: acquisitionDate,
                    document_type: '转固单',
                    document_number: `CIP-${project.project_code}`.slice(0, 50),
                    period_id: periodId,
                    description: `在建工程转固: ${project.project_name} -> ${assetData.asset_name}`,
                    created_by: createdBy,
                    status: 'posted',
                    is_posted: 1,
                },
                [
                    {
                        account_id: fixedAssetAccountId,
                        debit_amount: assetCost,
                        credit_amount: 0,
                        description: `固定资产转入 - ${assetData.asset_name}`,
                    },
                    {
                        account_id: cipAccountId,
                        debit_amount: 0,
                        credit_amount: assetCost,
                        description: `在建工程转出 - ${project.project_name}`,
                    },
                ],
                connection
            );
            const entryNumber = await getEntryNumberById(connection, entryId);

            await DocumentLinkService.tryAutoLink(
                'cip_project',
                project.id,
                project.project_code,
                'asset',
                newAssetId,
                assetData.asset_code,
                createdBy,
                connection
            );
            await DocumentLinkService.tryAutoLink(
                'cip_project',
                project.id,
                project.project_code,
                'finance_voucher',
                entryId,
                entryNumber,
                createdBy,
                connection
            );
            await DocumentLinkService.tryAutoLink(
                'asset',
                newAssetId,
                assetData.asset_code,
                'finance_voucher',
                entryId,
                entryNumber,
                createdBy,
                connection
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
