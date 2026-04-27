/**
 * workflowController.js
 * @description 审批工作流控制器
 */

const WorkflowService = require('../../services/business/WorkflowService');
const { logger } = require('../../utils/logger');

const ResponseHandler = {
  success: (res, data, msg) => res.json({ success: true, data, message: msg || '操作成功' }),
  error: (res, msg, code = 500) => res.status(code).json({ success: false, message: msg }),
  notFound: (res, msg) => res.status(404).json({ success: false, message: msg || '未找到' }),
};

module.exports = {
  // ========== 模板管理 ==========
  async getTemplates(req, res) {
    try {
      const data = await WorkflowService.getTemplates(req.query);
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
      const data = await WorkflowService.createTemplate(req.body, userId);
      ResponseHandler.success(res, data, '创建成功');
    } catch (e) { logger.error('创建模板失败:', e); ResponseHandler.error(res, e.message); }
  },

  async updateTemplate(req, res) {
    try {
      const data = await WorkflowService.updateTemplate(req.params.id, req.body);
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
      const data = await WorkflowService.startWorkflow({ ...req.body, initiator_id: userId });
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('发起审批失败:', e); ResponseHandler.error(res, e.message); }
  },

  async handleApproval(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const data = await WorkflowService.handleApproval({
        instance_id: req.params.id,
        node_id: req.body.node_id,
        action: req.body.action,
        comment: req.body.comment,
        approver_id: userId,
      });
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('审批操作失败:', e); ResponseHandler.error(res, e.message); }
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
      const data = await WorkflowService.getInstanceById(req.params.id);
      if (!data) return ResponseHandler.notFound(res);
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取审批详情失败:', e); ResponseHandler.error(res, e.message); }
  },

  async getMyInitiated(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const data = await WorkflowService.getMyInitiated(userId, req.query);
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取我发起的审批失败:', e); ResponseHandler.error(res, e.message); }
  },

  async getMyPending(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const data = await WorkflowService.getMyPending(userId, req.query);
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取待审批失败:', e); ResponseHandler.error(res, e.message); }
  },

  async getWorkflowByBusiness(req, res) {
    try {
      const data = await WorkflowService.getWorkflowByBusiness(req.query.business_type, req.query.business_id);
      ResponseHandler.success(res, data);
    } catch (e) { logger.error('获取业务审批状态失败:', e); ResponseHandler.error(res, e.message); }
  },
};
