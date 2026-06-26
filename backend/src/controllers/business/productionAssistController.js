/**
 * 物料齐套 + 扫码防错控制器
 */
const MaterialReadinessService = require('../../services/business/MaterialReadinessService');
const AssemblyVerificationService = require('../../services/business/AssemblyVerificationService');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

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
      const result = await AssemblyVerificationService.verify(req.body, req.user?.id);
      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('扫码验证失败:', error);
      ResponseHandler.error(res, error.message || '扫码验证失败');
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
