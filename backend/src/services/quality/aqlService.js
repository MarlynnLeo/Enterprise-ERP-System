const AqlStandard = require('../../models/quality/aqlStandard');
const { logger } = require('../../utils/logger');
const { parsePagination } = require('../../utils/safePagination');
const { validateSamplingCounts } = require('../../utils/quality/aqlValidation');

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
    return AqlStandard.update(id, data);
  }

  /**
   * 删除 AQL 标准
   */
  static async deleteStandard(id) {
    logger.info(`Deleting AQL Standard ID: ${id}`);
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
      AqlStandard.count(params),
    ]);

    return {
      items,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.ceil(total / pagination.pageSize),
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
        message: `未找到适用于批量 ${batchSize}、AQL ${aqlLevel} 的生效抽样标准，请在 AQL 抽样标准库中维护覆盖该批量和级别的规则。`,
      };
    }

    validateSamplingCounts(result);

    return {
      matched: true,
      data: { ...result, sample_size: Math.min(Number(result.sample_size), batchSize) },
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
      return rows.map((r) => r.aql_level);
    } catch (err) {
      logger.error('Failed to get available AQL levels:', err);
      throw err;
    }
  }
}

module.exports = AqlService;
