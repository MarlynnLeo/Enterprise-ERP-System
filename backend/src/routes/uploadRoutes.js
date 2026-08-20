/**
 * uploadRoutes.js
 * @description 文件上传路由
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const { authenticateToken } = require('../middleware/authEnhanced');
const { requirePermission } = require('../middleware/requirePermission');
const { FileUploadMiddlewares } = require('../middleware/unifiedFileUpload');
const FileAccessService = require('../services/FileAccessService');
const { logger } = require('../utils/logger');
const { ResponseHandler } = require('../utils/responseHandler');

const router = express.Router();
const uploadDir = path.join(process.cwd(), 'uploads', 'attachments');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

function getUserId(req) {
  return req.user?.id || req.user?.userId || null;
}

function getRequestedBinding(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return FileAccessService.validateBusinessBinding(
    body.business_type ?? body.businessType,
    body.business_id ?? body.businessId
  );
}

function cleanupUploadedFiles(files = []) {
  FileAccessService.removeLocalFiles(files.map((file) => file?.url).filter(Boolean));
}

async function ensureBindingAccess(req, files) {
  const binding = getRequestedBinding(req);
  if (!binding.valid) {
    cleanupUploadedFiles(files);
    return { ok: false, status: 400, message: '业务类型和业务 ID 必须成对提供，且业务类型必须受支持' };
  }
  if (
    binding.bound &&
    !FileAccessService.canViewBusinessType(binding.businessType, req.userPermissions)
  ) {
    cleanupUploadedFiles(files);
    return { ok: false, status: 403, message: '无权使用该业务类型的文件上传功能' };
  }
  if (
    binding.bound &&
    !(await FileAccessService.assertBusinessObjectAccess(
      req,
      binding.businessType,
      binding.businessId,
      'write'
    ))
  ) {
    cleanupUploadedFiles(files);
    return { ok: false, status: 403, message: '无权向该业务对象上传文件' };
  }
  return { ok: true, binding };
}

router.post(
  '/file',
  authenticateToken,
  requirePermission('system:files:upload'),
  FileUploadMiddlewares.attachmentFile,
  async (req, res) => {
    const uploadedFiles = req.fileInfo ? [req.fileInfo] : [];
    try {
      if (uploadedFiles.length === 0) {
        return ResponseHandler.error(res, '没有文件上传', 'BAD_REQUEST', 400);
      }

      const access = await ensureBindingAccess(req, uploadedFiles);
      if (!access.ok) {
        return ResponseHandler.error(
          res,
          access.message,
          access.status === 403 ? 'FORBIDDEN' : 'VALIDATION_ERROR',
          access.status
        );
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const isPublic = FileAccessService.normalizePublicFlag(
        body.is_public ?? body.isPublic,
        req.userPermissions
      );
      await FileAccessService.safeRecordUpload({
        fileUrl: req.fileInfo.url,
        businessType: access.binding.businessType,
        businessId: access.binding.businessId,
        source: 'upload',
        uploadedBy: getUserId(req),
        isPublic,
        metadata: {
          originalName: req.fileInfo.originalName,
          mimetype: req.fileInfo.mimetype,
          size: req.fileInfo.size,
        },
      });

      return ResponseHandler.success(res, {
        url: req.fileInfo.url,
        filename: req.fileInfo.originalName,
        size: req.fileInfo.size,
        mimetype: req.fileInfo.mimetype,
      });
    } catch (error) {
      cleanupUploadedFiles(uploadedFiles);
      logger.error('[UploadRoutes] 单文件上传失败', { code: error.code, error: error.message });
      const isValidation = String(error.code || '').startsWith('BUSINESS_');
      return ResponseHandler.error(
        res,
        isValidation ? error.message : '文件上传失败',
        isValidation ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isValidation ? 400 : 500,
        error
      );
    }
  }
);

router.post(
  '/files',
  authenticateToken,
  requirePermission('system:files:upload'),
  FileUploadMiddlewares.attachmentFiles,
  async (req, res) => {
    const uploadedFiles = Array.isArray(req.filesInfo) ? req.filesInfo : [];
    try {
      if (uploadedFiles.length === 0) {
        return ResponseHandler.error(res, '没有文件上传', 'BAD_REQUEST', 400);
      }

      const access = await ensureBindingAccess(req, uploadedFiles);
      if (!access.ok) {
        return ResponseHandler.error(
          res,
          access.message,
          access.status === 403 ? 'FORBIDDEN' : 'VALIDATION_ERROR',
          access.status
        );
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const isPublic = FileAccessService.normalizePublicFlag(
        body.is_public ?? body.isPublic,
        req.userPermissions
      );
      const payloads = uploadedFiles.map((file) => ({
        fileUrl: file.url,
        businessType: access.binding.businessType,
        businessId: access.binding.businessId,
        source: 'upload',
        uploadedBy: getUserId(req),
        isPublic,
        metadata: {
          originalName: file.originalName,
          mimetype: file.mimetype,
          size: file.size,
        },
      }));
      await FileAccessService.recordUploads(payloads);

      return ResponseHandler.success(res, {
        files: uploadedFiles.map((file) => ({
          url: file.url,
          filename: file.originalName,
          size: file.size,
          mimetype: file.mimetype,
        })),
      });
    } catch (error) {
      cleanupUploadedFiles(uploadedFiles);
      logger.error('[UploadRoutes] 批量文件上传失败', { code: error.code, error: error.message });
      const isValidation = String(error.code || '').startsWith('BUSINESS_');
      return ResponseHandler.error(
        res,
        isValidation ? error.message : '批量文件上传失败',
        isValidation ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isValidation ? 400 : 500,
        error
      );
    }
  }
);

router.delete(
  '/file',
  authenticateToken,
  requirePermission('system:files:delete'),
  async (req, res) => {
    try {
      const filename = typeof req.body?.filename === 'string' ? req.body.filename.trim() : '';
      if (
        !filename ||
        filename.length > 255 ||
        filename === '.' ||
        filename === '..' ||
        !/^[a-zA-Z0-9._-]+$/.test(filename)
      ) {
        return ResponseHandler.error(res, '非法的文件名', 'BAD_REQUEST', 400);
      }

      const fileUrl = `/uploads/attachments/${filename}`;
      const result = await FileAccessService.deleteTrackedLocalFile({
        userId: getUserId(req),
        fileUrl,
        req,
        userPermissions: req.userPermissions,
      });
      if (result.deleted) {
        return ResponseHandler.success(res, { message: '文件删除成功' });
      }
      if (result.reason === 'FILE_NOT_TRACKED' || result.reason === 'FILE_NOT_FOUND') {
        return ResponseHandler.error(res, '文件不存在', 'NOT_FOUND', 404);
      }
      if (result.reason === 'BUSINESS_FILE_REQUIRES_OWNER_ENDPOINT') {
        return ResponseHandler.error(
          res,
          '业务附件必须通过对应业务模块删除，避免产生悬空引用',
          'CONFLICT',
          409
        );
      }
      return ResponseHandler.forbidden(res, '无权删除该文件');
    } catch (error) {
      logger.error('[UploadRoutes] 删除文件失败', { code: error.code, error: error.message });
      return ResponseHandler.error(res, '删除文件失败', 'SERVER_ERROR', 500, error);
    }
  }
);

module.exports = router;
