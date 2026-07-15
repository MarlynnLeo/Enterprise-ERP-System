/**
 * inspectionController.js
 * @description 质量检验控制器 — 从 qualityController.js 拆分
 * @date 2026-03-03
 *
 * 职责范围：IQC / IPQC / FQC 列表、详情、CRUD、引用数据、批次号查询、
 *           检验项目获取、检验单状态变更(含追溯)、未关联质检记录
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const QualityInspection = require('../../../models/qualityInspection');
const db = require('../../../config/db');
const businessConfig = require('../../../config/businessConfig');
const { parsePagination, appendPaginationSQL } = require('../../../utils/safePagination');

// 从统一配置获取状态常量
const STATUS = {
    QUALITY: businessConfig.status.inspection,
};

const InspectionClosureService = require('../../../services/quality/InspectionClosureService');

/**
 * [内部] 通用检验列表查询方法
 * @param {string} type - 检验类型: incoming, process, final
 * @param {object} req - 请求对象
 * @param {object} res - 响应对象
 * @param {object} extraFilters - 额外的过滤选项（如 include_supplier）
 */
async function _getInspectionsByType(type, req, res, extraFilters = {}) {
    try {
        const {
            page = 1,
            keyword, status, startDate, endDate,
        } = req.query;

        const ScopeGuard = require('../../../authorization/ScopeGuard');
        const scopeClause = await ScopeGuard.applyListScope(req, 'quality_inspection', {
            tableAlias: 'qi',
            ownerAlias: 'quality_inspection_owner_scope',
        });

        const filters = { keyword, status, startDate, endDate, scopeClause, ...extraFilters };

        const pagination = parsePagination(page, req.query.limit ?? req.query.pageSize, {
            defaultPageSize: 20,
            maxPageSize: 100,
        });
        const result = await QualityInspection.getInspections(type, filters, pagination.page, pagination.pageSize);

        const safeResult = {
            rows: result?.rows || [],
            total: result?.total || 0,
        };

        ResponseHandler.paginated(res, safeResult.rows, safeResult.total, pagination.page, pagination.pageSize);
    } catch (error) {
        logger.error(`获取${type}检验列表失败:`, error);
        ResponseHandler.error(res, `获取检验列表失败`, 'SERVER_ERROR', 500, error);
    }
}

async function _getInspectionStatsByType(type, req, res) {
    try {
        const [rows] = await db.pool.query(
            `SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial,
                SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) as review,
                SUM(CASE WHEN status = 'rework' THEN 1 ELSE 0 END) as rework
             FROM quality_inspections
             WHERE inspection_type = ?
               AND deleted_at IS NULL`,
            [type]
        );

        const stats = rows[0] || {};
        Object.keys(stats).forEach((key) => {
            stats[key] = Number(stats[key]) || 0;
        });

        ResponseHandler.success(res, stats, 'OK');
    } catch (error) {
        logger.error(`get ${type} inspection stats failed:`, error);
        ResponseHandler.error(res, '获取检验统计失败', 'SERVER_ERROR', 500, error);
    }
}

