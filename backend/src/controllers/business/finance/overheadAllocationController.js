const OverheadAllocationService = require('../../../services/business/OverheadAllocationService');
const { ResponseHandler } = require('../../../utils/responseHandler');

class OverheadAllocationController {
  /**
   * 获取分摊配置列表
   */
  static async getConfigs(req, res) {
    try {
      const filters = {
        isActive: req.query.is_active !== undefined ? req.query.is_active === '1' || req.query.is_active === 'true' : undefined,
        costCenterId: req.query.cost_center_id,
        allocationBase: req.query.allocation_base,
        productId: req.query.product_id,
        isGlobal: req.query.is_global !== undefined ? req.query.is_global === '1' || req.query.is_global === 'true' : undefined
      };
      const configs = await OverheadAllocationService.getConfigs(filters);
      ResponseHandler.success(res, configs, '获取分摊配置列表成功');
    } catch (error) {
      ResponseHandler.error(res, '获取分摊配置列表失败', 'FETCH_OVERHEAD_ALLOCATION_FAILED', 500, error);
    }
  }

  /**
   * 创建分摊配置
   */
  static async createConfig(req, res) {
    try {
      const result = await OverheadAllocationService.createConfig(req.body);
      ResponseHandler.success(res, result, '创建分摊配置成功', 201);
    } catch (error) {
      ResponseHandler.error(res, '创建分摊配置失败', 'CREATE_OVERHEAD_ALLOCATION_FAILED', 500, error);
    }
  }

  /**
   * 更新分摊配置
   */
  static async updateConfig(req, res) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的配置ID', 'VALIDATION_ERROR', 400);
      }
      const result = await OverheadAllocationService.updateConfig(id, req.body);
      ResponseHandler.success(res, result, '更新分摊配置成功');
    } catch (error) {
      ResponseHandler.error(res, '更新分摊配置失败', 'UPDATE_OVERHEAD_ALLOCATION_FAILED', 500, error);
    }
  }

  /**
   * 删除分摊配置
   */
  static async deleteConfig(req, res) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的配置ID', 'VALIDATION_ERROR', 400);
      }
      const result = await OverheadAllocationService.deleteConfig(id);
      ResponseHandler.success(res, result, '删除分摊配置成功');
    } catch (error) {
      ResponseHandler.error(res, '删除分摊配置失败', 'DELETE_OVERHEAD_ALLOCATION_FAILED', 500, error);
    }
  }

  /**
   * 获取所有分摊基础选项
   */
  static async getAllocationBases(req, res) {
    try {
      const bases = OverheadAllocationService.getAllocationBaseOptions();
      ResponseHandler.success(res, bases, '获取分摊基础选项成功');
    } catch (error) {
      ResponseHandler.error(res, '获取分摊基础选型失败', 'FETCH_ALLOCATION_BASES_FAILED', 500, error);
    }
  }
}

module.exports = OverheadAllocationController;
