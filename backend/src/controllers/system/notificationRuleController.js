/**
 * 通知规则控制器
 * @description 管理通知规则的 CRUD 操作，供系统管理后台使用。
 * @date 2026-06-22
 */

const NotificationRuleService = require('../../services/system/NotificationRuleService');
const NotificationResponsibilityService = require('../../services/system/NotificationResponsibilityService');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const { AuditService, AuditAction, AuditModule } = require('../../services/AuditService');

class NotificationRuleController {
  /** 获取规则列表 */
  async getRules(req, res) {
    try {
      const result = await NotificationRuleService.getRules(req.query);
      ResponseHandler.paginated(res, result.list, result.total, result.page, result.pageSize);
    } catch (error) {
      logger.error('获取通知规则列表失败:', error);
      ResponseHandler.error(res, '获取通知规则列表失败');
    }
  }

  /** 获取规则详情 */
  async getRuleById(req, res) {
    try {
      const rule = await NotificationRuleService.getRuleById(req.params.id);
      if (!rule) {
        return ResponseHandler.notFound(res, '通知规则不存在');
      }
      ResponseHandler.success(res, rule);
    } catch (error) {
      logger.error('获取通知规则详情失败:', error);
      ResponseHandler.error(res, '获取通知规则详情失败');
    }
  }

  /** 创建规则 */
  async createRule(req, res) {
    try {
      const rule = await NotificationRuleService.createRule(req.body, req.user?.id);
      await AuditService.logFromRequest(
        req,
        AuditModule.SYSTEM,
        AuditAction.CREATE,
        'notification_rule',
        rule.id,
        null,
        rule
      );
      ResponseHandler.success(res, rule, '通知规则创建成功');
    } catch (error) {
      logger.error('创建通知规则失败:', error);
      const isValidation = error.message && !error.message.includes('ER_');
      ResponseHandler.error(res, error.message || '创建通知规则失败', isValidation ? 'VALIDATION_ERROR' : undefined, isValidation ? 400 : 500);
    }
  }

  /** 更新规则 */
  async updateRule(req, res) {
    try {
      const oldRule = await NotificationRuleService.getRuleById(req.params.id);
      const rule = await NotificationRuleService.updateRule(req.params.id, req.body);
      if (!rule) {
        return ResponseHandler.notFound(res, '通知规则不存在');
      }
      await AuditService.logFromRequest(
        req,
        AuditModule.SYSTEM,
        AuditAction.UPDATE,
        'notification_rule',
        rule.id,
        oldRule,
        rule
      );
      ResponseHandler.success(res, rule, '通知规则更新成功');
    } catch (error) {
      logger.error('更新通知规则失败:', error);
      const isValidation = error.message && !error.message.includes('ER_');
      ResponseHandler.error(res, error.message || '更新通知规则失败', isValidation ? 'VALIDATION_ERROR' : undefined, isValidation ? 400 : 500);
    }
  }

  /** 删除规则 */
  async deleteRule(req, res) {
    try {
      const oldRule = await NotificationRuleService.getRuleById(req.params.id);
      if (!oldRule) {
        return ResponseHandler.notFound(res, '通知规则不存在');
      }
      await NotificationRuleService.deleteRule(req.params.id);
      await AuditService.logFromRequest(
        req,
        AuditModule.SYSTEM,
        AuditAction.DELETE,
        'notification_rule',
        req.params.id,
        oldRule,
        null
      );
      ResponseHandler.success(res, null, '通知规则删除成功');
    } catch (error) {
      logger.error('删除通知规则失败:', error);
      ResponseHandler.error(res, '删除通知规则失败');
    }
  }

  /** 切换启用/禁用 */
  async toggleActive(req, res) {
    try {
      const { is_active } = req.body;
      const oldRule = await NotificationRuleService.getRuleById(req.params.id);
      const rule = await NotificationRuleService.toggleActive(req.params.id, is_active);
      if (!rule) {
        return ResponseHandler.notFound(res, '通知规则不存在');
      }
      await AuditService.logFromRequest(
        req,
        AuditModule.SYSTEM,
        AuditAction.UPDATE,
        'notification_rule_status',
        rule.id,
        { is_active: oldRule?.is_active },
        { is_active: rule.is_active }
      );
      ResponseHandler.success(res, rule, is_active ? '规则已启用' : '规则已禁用');
    } catch (error) {
      logger.error('切换通知规则状态失败:', error);
      ResponseHandler.error(res, '切换状态失败');
    }
  }

