/**
 * assemblyExecutionController.js
 * @description 装配执行控制器
 */
const AssemblyExecutionService = require('../../../services/business/AssemblyExecutionService');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

module.exports = {
  /** 为任务生成装配工序 */
  async generateSteps(req, res) {
    try {
      const data = await AssemblyExecutionService.generateSteps(req.params.taskId);
      ResponseHandler.success(res, data, '装配工序生成成功');
    } catch (error) {
      logger.error('生成装配工序失败:', error);
      ResponseHandler.error(res, error.message || '生成装配工序失败');
    }
  },

  /** 获取任务的装配步骤 */
  async getTaskSteps(req, res) {
    try {
      const data = await AssemblyExecutionService.getTaskSteps(req.params.taskId);
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取装配步骤失败:', error);
      ResponseHandler.error(res, error.message || '获取装配步骤失败');
    }
  },

  /** 开始工序 */
  async startStep(req, res) {
    try {
      const { stationId } = req.body;
      const data = await AssemblyExecutionService.startStep(
        req.params.stepId, req.user?.id, stationId
      );
      ResponseHandler.success(res, data, '工序已开始');
    } catch (error) {
      logger.error('开始工序失败:', error);
      ResponseHandler.error(res, error.message || '开始工序失败');
    }
  },

  /** 完成工序 */
  async completeStep(req, res) {
    try {
      const data = await AssemblyExecutionService.completeStep(req.params.stepId, req.body);
      ResponseHandler.success(res, data, '工序已完成');
    } catch (error) {
      logger.error('完成工序失败:', error);
      ResponseHandler.error(res, error.message || '完成工序失败');
    }
  },

  /** 跳过工序 */
  async skipStep(req, res) {
    try {
      const data = await AssemblyExecutionService.skipStep(req.params.stepId, req.body.reason);
      ResponseHandler.success(res, data, '工序已跳过');
    } catch (error) {
      logger.error('跳过工序失败:', error);
      ResponseHandler.error(res, error.message || '跳过工序失败');
    }
  },

  /** 获取步骤详情 */
  async getStepDetail(req, res) {
    try {
      const data = await AssemblyExecutionService.getStepDetail(req.params.stepId);
      if (!data) return ResponseHandler.error(res, '步骤不存在', 'NOT_FOUND', 404);
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取步骤详情失败:', error);
      ResponseHandler.error(res, error.message || '获取步骤详情失败');
    }
  },

  /** 获取装配看板 */
  async getBoard(req, res) {
    try {
      const data = await AssemblyExecutionService.getBoardData();
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取装配看板失败:', error);
      ResponseHandler.error(res, error.message || '获取装配看板失败');
    }
  },
};
