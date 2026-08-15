/**
 * workflowController.js
 * @description 审批工作流控制器
 */

const WorkflowService = require('../../services/business/WorkflowService');
const { logger } = require('../../utils/logger');
const { ResponseHandler } = require('../../utils/responseHandler');
const { mapKeysToSnake } = require('../../utils/fieldMap');

module.exports = {
  // ========== 模板管理 ==========
  async getTemplates(req, res) {
    try {
      const data = await WorkflowService.getTemplates(mapKeysToSnake(req.query || {}));
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取工作流模板失败:', e); ResponseHandler.error(res, e.message); }
  },

  async getTemplateById(req, res) {
    try {
      const data = await WorkflowService.getTemplateById(req.params.id);
      if (!data) return ResponseHandler.notFound(res, '模板不存在');
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取模板详情失败:', e); ResponseHandler.error(res, e.message); }
  },

  async createTemplate(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const data = await WorkflowService.createTemplate(mapKeysToSnake(req.body || {}), userId);
      ResponseHandler.success(res, data, '创建成功');
    } catch (e) { logger.error('创建模板失败:', e); ResponseHandler.error(res, e.message); }
  },

  async updateTemplate(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const data = await WorkflowService.updateTemplate(
        req.params.id,
        mapKeysToSnake(req.body || {}),
        userId
      );
      ResponseHandler.success(res, data, '更新成功');
    } catch (e) { logger.error('更新模板失败:', e); ResponseHandler.error(res, e.message); }
  },

  async deleteTemplate(req, res) {
    try {
      await WorkflowService.deleteTemplate(req.params.id);
      ResponseHandler.success(res, null, '删除成功');
    } catch (e) { logger.error('删除模板失败:', e); ResponseHandler.error(res, e.message); }
  },

  // ========== 审批流程 ==========
  async startWorkflow(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const body = mapKeysToSnake(req.body || {});
      const data = await WorkflowService.startWorkflow({ ...body, initiator_id: userId });
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('发起审批失败:', e); ResponseHandler.error(res, e.message); }
  },

  async handleApproval(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const body = mapKeysToSnake(req.body || {});
      const data = await WorkflowService.handleApproval({
        instance_id: req.params.id,
        node_id: body.node_id,
        action: body.action,
        comment: body.comment,
        approver_id: userId,
      });
      ResponseHandler.success(res, data);
    } catch (e) {
      logger.error('审批操作失败:', e);
      ResponseHandler.error(
        res,
        e.message,
        e.errorCode || 'ERROR',
        e.statusCode || 500,
        e
      );
    }
  },

  async withdrawWorkflow(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const data = await WorkflowService.withdrawWorkflow(req.params.id, userId);
      ResponseHandler.success(res, data, '已撤回');
    } catch (e) { logger.error('撤回审批失败:', e); ResponseHandler.error(res, e.message); }
  },

  async getInstanceById(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!(await WorkflowService.canAccessInstance(req.params.id, userId))) {
        return ResponseHandler.error(res, '无权访问该审批实例', 'FORBIDDEN', 403);
      }
      const data = await WorkflowService.getInstanceById(req.params.id);
      if (!data) return ResponseHandler.notFound(res);
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取审批详情失败:', e); ResponseHandler.error(res, e.message); }
  },

  async getMyInitiated(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const data = await WorkflowService.getMyInitiated(userId, mapKeysToSnake(req.query || {}));
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取我发起的审批失败:', e); ResponseHandler.error(res, e.message); }
  },

  async getMyPending(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const data = await WorkflowService.getMyPending(userId, mapKeysToSnake(req.query || {}));
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取待审批失败:', e); ResponseHandler.error(res, e.message); }
  },

  async getWorkflowByBusiness(req, res) {
    try {
      const q = mapKeysToSnake(req.query || {});
      const businessType = q.business_type;
      const businessId = q.business_id;
      const data = await WorkflowService.getWorkflowByBusiness(businessType, businessId);
      if (data) {
        const userId = req.user?.userId || req.user?.id;
        if (!(await WorkflowService.canAccessInstance(data.id, userId))) {
          return ResponseHandler.error(res, '无权访问该业务审批状态', 'FORBIDDEN', 403);
        }
      }
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取业务审批状态失败:', e); ResponseHandler.error(res, e.message); }
  },
};
