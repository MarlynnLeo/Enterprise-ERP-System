/**
 * contractController.js
 * @description 合同管理控制器
 */

const ContractService = require('../../services/business/ContractService');
const DocumentLinkService = require('../../services/business/DocumentLinkService');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');


module.exports = {
  async getList(req, res) {
    try { ResponseHandler.success(res, await ContractService.getList(req.query)); }
    catch (e) { logger.error('获取合同列表失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },

  async getById(req, res) {
    try {
      const data = await ContractService.getById(req.params.id);
      if (!data) return ResponseHandler.error(res, '合同不存在', 'NOT_FOUND', 404);
      // 附加单据关联
      data.document_links = await DocumentLinkService.getLinks('contract', req.params.id);
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取合同详情失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },

  async create(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const data = await ContractService.create(req.body, userId);
      ResponseHandler.success(res, data, '创建成功', 201);
    } catch (e) { logger.error('创建合同失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },

  async update(req, res) {
    try {
      const data = await ContractService.update(req.params.id, req.body);
      ResponseHandler.success(res, data, '更新成功');
    } catch (e) { logger.error('更新合同失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },

  async delete(req, res) {
    try {
      await ContractService.delete(req.params.id);
      ResponseHandler.success(res, null, '删除成功');
    } catch (e) { logger.error('删除合同失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },

  async updateStatus(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const data = await ContractService.updateStatus(req.params.id, req.body.status, userId);
      ResponseHandler.success(res, data, '状态已更新');
    } catch (e) { logger.error('更新合同状态失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },

  async addExecution(req, res) {
    try {
      const data = await ContractService.addExecution(req.params.id, req.body);
      ResponseHandler.success(res, data, '执行记录已添加');
    } catch (e) { logger.error('添加执行记录失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },

  async getExpiring(req, res) {
    try {
      const days = req.query.days || 30;
      const data = await ContractService.getExpiring(days);
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取到期合同失败:', e); ResponseHandler.error(res, e.message, 'SERVER_ERROR', 500, e); }
  },
};
