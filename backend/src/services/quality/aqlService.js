const AqlStandard = require('../../models/quality/aqlStandard');
const { logger } = require('../../utils/logger');
const { parsePagination } = require('../../utils/safePagination');

class AqlService {
    /**
     * 创建 AQL 标准
     */
    static async createStandard(data, creatorId) {
        logger.info(`Creating AQL Standard: ${data.code}`);
        return AqlStandard.create({ ...data, creator_id: creatorId });
    }

    /**
     * 更新 AQL 标准
     */
    static async updateStandard(id, data) {
        logger.info(`Updating AQL Standard ID: ${id}`);
        const standard = await AqlStandard.findById(id);
        if (!standard) {
            throw new Error('AQL Standard not found');
        }
        return AqlStandard.update(id, data);
    }

    /**
     * 删除 AQL 标准
     */
    static async deleteStandard(id) {
        logger.info(`Deleting AQL Standard ID: ${id}`);
        const standard = await AqlStandard.findById(id);
        if (!standard) {
            throw new Error('AQL Standard not found');
        }
        return AqlStandard.delete(id);
    }

    /**
     * 获取 AQL 标准详情
     */
    static async getStandardById(id) {
        return AqlStandard.findById(id);
    }

    /**
     * 分页获取 AQL 标准列表
     */
    static async getStandardsList(params = {}) {
        const pagination = parsePagination(params.page, params.pageSize || params.limit, {
            defaultPageSize: 10,
            maxPageSize: 100,
        });

        const listParams = { ...params, limit: pagination.limit, offset: pagination.offset };

        const [items, total] = await Promise.all([
            AqlStandard.findAll(listParams),
            AqlStandard.count(params)
        ]);

        return {
            items,
            total,
            page: pagination.page,
            pageSize: pagination.pageSize,
            totalPages: Math.ceil(total / pagination.pageSize)
        };
    }

    /**
     * 执行 AQL 计算 (核心引擎)
     * 给定收货数量和要求等级，返回动态抽样规则
     */
    static async calculate(batchSize, aqlLevel) {
        logger.info(`Calculating AQL for batchSize: ${batchSize}, level: ${aqlLevel}`);
        const result = await AqlStandard.calculateSampling(batchSize, aqlLevel);

        if (!result) {
            return {
                matched: false,
                message: '未找到匹配的抽样标准，可能该批量超出了标准范围或没有维护该AQL等级'
            };
        }

        // 针对抽样数大于批量本身的极端保护 (如果发生)
        if (result.sample_size > batchSize) {
            result.sample_size = batchSize;
        }

        return {
            matched: true,
            data: result
        };
    }

    /**
     * 提供给前端下拉选择使用的可用 AQL 等级集合
     */
    static async getAvailableAqlLevels() {
        try {
            const { pool } = require('../../config/db');
            const [rows] = await pool.query(
                `SELECT DISTINCT aql_level FROM quality_aql_standards WHERE status = 'active' ORDER BY aql_level ASC`
            );
            return rows.map(r => r.aql_level);
        } catch (err) {
            logger.error('Failed to get available AQL levels:', err);
            throw err;
        }
    }
}

module.exports = AqlService;
