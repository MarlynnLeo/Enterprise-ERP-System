/**
 * 异常上报控制器
 */
const AnomalyReportService = require('../../services/business/AnomalyReportService');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const { mapKeysToSnake } = require('../../utils/fieldMap');
const { pool } = require('../../config/db');
const FileAccessService = require('../../services/FileAccessService');

async function assertAnomalyWriteAccess(_req, anomalyId) {
  const [[row]] = await pool.query(
    'SELECT id FROM anomaly_reports WHERE id = ? AND deleted_at IS NULL',
    [anomalyId]
  );
  if (!row) {
    const error = new Error('异常报告不存在');
    error.statusCode = 404;
    throw error;
  }
}

module.exports = {
  async getTaskOptions(req, res) {
    try {
      const result = await AnomalyReportService.getTaskOptions(req.query, req);
      ResponseHandler.paginated(res, result.list, result.total, result.page, result.pageSize);
    } catch (error) {
      logger.error('获取异常关联任务失败:', error);
      ResponseHandler.error(res, '获取关联任务失败');
    }
  },

  async uploadImage(req, res) {
    const file = req.fileInfo;
    if (!file) return ResponseHandler.error(res, '请选择现场照片', 'BAD_REQUEST', 400);
    try {
      await FileAccessService.recordUpload({
        fileUrl: file.url,
        source: 'anomaly_image',
        uploadedBy: req.user?.id ?? req.user?.userId,
        isPublic: 0,
        metadata: { originalName: file.originalName, mimetype: file.mimetype, size: file.size },
      });
      return ResponseHandler.success(res, {
        url: file.url,
        filename: file.originalName,
        size: file.size,
        mimetype: file.mimetype,
      });
    } catch (error) {
      FileAccessService.removeLocalFiles([file.url]);
      logger.error('异常现场照片上传失败:', error);
      return ResponseHandler.error(res, '照片上传失败，请重试');
    }
  },

  async getList(req, res) {
    try {
      const result = await AnomalyReportService.getList(req.query);
      ResponseHandler.paginated(res, result.list, result.total, result.page, result.pageSize);
    } catch (error) {
      logger.error('获取异常列表失败:', error);
      ResponseHandler.error(res, '获取异常列表失败');
    }
  },

  async getById(req, res) {
    try {
      const data = await AnomalyReportService.getById(req.params.id);
      if (!data) return ResponseHandler.notFound(res, '异常报告不存在');
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取异常详情失败:', error);
      ResponseHandler.error(res, '获取异常详情失败');
    }
  },

  async create(req, res) {
    try {
      const data = await AnomalyReportService.create(
        req.body,
        req.user?.id ?? req.user?.userId,
        req
      );
      ResponseHandler.success(res, data, '异常上报成功');
    } catch (error) {
      logger.error('异常上报失败:', error);
      ResponseHandler.error(
        res,
        error.message || '异常上报失败',
        error.statusCode === 403
          ? 'FORBIDDEN'
          : error.statusCode === 400
            ? 'VALIDATION_ERROR'
            : 'OPERATION_ERROR',
        error.statusCode || 500
      );
    }
  },

  async assign(req, res) {
    try {
      await assertAnomalyWriteAccess(req, req.params.id);
      const body = mapKeysToSnake(req.body || {});
      const data = await AnomalyReportService.assign(req.params.id, body.assigned_to);
      ResponseHandler.success(res, data, '指派成功');
    } catch (error) {
      logger.error('指派失败:', error);
      ResponseHandler.error(
        res,
        error.message || '指派失败',
        error.statusCode === 403 ? 'FORBIDDEN' : 'OPERATION_ERROR',
        error.statusCode || 500
      );
    }
  },

  async resolve(req, res) {
    try {
      await assertAnomalyWriteAccess(req, req.params.id);
      const data = await AnomalyReportService.resolve(req.params.id, req.body, req.user?.id);
      ResponseHandler.success(res, data, '异常已解决');
    } catch (error) {
      logger.error('解决异常失败:', error);
      ResponseHandler.error(
        res,
        error.message || '解决异常失败',
        error.statusCode === 403 ? 'FORBIDDEN' : 'OPERATION_ERROR',
        error.statusCode || 500
      );
    }
  },

  async close(req, res) {
    try {
      await assertAnomalyWriteAccess(req, req.params.id);
      const data = await AnomalyReportService.close(req.params.id);
      ResponseHandler.success(res, data, '异常已关闭');
    } catch (error) {
      logger.error('关闭异常失败:', error);
      ResponseHandler.error(
        res,
        error.message || '关闭异常失败',
        error.statusCode === 403 ? 'FORBIDDEN' : 'OPERATION_ERROR',
        error.statusCode || 500
      );
    }
  },

  async delete(req, res) {
    try {
      await assertAnomalyWriteAccess(req, req.params.id);
      await AnomalyReportService.delete(req.params.id);
      ResponseHandler.success(res, null, '删除成功');
    } catch (error) {
      logger.error('删除异常失败:', error);
      ResponseHandler.error(
        res,
        error.message || '删除失败',
        error.statusCode === 403 ? 'FORBIDDEN' : 'OPERATION_ERROR',
        error.statusCode || 500
      );
    }
  },

  async getStats(req, res) {
    try {
      const stats = await AnomalyReportService.getStats();
      ResponseHandler.success(res, stats);
    } catch (error) {
      logger.error('获取异常统计失败:', error);
      ResponseHandler.error(res, '获取统计失败');
    }
  },
};
