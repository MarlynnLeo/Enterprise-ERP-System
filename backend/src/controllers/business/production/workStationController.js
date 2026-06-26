/**
 * workStationController.js
 * @description 工位管理控制器
 */
const WorkStationService = require('../../../services/business/WorkStationService');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

module.exports = {
  async getList(req, res) {
    try {
      const result = await WorkStationService.getList(req.query);
      ResponseHandler.paginated(res, result.list, result.total, result.page, result.pageSize);
    } catch (error) {
      logger.error('获取工位列表失败:', error);
      ResponseHandler.error(res, error.message || '获取工位列表失败');
    }
  },

  async getById(req, res) {
    try {
      const data = await WorkStationService.getById(req.params.id);
      if (!data) return ResponseHandler.error(res, '工位不存在', 'NOT_FOUND', 404);
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取工位详情失败:', error);
      ResponseHandler.error(res, error.message || '获取工位详情失败');
    }
  },

  async create(req, res) {
    try {
      const data = await WorkStationService.create(req.body);
      ResponseHandler.success(res, data, '工位创建成功');
    } catch (error) {
      logger.error('创建工位失败:', error);
      ResponseHandler.error(res, error.message || '创建工位失败');
    }
  },

  async update(req, res) {
    try {
      const data = await WorkStationService.update(req.params.id, req.body);
      ResponseHandler.success(res, data, '工位更新成功');
    } catch (error) {
      logger.error('更新工位失败:', error);
      ResponseHandler.error(res, error.message || '更新工位失败');
    }
  },

  async delete(req, res) {
    try {
      await WorkStationService.delete(req.params.id);
      ResponseHandler.success(res, null, '工位删除成功');
    } catch (error) {
      logger.error('删除工位失败:', error);
      ResponseHandler.error(res, error.message || '删除工位失败');
    }
  },

  async getLines(req, res) {
    try {
      const data = await WorkStationService.getLines();
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取产线列表失败:', error);
      ResponseHandler.error(res, error.message || '获取产线列表失败');
    }
  },

  async getStationStatus(req, res) {
    try {
      const data = await WorkStationService.getStationStatus();
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取工位状态失败:', error);
      ResponseHandler.error(res, error.message || '获取工位状态失败');
    }
  },
};
