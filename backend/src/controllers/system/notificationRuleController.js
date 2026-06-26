/**
 * 通知规则控制器
 * @description 管理通知规则的 CRUD 操作，供系统管理后台使用。
 * @date 2026-06-22
 */

const NotificationRuleService = require('../../services/system/NotificationRuleService');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

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
      const rule = await NotificationRuleService.updateRule(req.params.id, req.body);
      if (!rule) {
        return ResponseHandler.notFound(res, '通知规则不存在');
      }
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
      await NotificationRuleService.deleteRule(req.params.id);
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
      const rule = await NotificationRuleService.toggleActive(req.params.id, is_active);
      if (!rule) {
        return ResponseHandler.notFound(res, '通知规则不存在');
      }
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
};
