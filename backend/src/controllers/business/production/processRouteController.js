/**
 * processRouteController.js
 * @description 工序路线管理控制器
 */
const ProcessRouteService = require('../../../services/business/ProcessRouteService');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

module.exports = {
  async getList(req, res) {
    try {
      const result = await ProcessRouteService.getList(req.query);
      ResponseHandler.paginated(res, result.list, result.total, result.page, result.pageSize);
    } catch (error) {
      logger.error('获取工序路线列表失败:', error);
      ResponseHandler.error(res, error.message || '获取工序路线列表失败');
    }
  },

  async getById(req, res) {
    try {
      const data = await ProcessRouteService.getById(req.params.id);
      if (!data) return ResponseHandler.error(res, '工序路线不存在', 'NOT_FOUND', 404);
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取工序路线详情失败:', error);
      ResponseHandler.error(res, error.message || '获取工序路线详情失败');
    }
  },

  async create(req, res) {
    try {
      const data = await ProcessRouteService.create(req.body, req.user?.id);
      ResponseHandler.success(res, data, '工序路线创建成功');
    } catch (error) {
      logger.error('创建工序路线失败:', error);
      ResponseHandler.error(res, error.message || '创建工序路线失败');
    }
  },

  async update(req, res) {
    try {
      const data = await ProcessRouteService.update(req.params.id, req.body, req.user?.id);
      ResponseHandler.success(res, data, '工序路线更新成功');
    } catch (error) {
      logger.error('更新工序路线失败:', error);
      ResponseHandler.error(res, error.message || '更新工序路线失败');
    }
  },

  async delete(req, res) {
    try {
      await ProcessRouteService.delete(req.params.id);
      ResponseHandler.success(res, null, '工序路线删除成功');
    } catch (error) {
      logger.error('删除工序路线失败:', error);
      ResponseHandler.error(res, error.message || '删除工序路线失败');
    }
  },

  async getActiveByProduct(req, res) {
    try {
      const data = await ProcessRouteService.getActiveByProduct(req.params.productId);
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取产品工序路线失败:', error);
      ResponseHandler.error(res, error.message || '获取产品工序路线失败');
    }
  },

  async suggestMaterials(req, res) {
    try {
      const data = await ProcessRouteService.suggestMaterialsFromBom(req.params.productId);
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取BOM物料建议失败:', error);
      ResponseHandler.error(res, error.message || '获取BOM物料建议失败');
    }
  },
};