const inspectionController = {
    /**
     * 获取来料检验列表
     */
    async getIncomingInspections(req, res) {
        const { include_supplier, include_reference, with_details } = req.query;
        return _getInspectionsByType('incoming', req, res, {
            include_supplier: include_supplier === 'true',
            include_reference: include_reference === 'true',
            with_details: with_details === 'true',
        });
    },

    async getIncomingInspectionStats(req, res) {
        return _getInspectionStatsByType('incoming', req, res);
    },

    /**
     * 获取过程检验列表
     */
    async getProcessInspections(req, res) {
        return _getInspectionsByType('process', req, res);
    },

    async getProcessInspectionStats(req, res) {
        return _getInspectionStatsByType('process', req, res);
    },

    /**
     * 获取成品检验列表
     */
    async getFinalInspections(req, res) {
        return _getInspectionsByType('final', req, res);
    },

    async getFinalInspectionStats(req, res) {
        return _getInspectionStatsByType('final', req, res);
    },

    /**
     * 获取检验单详情
     */
    async getInspectionById(req, res) {
        try {
            const { id } = req.params;
            const { include_supplier, include_reference, with_details } = req.query;

            const ScopeGuard = require('../../../authorization/ScopeGuard');
            if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, 'quality_inspection', id, '无权访问该检验单'))) {
                return;
            }

            const options = {
                include_supplier: include_supplier === 'true',
                include_reference: include_reference === 'true',
                with_details: with_details === 'true',
            };

            const inspection = await QualityInspection.getInspectionById(parseInt(id), options);

            if (!inspection) {
                return ResponseHandler.error(res, '检验单不存在', 'NOT_FOUND', 404);
            }

            ResponseHandler.success(res, inspection, '操作成功');
        } catch (error) {
            logger.error('获取检验单详情失败:', error);
            ResponseHandler.error(res, '获取检验单详情失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 创建检验单
     */
    async createInspection(req, res) {
        let connection;
        try {
            const inspection = req.body;

            if (!inspection.inspection_type) {
                return ResponseHandler.error(res, '检验类型不能为空', 'VALIDATION_ERROR', 400);
            }

            if (
                !inspection.batch_no ||
                !inspection.quantity ||
                !inspection.unit ||
                !inspection.planned_date
            ) {
                return ResponseHandler.error(
                    res,
                    '批次号、检验数量、单位和计划检验日期不能为空',
                    'VALIDATION_ERROR',
                    400
                );
            }

            connection = await db.pool.getConnection();
            await connection.beginTransaction();

            // owner 闭环：无 inspector_id 时强制当前登录用户
            if (!inspection.inspector_id) {
                const ScopeGuard = require('../../../authorization/ScopeGuard');
                const stamp = ScopeGuard.tryStampOwner(req, 'quality_inspection');
                inspection.inspector_id = stamp.inspector_id;
            }

            const result = await QualityInspection.createInspection(inspection, connection);

            // 【免检逻辑】如果被系统自动通过（免检来料），统一走质检闭环
            if (result.is_exempt && result.inspection_type === 'incoming') {
                const closureResult = await InspectionClosureService.closeIfTerminal(
                    result,
                    {
                        id: result.id,
                        status: STATUS.QUALITY.PASSED,
                        qualified_quantity: result.quantity || inspection.quantity,
                        unqualified_quantity: 0,
                    },
                    connection
                );
                Object.assign(result, closureResult);
            }

            await connection.commit();
            ResponseHandler.success(res, result, result.is_exempt ? '系统检测到免检验属性，成功自动放行！' : '检验单创建成功');
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            logger.error('创建检验单失败:', error);
            const statusCode = error.statusCode || 500;
            const errorCode = error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
            const message = statusCode === 400 ? error.message : '创建检验单失败';
            ResponseHandler.error(res, message, errorCode, statusCode, error);
        } finally {
            if (connection) {
                connection.release();
            }
        }
    },

    /**
     * 更新检验单
     */
    async updateInspection(req, res) {
        let connection;
        try {
            const { id } = req.params;
            const data = req.body;

            connection = await db.pool.getConnection();
            await connection.beginTransaction();

            const [inspectionRows] = await connection.query(
                'SELECT id, inspection_no, inspection_type, reference_id, reference_no, material_id, supplier_id, product_id, product_name, product_code, process_id, process_name, batch_no, quantity, qualified_quantity, unqualified_quantity, unit, unit_id, status, planned_date, actual_date, inspector_id, inspector_name, punch_time, standard_type, standard_no, template_id, note, created_at, updated_at, traceability_id, traceability_batch, chain_id, chain_step_id, is_first_article, first_article_qty, is_full_inspection, first_article_result, production_can_continue, task_id, is_aql, aql_standard_id, aql_level, accept_limit, reject_limit, deleted_at FROM quality_inspections WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
                [parseInt(id)]
            );

            if (!inspectionRows || inspectionRows.length === 0) {
                await connection.rollback();
                return ResponseHandler.error(res, '检验单不存在', 'NOT_FOUND', 404);
            }

            const inspection = inspectionRows[0];
            const [items] = await connection.query(
                'SELECT id, inspection_id, item_name, standard, type, is_critical, dimension_value, tolerance_upper, tolerance_lower, actual_value, measure_1, measure_2, measure_3, measure_4, measure_5, measure_6, method, result, is_qualified, remark, created_at, updated_at FROM quality_inspection_items WHERE inspection_id = ? ORDER BY id',
                [parseInt(id)]
            );
            inspection.items = items;

            // 如果状态从待检验变为其他状态，设置实际检验日期
            if (
                inspection.status === STATUS.QUALITY.PENDING &&
                data.status &&
                data.status !== STATUS.QUALITY.PENDING &&
                !data.actual_date
            ) {
                data.actual_date = new Date();
            }
            const result = await QualityInspection.updateInspection(parseInt(id), data, connection);

            const needsClosure =
                (data.status && InspectionClosureService.isTerminalStatus(data.status)) ||
                (
                    InspectionClosureService.isTerminalStatus(inspection.status) &&
                    (
                        Object.prototype.hasOwnProperty.call(data, 'quantity') ||
                        Object.prototype.hasOwnProperty.call(data, 'qualified_quantity') ||
                        Object.prototype.hasOwnProperty.call(data, 'unqualified_quantity')
                    )
                );

            if (needsClosure) {
                const closureResult = await InspectionClosureService.closeIfTerminal(
                    inspection,
                    { ...data, id: parseInt(id) },
                    connection
                );
                Object.assign(result, closureResult);
            }

            await connection.commit();
            ResponseHandler.success(res, result, '检验单更新成功');
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            logger.error('更新检验单失败:', error);
            const statusCode = error.statusCode || 500;
            const errorCode = error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
            const message = statusCode === 400 ? error.message : '更新检验单失败';
            ResponseHandler.error(res, message, errorCode, statusCode, error);
        } finally {
            if (connection) {
                connection.release();
            }
        }
    },

    /**
     * 删除检验单
     */
    async deleteInspection(req, res) {
        try {
            const { id } = req.params;

            const inspection = await QualityInspection.getInspectionById(parseInt(id));
            if (!inspection) {
                return ResponseHandler.error(res, '检验单不存在', 'NOT_FOUND', 404);
            }

            if (inspection.status !== 'pending') {
                return ResponseHandler.error(res, '只有待检验状态的检验单才能删除', 'VALIDATION_ERROR', 400);
            }

            const result = await QualityInspection.deleteInspection(parseInt(id));

            ResponseHandler.success(res, result, '检验单删除成功');
        } catch (error) {
            logger.error('删除检验单失败:', error);
            ResponseHandler.error(res, '删除检验单失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取检验相关的引用数据
     */
    async getReferenceData(req, res) {
        try {
            const { type } = req.params;

            if (!['incoming', 'process', 'final'].includes(type)) {
                return ResponseHandler.error(res, '检验类型参数错误', 'VALIDATION_ERROR', 400);
            }

            const data = await QualityInspection.getReferenceData(type);

            return ResponseHandler.success(res, { success: true, data });
        } catch (error) {
            logger.error('获取引用数据失败:', error);
            ResponseHandler.error(res, '获取引用数据失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取检验标准
     */
    async getStandards(req, res) {
        try {
            const { type, targetId } = req.params;

            if (!['incoming', 'process', 'final'].includes(type) || !targetId) {
                return ResponseHandler.error(res, '参数错误', 'VALIDATION_ERROR', 400);
            }

            const standards = await QualityInspection.getStandards(type, parseInt(targetId));

            ResponseHandler.success(res, standards, '操作成功');
        } catch (error) {
            logger.error('获取检验标准失败:', error);
            ResponseHandler.error(res, '获取检验标准失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取检验单项目
     */
    async getInspectionItems(req, res) {
        try {
            const { id } = req.params;

            const connection = await db.pool.getConnection();
            try {
                const [inspectionRows] = await connection.query(
                    'SELECT id FROM quality_inspections WHERE id = ? AND deleted_at IS NULL',
                    [id]
                );
                if (!inspectionRows || inspectionRows.length === 0) {
                    return ResponseHandler.error(res, '检验单不存在', 'NOT_FOUND', 404);
                }

                const [items] = await connection.query(
                    'SELECT id, inspection_id, item_name, standard, type, is_critical, dimension_value, tolerance_upper, tolerance_lower, actual_value, measure_1, measure_2, measure_3, measure_4, measure_5, measure_6, method, result, is_qualified, remark, created_at, updated_at FROM quality_inspection_items WHERE inspection_id = ? ORDER BY id',
                    [id]
                );

                ResponseHandler.success(res, items, '操作成功');
            } catch (error) {
                logger.error('查询检验项目失败:', error);
                throw error;
            } finally {
                connection.release();
            }
        } catch (error) {
            logger.error('获取检验单项目失败:', error);
            ResponseHandler.error(res, '获取检验单项目失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 更新检验单状态并创建追溯记录 (Transaction Safe)
     */
    async updateInspectionStatusAndTrace(req, res) {
        try {
            const { id } = req.params;
            const { status, result, remarks, batch_number, qualified_quantity, unqualified_quantity } = req.body;

            if (!id || !status) {
                return ResponseHandler.error(res, '检验单ID和状态不能为空', 'VALIDATION_ERROR', 400);
            }

            const InspectionService = require('../../../services/quality/inspectionService');
            const serviceResult = await InspectionService.updateInspectionStatusAndTrace(id, {
                status, result, remarks, batch_number, qualified_quantity, unqualified_quantity
            });

            if (serviceResult.traceError) {
                return ResponseHandler.success(
                    res,
                    { ...serviceResult.updatedData, traceError: serviceResult.traceError },
                    '检验单状态更新成功，但创建追溯记录出现警告'
                );
            }

            return ResponseHandler.success(res, serviceResult.updatedData, '检验单状态更新成功');
        } catch (error) {
            logger.error('更新检验单状态失败:', error);
            const statusCode = error.statusCode || 500;
            const errorCode = error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
            const message = statusCode === 400 ? error.message : '更新检验单状态失败';
            ResponseHandler.error(res, message, errorCode, statusCode, error);
        }
    },

    /**
     * 获取未关联到追溯记录的质检记录列表
     */
    async getUnlinkedInspections(req, res) {
        try {
            const { materialId, productCode, batchNumber, page = 1, pageSize = 20 } = req.query;

            let whereClause = 'WHERE qi.deleted_at IS NULL AND qi.traceability_id IS NULL';
            const params = [];

            if (materialId) {
                whereClause += ' AND qi.material_id = ?';
                params.push(materialId);
            }

            if (productCode) {
                whereClause += ' AND (qi.product_code = ? OR m.code = ?)';
                params.push(productCode, productCode);
            }

            if (batchNumber) {
                whereClause += ' AND qi.batch_no = ?';
                params.push(batchNumber);
            }

            const pagination = parsePagination(page, pageSize, {
                defaultPageSize: 20,
                maxPageSize: 100,
            });

            const countQuery = `
        SELECT COUNT(*) as total
        FROM quality_inspections qi
        LEFT JOIN materials m ON qi.material_id = m.id
        ${whereClause}
      `;

            const countResult = await db.query(countQuery, params);
            const total =
                countResult.rows && countResult.rows.length > 0 ? parseInt(countResult.rows[0].total) : 0;

            const query = appendPaginationSQL(`
        SELECT
          qi.id, qi.inspection_no, qi.inspection_type, qi.batch_no, qi.material_id,
          m.code AS material_code, m.name AS material_name,
          qi.product_code, qi.product_name, qi.inspector_name,
          qi.actual_date, qi.status, qi.created_at, qi.updated_at
        FROM quality_inspections qi
        LEFT JOIN materials m ON qi.material_id = m.id
        ${whereClause}
        ORDER BY qi.actual_date DESC
      `, pagination.limit, pagination.offset);

            const result = await db.query(query, params);
            const inspections = result.rows || [];

            return ResponseHandler.success(res, {
                    inspections,
                    pagination: {
                        total,
                        page: pagination.page,
                        pageSize: pagination.pageSize,
                        totalPages: Math.ceil(total / pagination.pageSize),
                    },
                });
        } catch (error) {
            logger.error('获取未关联质检记录失败:', error);
            ResponseHandler.error(res, '获取未关联质检记录失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 根据批次号查询检验单
     */
    async getInspectionByBatchNo(req, res) {
        try {
            const { batchNo } = req.params;

            if (!batchNo) {
                return ResponseHandler.error(res, '批次号不能为空', 'VALIDATION_ERROR', 400);
            }

            const pool = db.pool;

            const [inspections] = await pool.query(
                `
        SELECT
          qi.id, qi.inspection_no, qi.inspection_type, qi.batch_no, qi.material_id,
          m.code AS material_code, m.name AS material_name,
          qi.product_id, qi.product_code, qi.product_name,
          qi.quantity, qi.unit, qi.status, qi.inspector_name,
          qi.actual_date, qi.planned_date, qi.note,
          qi.created_at, qi.updated_at, qi.reference_id, qi.reference_no,
          qi.supplier_id, s.name AS supplier_name
        FROM quality_inspections qi
        LEFT JOIN materials m ON qi.material_id = m.id
        LEFT JOIN suppliers s ON qi.supplier_id = s.id
        WHERE qi.batch_no = ?
          AND qi.deleted_at IS NULL
        ORDER BY qi.created_at DESC
      `,
                [batchNo]
            );

            if (inspections.length === 0) {
                return ResponseHandler.error(res, `未找到批次号为 ${batchNo} 的检验单`, 'NOT_FOUND', 404);
            }

            const mainInspection = inspections[0];
            const historyInspections = inspections.slice(1);

            const [items] = await pool.query(
                'SELECT id, inspection_id, item_name, standard, type, is_critical, dimension_value, tolerance_upper, tolerance_lower, actual_value, measure_1, measure_2, measure_3, measure_4, measure_5, measure_6, method, result, is_qualified, remark, created_at, updated_at FROM quality_inspection_items WHERE inspection_id = ? ORDER BY id ASC',
                [mainInspection.id]
            );

            mainInspection.items = items;
            mainInspection.history = historyInspections;

            ResponseHandler.success(res, mainInspection, '查询成功');
        } catch (error) {
            logger.error('根据批次号查询检验单失败:', error);
            ResponseHandler.error(res, '查询检验单失败', 'SERVER_ERROR', 500, error);
        }
    },
};

module.exports = inspectionController;
