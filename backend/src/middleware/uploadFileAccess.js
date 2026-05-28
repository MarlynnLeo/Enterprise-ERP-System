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
      const decision = await FileAccessService.authorize({ userId, fileUrl });

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
