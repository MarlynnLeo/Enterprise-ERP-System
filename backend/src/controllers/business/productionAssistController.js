/**
 * 物料齐套 + 扫码防错控制器
 */
const MaterialReadinessService = require('../../services/business/MaterialReadinessService');
const AssemblyVerificationService = require('../../services/business/AssemblyVerificationService');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const { pool } = require('../../config/db');
const ScopeGuard = require('../../authorization/ScopeGuard');

async function assertTaskWriteAccess(req, taskId) {
  const normalized = Number(taskId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    const error = new Error('生产任务 ID 无效');
    error.statusCode = 400;
    throw error;
  }
  if (!(await ScopeGuard.assertAccess(pool, req, 'production_task', normalized))) {
    const error = new Error('无权操作该生产任务');
    error.statusCode = 403;
    throw error;
  }
}

module.exports = {
  // ===== 物料齐套 =====
  async checkReadiness(req, res) {
    try {
      const result = await MaterialReadinessService.checkByTask(req.params.taskId);
      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('物料齐套检查失败:', error);
      ResponseHandler.error(res, error.message || '检查失败');
    }
  },

  async checkReadinessBatch(req, res) {
    try {
      const { taskIds } = req.body;
      if (!Array.isArray(taskIds)) return ResponseHandler.error(res, 'taskIds 必须为数组', 'VALIDATION_ERROR', 400);
      const results = await MaterialReadinessService.checkBatch(taskIds);
      ResponseHandler.success(res, results);
    } catch (error) {
      logger.error('批量齐套检查失败:', error);
      ResponseHandler.error(res, '批量检查失败');
    }
  },

  // ===== 扫码防错 =====
  async scanVerify(req, res) {
    try {
      await assertTaskWriteAccess(req, req.body?.taskId ?? req.body?.task_id);
      const result = await AssemblyVerificationService.verify(req.body, req.user?.id);
      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('扫码验证失败:', error);
      ResponseHandler.error(res, error.message || '扫码验证失败', error.statusCode === 403 ? 'FORBIDDEN' : 'OPERATION_ERROR', error.statusCode || 500);
    }
  },

  async getVerificationLogs(req, res) {
    try {
      const result = await AssemblyVerificationService.getLogs(req.query);
      ResponseHandler.paginated(res, result.list, result.total, result.page, result.pageSize);
    } catch (error) {
      logger.error('获取验证日志失败:', error);
      ResponseHandler.error(res, '获取日志失败');
    }
  },
};
