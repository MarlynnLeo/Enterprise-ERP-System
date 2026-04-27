/**
 * mrpController.js
 * @description MRP 物料需求计划控制器
 */

const MRPService = require('../../services/business/MRPService');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');


module.exports = {
  async getRunList(req, res) {
    try { ResponseHandler.success(res, await MRPService.getRunList(req.query)); }
    catch (e) { logger.error('获取MRP列表失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },

  async getRunById(req, res) {
    try {
      const data = await MRPService.getRunById(req.params.id);
      if (!data) return ResponseHandler.error(res, 'MRP运算不存在', 'NOT_FOUND', 404);
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取MRP详情失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },

  async createAndRun(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const data = await MRPService.createAndRun(req.body, userId);
      ResponseHandler.success(res, data, 'MRP运算已启动');
    } catch (e) { logger.error('启动MRP运算失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },

  async updateSuggestionStatus(req, res) {
    try {
      await MRPService.updateSuggestionStatus(req.params.id, req.body.status);
      ResponseHandler.success(res, null, '状态已更新');
    } catch (e) { logger.error('更新建议状态失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },

  async batchConfirm(req, res) {
    try {
      await MRPService.batchConfirm(req.body.ids);
      ResponseHandler.success(res, null, '批量确认成功');
    } catch (e) { logger.error('批量确认失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },

  async convertSuggestions(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const data = await MRPService.convertSuggestions(req.body.ids, userId);
      ResponseHandler.success(res, data, '转化成功');
    } catch (e) { logger.error('MRP建议转化失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },
};
