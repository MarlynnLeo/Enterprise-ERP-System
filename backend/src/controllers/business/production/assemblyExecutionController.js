/**
 * assemblyExecutionController.js
 * @description 装配执行控制器
 */
const AssemblyExecutionService = require('../../../services/business/AssemblyExecutionService');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const BusinessError = require('../../../utils/BusinessError');
const { pool } = require('../../../config/db');
const ScopeGuard = require('../../../authorization/ScopeGuard');
const { getAuthenticatedUserId } = require('../../../utils/authContext');

async function assertTaskWriteAccess(req, taskId, accessMode = 'write') {
  const normalized = Number(taskId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    const error = new Error('生产任务 ID 无效');
    error.statusCode = 400;
    throw error;
  }
  if (!(await ScopeGuard.assertAccess(pool, req, 'production_task', normalized, { accessMode }))) {
    const error = new Error('无权操作该生产任务');
    error.statusCode = 403;
    throw error;
  }
}

async function getStepTaskId(stepId) {
  const [rows] = await pool.query(
    'SELECT task_id FROM production_processes WHERE id = ?',
    [stepId]
  );
  if (rows.length === 0) {
    const error = new Error('工序步骤不存在');
    error.statusCode = 404;
    throw error;
  }
  return rows[0].task_id;
}

module.exports = {
  /** 为任务生成装配工序 */
  async generateSteps(req, res) {
    try {
      await assertTaskWriteAccess(req, req.params.taskId);
      const data = await AssemblyExecutionService.generateSteps(req.params.taskId);
      ResponseHandler.success(res, data, '装配工序生成成功');
    } catch (error) {
      logger.error('生成装配工序失败:', error);
      BusinessError.handleError(res, error, '生成装配工序失败', ResponseHandler);
    }
  },

  /** 获取任务的装配步骤 */
  async getTaskSteps(req, res) {
    try {
      await assertTaskWriteAccess(req, req.params.taskId, 'read');
      const data = await AssemblyExecutionService.getTaskSteps(req.params.taskId);
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取装配步骤失败:', error);
      BusinessError.handleError(res, error, '获取装配步骤失败', ResponseHandler);
    }
  },

  /** 开始工序 */
  async startStep(req, res) {
    try {
      await assertTaskWriteAccess(req, await getStepTaskId(req.params.stepId));
      const { stationId } = req.body;
      const data = await AssemblyExecutionService.startStep(
        req.params.stepId, getAuthenticatedUserId(req), stationId
      );
      ResponseHandler.success(res, data, '工序已开始');
    } catch (error) {
      logger.error('开始工序失败:', error);
      BusinessError.handleError(res, error, '开始工序失败', ResponseHandler);
    }
  },

  /** 完成工序 */
  async completeStep(req, res) {
    try {
      await assertTaskWriteAccess(req, await getStepTaskId(req.params.stepId));
      const data = await AssemblyExecutionService.completeStep(req.params.stepId, req.body, { operatorId: getAuthenticatedUserId(req) });
      ResponseHandler.success(res, data, '工序已完成');
    } catch (error) {
      logger.error('完成工序失败:', error);
      BusinessError.handleError(res, error, '完成工序失败', ResponseHandler);
    }
  },

  /** 跳过工序 */
  async skipStep(req, res) {
    try {
      await assertTaskWriteAccess(req, await getStepTaskId(req.params.stepId));
      const data = await AssemblyExecutionService.skipStep(req.params.stepId, req.body.reason, { operatorId: getAuthenticatedUserId(req) });
      ResponseHandler.success(res, data, '工序已跳过');
    } catch (error) {
      logger.error('跳过工序失败:', error);
      BusinessError.handleError(res, error, '跳过工序失败', ResponseHandler);
    }
  },

  /** 获取步骤详情 */
  async getStepDetail(req, res) {
    try {
      const data = await AssemblyExecutionService.getStepDetail(req.params.stepId);
      if (!data) return ResponseHandler.error(res, '步骤不存在', 'NOT_FOUND', 404);
      await assertTaskWriteAccess(req, data.task_id, 'read');
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取步骤详情失败:', error);
      BusinessError.handleError(res, error, '获取步骤详情失败', ResponseHandler);
    }
  },

  /** 获取装配看板 */
  async getBoard(req, res) {
    try {
      const data = await AssemblyExecutionService.getBoardData();
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取装配看板失败:', error);
      BusinessError.handleError(res, error, '获取装配看板失败', ResponseHandler);
    }
  },
};