  /** 获取支持的事件类型列表 */
  async getSupportedEvents(req, res) {
    try {
      const events = NotificationRuleService.getSupportedEvents();
      ResponseHandler.success(res, events);
    } catch (error) {
      logger.error('获取事件类型列表失败:', error);
      ResponseHandler.error(res, '获取事件类型列表失败');
    }
  }

  /** 获取接收人配置选项 */
  async getRecipientOptions(req, res) {
    try {
      const options = await NotificationRuleService.getRecipientOptions();
      ResponseHandler.success(res, options);
    } catch (error) {
      logger.error('获取通知接收人选项失败:', error);
      ResponseHandler.error(res, '获取通知接收人选项失败');
    }
  }

  /** 预览实际接收人 */
  async previewRecipients(req, res) {
    try {
      const preview = await NotificationRuleService.previewRecipients(req.body);
      ResponseHandler.success(res, preview);
    } catch (error) {
      logger.error('预览通知接收人失败:', error);
      ResponseHandler.error(res, error.message || '预览通知接收人失败', 'VALIDATION_ERROR', 400);
    }
  }

  async getResponsibilities(req, res) {
    try {
      const responsibilities = await NotificationResponsibilityService.getDetails();
      ResponseHandler.success(res, responsibilities);
    } catch (error) {
      logger.error('获取通知责任组失败:', error);
      ResponseHandler.error(res, '获取通知责任组失败');
    }
  }

  async updateResponsibility(req, res) {
    try {
      const before = await NotificationResponsibilityService.getAll();
      const responsibility = await NotificationResponsibilityService.update(req.params.code, req.body);
      await AuditService.logFromRequest(
        req,
        AuditModule.SYSTEM,
        AuditAction.UPDATE,
        'notification_responsibility',
        req.params.code,
        before[req.params.code] || null,
        responsibility
      );
      ResponseHandler.success(res, responsibility, '通知责任组已更新');
    } catch (error) {
      logger.error('更新通知责任组失败:', error);
      ResponseHandler.error(res, error.message || '更新通知责任组失败', 'VALIDATION_ERROR', 400);
    }
  }

  /** 测试通知仅发送给当前操作者 */
  async sendTestNotification(req, res) {
    try {
      const result = await NotificationRuleService.sendTestNotification(req.params.id, req.user.id);
      if (!result) {
        return ResponseHandler.notFound(res, '通知规则不存在');
      }
      await AuditService.logFromRequest(
        req,
        AuditModule.SYSTEM,
        'test',
        'notification_rule',
        req.params.id,
        null,
        { recipient_user_id: req.user.id }
      );
      ResponseHandler.success(res, result.result, '测试通知已发送给当前用户');
    } catch (error) {
      logger.error('发送测试通知失败:', error);
      ResponseHandler.error(res, error.message || '发送测试通知失败');
    }
  }
}

const controller = new NotificationRuleController();

module.exports = {
  getRules: controller.getRules.bind(controller),
  getRuleById: controller.getRuleById.bind(controller),
  createRule: controller.createRule.bind(controller),
  updateRule: controller.updateRule.bind(controller),
  deleteRule: controller.deleteRule.bind(controller),
  toggleActive: controller.toggleActive.bind(controller),
  getSupportedEvents: controller.getSupportedEvents.bind(controller),
  getRecipientOptions: controller.getRecipientOptions.bind(controller),
  previewRecipients: controller.previewRecipients.bind(controller),
  getResponsibilities: controller.getResponsibilities.bind(controller),
  updateResponsibility: controller.updateResponsibility.bind(controller),
  sendTestNotification: controller.sendTestNotification.bind(controller),
};
