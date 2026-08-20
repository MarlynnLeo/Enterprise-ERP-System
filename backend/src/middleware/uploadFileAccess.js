const FileAccessService = require('../services/FileAccessService');
const { ResponseHandler } = require('../utils/responseHandler');
const { logger } = require('../utils/logger');

function createUploadFileAccessMiddleware(fallbackPermissionForPath) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      if (!userId) {
        return ResponseHandler.unauthorized(res, 'Unauthorized');
      }

      const fileUrl = `/uploads${req.uploadsRequestedPath || req.path || ''}`;
      const decision = await FileAccessService.authorize({ userId, fileUrl, req });

      if (decision.known) {
        if (decision.allowed) {
          req.fileAccessRecord = decision.record;
          return next();
        }
        return ResponseHandler.forbidden(
          res,
          `Permission denied, required: ${decision.requiredPermissions.join(', ')}`
        );
      }

      // An untracked private file has no object owner or business binding.
      // Do not fall back to a broad download permission in production.
      if (process.env.NODE_ENV === 'production' || process.env.ALLOW_LEGACY_UNTRACKED_UPLOADS !== 'true') {
        return ResponseHandler.forbidden(res, '文件访问元数据不存在');
      }
      return fallbackPermissionForPath(req.uploadsRequestedPath || req.path)(req, res, next);
    } catch (error) {
      logger.error('[UploadFileAccess] permission check failed:', error);
      return ResponseHandler.error(res, 'File access permission check failed', 'SERVER_ERROR', 500, error);
    }
  };
}

module.exports = {
  createUploadFileAccessMiddleware,
};
