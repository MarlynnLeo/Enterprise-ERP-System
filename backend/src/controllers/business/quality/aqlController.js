const AqlService = require('../../../services/quality/aqlService');
const { ResponseHandler } = require('../../../utils/responseHandler');
const logger = require('../../../utils/logger');

class AqlController {
    /**
     * 创建 AQL 标准
     */
    async createStandard(req, res) {
        try {
            const data = req.body;
            const creatorId = req.user?.id || null;

            if (!data.code || !data.name || !data.sample_size || !data.aql_level) {
                return ResponseHandler.error(res, 'Missing required AQL fields', 'VALIDATION_ERROR', 400);
            }

            const standard = await AqlService.createStandard(data, creatorId);
            return ResponseHandler.success(res, standard, 'AQL 标准创建成功');
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return ResponseHandler.error(res, '标准代码已存在', 'CONFLICT', 409);
            }
            logger.error('Error creating AQL standard:', error);
            return ResponseHandler.error(res, '创建失败', 'SERVER_ERROR', 500, error);
        }
    }

    /**
     * 更新 AQL 标准
     */
    async updateStandard(req, res) {
        try {
            const { id } = req.params;
            const data = req.body;

            // 防止误更新关键字段
            delete data.id;
            delete data.code;

            const standard = await AqlService.updateStandard(id, data);
            return ResponseHandler.success(res, standard, 'AQL 标准更新成功');
        } catch (error) {
            if (error.message === 'AQL Standard not found') {
                return ResponseHandler.error(res, '标准不存在', 'NOT_FOUND', 404);
            }
            logger.error('Error updating AQL standard:', error);
            return ResponseHandler.error(res, '更新失败', 'SERVER_ERROR', 500, error);
        }
    }

    /**
     * 删除 AQL 标准
     */
    async deleteStandard(req, res) {
        try {
            const { id } = req.params;
            await AqlService.deleteStandard(id);
            return ResponseHandler.success(res, { id }, 'AQL 标准删除成功');
        } catch (error) {
            logger.error('Error deleting AQL standard:', error);
            return ResponseHandler.error(res, '删除失败', 'SERVER_ERROR', 500, error);
        }
    }

    /**
     * 获取 AQL 标准列表
     */
    async getStandards(req, res) {
        try {
            const result = await AqlService.getStandardsList(req.query);
            return ResponseHandler.success(res, result);
        } catch (error) {
            logger.error('Error fetching AQL standards list:', error);
            return ResponseHandler.error(res, '获取列表失败', 'SERVER_ERROR', 500, error);
        }
    }

    /**
     * 提供给前端下拉框可用 AQL 级别
     */
    async getAqlLevels(req, res) {
        try {
            const levels = await AqlService.getAvailableAqlLevels();
            return ResponseHandler.success(res, levels);
        } catch (error) {
            logger.error('Error fetching AQL levels:', error);
            return ResponseHandler.error(res, '获取AQL等级失败', 'SERVER_ERROR', 500, error);
        }
    }

    /**
     * 计算AQL动态抽样规则
     */
    async calculateSampling(req, res) {
        try {
            const { batch_size, aql_level } = req.body;

            if (!batch_size || !aql_level) {
                return ResponseHandler.error(res, '必须提供批量 (batch_size) 和 AQL级别 (aql_level)', 'VALIDATION_ERROR', 400);
            }

            const result = await AqlService.calculate(Number(batch_size), String(aql_level));

            if (!result.matched) {
                return ResponseHandler.success(res, result, '未找到匹配的标准', 200);
            }

            return ResponseHandler.success(res, result, '计算成功');
        } catch (error) {
            logger.error('Error calculating AQL sampling:', error);
            return ResponseHandler.error(res, 'AQL抽样计算失败', 'SERVER_ERROR', 500, error);
        }
    }
}

module.exports = new AqlController();
