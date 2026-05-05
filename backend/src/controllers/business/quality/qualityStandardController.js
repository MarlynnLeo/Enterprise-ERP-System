/**
 * qualityStandardController.js
 * @description 质量标准控制器 — 从 qualityController.js 拆分
 * @date 2026-03-03
 *
 * 职责范围：质量标准 CRUD、目标选项
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const QualityStandard = require('../../../models/qualityStandard');

const qualityStandardController = {
    /**
     * 获取质量标准列表
     */
    async getAllStandards(req, res) {
        try {
            const { page = 1, pageSize = 20, keyword, targetType, standardType, isActive } = req.query;

            const filters = {
                keyword,
                targetType,
                standardType,
                isActive: isActive !== undefined ? Boolean(isActive) : undefined,
            };

            const result = await QualityStandard.getStandards(
                filters, parseInt(page), parseInt(pageSize)
            );

            ResponseHandler.paginated(res, result.rows, result.total, parseInt(page), parseInt(pageSize));
        } catch (error) {
            logger.error('获取质量标准列表失败:', error);
            ResponseHandler.error(res, '获取质量标准列表失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取质量标准详情
     */
    async getStandardById(req, res) {
        try {
            const { id } = req.params;

            const standard = await QualityStandard.getStandardById(parseInt(id));

            if (!standard) {
                return ResponseHandler.error(res, '质量标准不存在', 'NOT_FOUND', 404);
            }

            ResponseHandler.success(res, standard, '操作成功');
        } catch (error) {
            logger.error('获取质量标准详情失败:', error);
            ResponseHandler.error(res, '获取质量标准详情失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 创建质量标准
     */
    async createStandard(req, res) {
        try {
            const standard = req.body;

            if (
                !standard.standard_no ||
                !standard.standard_name ||
                !standard.standard_type ||
                !standard.target_type ||
                !standard.target_id ||
                !standard.version
            ) {
                return ResponseHandler.error(
                    res,
                    '标准编号、标准名称、标准类型、适用对象类型、适用对象ID和版本号不能为空',
                    'BAD_REQUEST',
                    400
                );
            }

            const result = await QualityStandard.createStandard(standard);

            ResponseHandler.success(res, result, '质量标准创建成功');
        } catch (error) {
            logger.error('创建质量标准失败:', error);
            ResponseHandler.error(res, '创建质量标准失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 更新质量标准
     */
    async updateStandard(req, res) {
        try {
            const { id } = req.params;
            const data = req.body;

            const standard = await QualityStandard.getStandardById(parseInt(id));
            if (!standard) {
                return ResponseHandler.error(res, '质量标准不存在', 'NOT_FOUND', 404);
            }

            const result = await QualityStandard.updateStandard(parseInt(id), data);

            ResponseHandler.success(res, result, '质量标准更新成功');
        } catch (error) {
            logger.error('更新质量标准失败:', error);
            ResponseHandler.error(res, '更新质量标准失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 删除质量标准
     */
    async deleteStandard(req, res) {
        try {
            const { id } = req.params;

            const standard = await QualityStandard.getStandardById(parseInt(id));
            if (!standard) {
                return ResponseHandler.error(res, '质量标准不存在', 'NOT_FOUND', 404);
            }

            const result = await QualityStandard.deleteStandard(parseInt(id));

            ResponseHandler.success(res, result, '质量标准删除成功');
        } catch (error) {
            logger.error('删除质量标准失败:', error);
            ResponseHandler.error(res, '删除质量标准失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取目标选项
     */
    async getTargetOptions(req, res) {
        try {
            const { targetType } = req.params;

            if (!['material', 'product', 'process'].includes(targetType)) {
                return ResponseHandler.error(res, '目标类型参数错误', 'BAD_REQUEST', 400);
            }

            const options = await QualityStandard.getTargetOptions(targetType);

            ResponseHandler.success(res, options, '操作成功');
        } catch (error) {
            logger.error('获取目标选项失败:', error);
            ResponseHandler.error(res, '获取目标选项失败', 'SERVER_ERROR', 500, error);
        }
    },
};

module.exports = qualityStandardController;
