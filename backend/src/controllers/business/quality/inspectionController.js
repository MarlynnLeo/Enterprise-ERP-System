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

// 从统一配置获取状态常量
const STATUS = {
    QUALITY: businessConfig.status.inspection,
};

// 采购入库单服务（免检自动入库等）
const PurchaseReceiptService = require('../../../services/quality/PurchaseReceiptService');

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
            page = 1, limit = 20, pageSize = 20,
            keyword, status, startDate, endDate,
        } = req.query;

        const filters = { keyword, status, startDate, endDate, ...extraFilters };

        const actualPageSize = db.ensureNumber(limit || pageSize, 20);
        const actualPage = db.ensureNumber(page, 1);

        if (actualPage < 1 || actualPageSize < 1 || actualPageSize > 1000) {
            return ResponseHandler.error(res, '页码或每页条数参数无效', 'BAD_REQUEST', 400);
        }

        const result = await QualityInspection.getInspections(type, filters, actualPage, actualPageSize);

        const safeResult = {
            rows: result?.rows || [],
            total: result?.total || 0,
        };

        ResponseHandler.paginated(res, safeResult.rows, safeResult.total, actualPage, actualPageSize);
    } catch (error) {
        logger.error(`获取${type}检验列表失败:`, error);
        ResponseHandler.error(res, `获取检验列表失败`, 'SERVER_ERROR', 500, error);
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

    /**
     * 获取过程检验列表
     */
    async getProcessInspections(req, res) {
        return _getInspectionsByType('process', req, res);
    },

    /**
     * 获取成品检验列表
     */
    async getFinalInspections(req, res) {
        return _getInspectionsByType('final', req, res);
    },

    /**
     * 获取检验单详情
     */
    async getInspectionById(req, res) {
        try {
            const { id } = req.params;
            const { include_supplier, include_reference, with_details } = req.query;

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
        try {
            const inspection = req.body;

            if (!inspection.inspection_type) {
                return ResponseHandler.error(res, '检验类型不能为空', 'BAD_REQUEST', 400);
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
                    'BAD_REQUEST',
                    400
                );
            }

            const result = await QualityInspection.createInspection(inspection);

            // 【免检逻辑】如果被系统自动通过（免检来料），同步采购订单状态 + 自动创建入库单
            if (result.is_exempt && result.inspection_type === 'incoming') {
                const referenceId = result.reference_id || inspection.reference_id;
                const materialId = result.material_id || inspection.material_id;
                const qty = result.quantity || inspection.quantity;

                // 1. 回写采购订单QC数量
                try {
                    const PurchaseOrderStatusService = require('../../../services/business/PurchaseOrderStatusService');
                    await PurchaseOrderStatusService.handleInspectionComplete({
                        reference_type: 'purchase_order',
                        reference_id: referenceId,
                        material_id: materialId,
                        quantity: qty,
                        qualified_quantity: qty,
                        unqualified_quantity: 0
                    });
                    logger.info(`✅ 免检单 ${result.inspection_no} 已自动回写采购订单 QC数量`);
                } catch (serviceErr) {
                    logger.warn(`⚠️ 免检单 ${result.inspection_no} 回写采购订单QC数量失败:`, serviceErr.message);
                }

                // 2. 自动创建采购入库单（与前端手动检验合格后点击"创建入库单"效果一致）
                try {
                    await PurchaseReceiptService.autoCreateFromInspection(result, inspection);
                    logger.info(`✅ 免检单 ${result.inspection_no} 已自动创建采购入库单`);
                } catch (receiptErr) {
                    logger.warn(`⚠️ 免检单 ${result.inspection_no} 自动创建采购入库单失败:`, receiptErr.message);
                }
            }

            ResponseHandler.success(res, result, result.is_exempt ? '系统检测到免检验属性，成功自动放行！' : '检验单创建成功');
        } catch (error) {
            logger.error('创建检验单失败:', error);
            ResponseHandler.error(res, '创建检验单失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 更新检验单
     */
    async updateInspection(req, res) {
        try {
            const { id } = req.params;
            const data = req.body;

            const inspection = await QualityInspection.getInspectionById(parseInt(id));
            if (!inspection) {
                return ResponseHandler.error(res, '检验单不存在', 'NOT_FOUND', 404);
            }

            // 如果状态从待检验变为其他状态，设置实际检验日期
            if (
                inspection.status === STATUS.QUALITY.PENDING &&
                data.status &&
                data.status !== STATUS.QUALITY.PENDING &&
                !data.actual_date
            ) {
                data.actual_date = new Date();
            }

            const result = await QualityInspection.updateInspection(parseInt(id), data);

            // 如果检验状态变为终态，触发不合格品自动创建与合格品的流转
            if (
                data.status &&
                (data.status === STATUS.QUALITY.COMPLETED ||
                    data.status === STATUS.QUALITY.PASSED ||
                    data.status === STATUS.QUALITY.FAILED ||
                    data.status === STATUS.QUALITY.PARTIAL)
            ) {
                const updatedInspection = { ...inspection, ...data };

                // 1. 如果有不合格品，自动创建不合格品记录（已内置幂等校验）
                if (data.unqualified_quantity && data.unqualified_quantity > 0) {
                    try {
                        const NonconformingProductService = require('../../../services/business/NonconformingProductService');
                        await NonconformingProductService.autoCreateFromInspection(updatedInspection);
                        logger.info(`Auto-created NCP for inspection ${inspection.inspection_no}`);
                    } catch (ncpError) {
                        logger.error('Failed to auto-create NCP:', ncpError);
                    }
                }

                // 2. [业务闭环修复] 如果是来料检验且有合格品，需打通采购域
                if (
                    inspection.inspection_type === 'incoming' &&
                    ['passed', 'partial', 'completed'].includes(data.status) &&
                    data.qualified_quantity > 0
                ) {
                    try {
                        // 回写采购订单 QC 数量
                        const PurchaseOrderStatusService = require('../../../services/business/PurchaseOrderStatusService');
                        await PurchaseOrderStatusService.handleInspectionComplete({
                            reference_type: 'purchase_order',
                            reference_id: inspection.reference_id,
                            material_id: inspection.material_id,
                            quantity: inspection.quantity,
                            qualified_quantity: data.qualified_quantity || 0,
                            unqualified_quantity: data.unqualified_quantity || 0
                        });
                        logger.info(`✅ 来料检验单 ${inspection.inspection_no} 已自动回写采购订单 QC数量`);

                        // 自动创建采购入库单
                        const PurchaseReceiptService = require('../../../services/quality/PurchaseReceiptService');
                        await PurchaseReceiptService.autoCreateFromInspection(updatedInspection, inspection);
                        logger.info(`✅ 来料检验单 ${inspection.inspection_no} 已自动创建采购入库单`);
                    } catch (loopError) {
                        logger.warn(`⚠️ 来料检验单 ${inspection.inspection_no} 业务闭环联动失败:`, loopError.message);
                    }
                }
            }

            ResponseHandler.success(res, result, '检验单更新成功');
        } catch (error) {
            logger.error('更新检验单失败:', error);
            ResponseHandler.error(res, '更新检验单失败', 'SERVER_ERROR', 500, error);
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
                return ResponseHandler.error(res, '只有待检验状态的检验单才能删除', 'BAD_REQUEST', 400);
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
                return ResponseHandler.error(res, '检验类型参数错误', 'BAD_REQUEST', 400);
            }

            const data = await QualityInspection.getReferenceData(type);

            res.json({ success: true, data });
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
                return ResponseHandler.error(res, '参数错误', 'BAD_REQUEST', 400);
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
                const [items] = await connection.query(
                    'SELECT * FROM quality_inspection_items WHERE inspection_id = ? ORDER BY id',
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
                return ResponseHandler.error(res, '检验单ID和状态不能为空', 'BAD_REQUEST', 400);
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
            ResponseHandler.error(res, '更新检验单状态失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取未关联到追溯记录的质检记录列表
     */
    async getUnlinkedInspections(req, res) {
        try {
            const { materialId, productCode, batchNumber, page = 1, pageSize = 20 } = req.query;

            let whereClause = 'WHERE qi.traceability_id IS NULL';
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

            const actualPageSize = parseInt(pageSize);
            const offset = (parseInt(page) - 1) * actualPageSize;

            const countQuery = `
        SELECT COUNT(*) as total
        FROM quality_inspections qi
        LEFT JOIN materials m ON qi.material_id = m.id
        ${whereClause}
      `;

            const countResult = await db.query(countQuery, params);
            const total =
                countResult.rows && countResult.rows.length > 0 ? parseInt(countResult.rows[0].total) : 0;

            const query = `
        SELECT
          qi.id, qi.inspection_no, qi.inspection_type, qi.batch_no, qi.material_id,
          m.code AS material_code, m.name AS material_name,
          qi.product_code, qi.product_name, qi.inspector_name,
          qi.actual_date, qi.status, qi.created_at, qi.updated_at
        FROM quality_inspections qi
        LEFT JOIN materials m ON qi.material_id = m.id
        ${whereClause}
        ORDER BY qi.actual_date DESC
        LIMIT ${actualPageSize} OFFSET ${offset}
      `;

            const result = await db.query(query, params);
            const inspections = result.rows || [];

            res.json({
                success: true,
                data: {
                    inspections,
                    pagination: {
                        total,
                        page: parseInt(page),
                        pageSize: parseInt(pageSize),
                        totalPages: Math.ceil(total / pageSize),
                    },
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
                return ResponseHandler.error(res, '批次号不能为空', 'BAD_REQUEST', 400);
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
                'SELECT * FROM quality_inspection_items WHERE inspection_id = ? ORDER BY id ASC',
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
