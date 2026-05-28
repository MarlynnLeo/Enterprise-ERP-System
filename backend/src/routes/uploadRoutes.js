/**
 * uploadRoutes.js
 * @description 文件上传路由
 * @date 2025-11-04
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { FileUploadMiddlewares } = require('../middleware/unifiedFileUpload');
const { ResponseHandler } = require('../utils/responseHandler');
const { logger } = require('../utils/logger');
const FileAccessService = require('../services/FileAccessService');

// 确保上传目录存在
const uploadDir = path.join(process.cwd(), 'uploads', 'attachments');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * 上传单个文件
 */
router.post('/file', authenticateToken, requirePermission('system:files:upload'), FileUploadMiddlewares.attachmentFile, async (req, res) => {
  if (!req.fileInfo) {
    return ResponseHandler.error(res, '没有文件上传', 'BAD_REQUEST', 400);
  }

  await FileAccessService.safeRecordUpload({
    fileUrl: req.fileInfo.url,
    businessType: req.body.business_type || req.body.businessType,
    businessId: req.body.business_id || req.body.businessId,
    source: 'upload',
    uploadedBy: req.user?.id || req.user?.userId || null,
    isPublic: req.body.is_public || req.body.isPublic,
    metadata: {
      originalName: req.fileInfo.originalName,
      mimetype: req.fileInfo.mimetype,
      size: req.fileInfo.size,
    },
  });

  ResponseHandler.success(res, {
    url: req.fileInfo.url,
    filename: req.fileInfo.originalName,
    size: req.fileInfo.size,
    mimetype: req.fileInfo.mimetype,
  });
});

/**
 * 上传多个文件
 */
router.post('/files', authenticateToken, requirePermission('system:files:upload'), FileUploadMiddlewares.attachmentFiles, async (req, res) => {
  if (!req.filesInfo || req.filesInfo.length === 0) {
    return ResponseHandler.error(res, '没有文件上传', 'BAD_REQUEST', 400);
  }

  const businessType = req.body.business_type || req.body.businessType;
  const businessId = req.body.business_id || req.body.businessId;
  const files = [];
  for (const file of req.filesInfo) {
    await FileAccessService.safeRecordUpload({
      fileUrl: file.url,
      businessType,
      businessId,
      source: 'upload',
      uploadedBy: req.user?.id || req.user?.userId || null,
      isPublic: req.body.is_public || req.body.isPublic,
      metadata: {
        originalName: file.originalName,
        mimetype: file.mimetype,
        size: file.size,
      },
    });
    files.push({
      url: file.url,
      filename: file.originalName,
      size: file.size,
      mimetype: file.mimetype,
    });
  }

  ResponseHandler.success(res, { files });
});

/**
 * 删除文件
 */
router.delete('/file', authenticateToken, requirePermission('system:files:delete'), (req, res) => {
  try {
    const { filename } = req.body;

    if (!filename) {
      return ResponseHandler.error(res, '缺少文件名参数', 'BAD_REQUEST', 400);
    }

    // 安全检查：确保文件名不包含路径遍历字符
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return ResponseHandler.error(res, '非法的文件名', 'BAD_REQUEST', 400);
    }

    const filePath = path.resolve(uploadDir, filename);
    const resolvedUploadDir = path.resolve(uploadDir);
    if (!filePath.startsWith(resolvedUploadDir + path.sep)) {
      return ResponseHandler.error(res, '非法的文件名', 'BAD_REQUEST', 400);
    }

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return ResponseHandler.error(res, '文件不存在', 'NOT_FOUND', 404);
    }

    // 删除文件
    fs.unlinkSync(filePath);
    FileAccessService.safeMarkDeleted(`/uploads/attachments/${filename}`);

    ResponseHandler.success(res, { message: '文件删除成功' });
  } catch (error) {
    logger.error('删除文件失败:', error);
    ResponseHandler.error(res, '删除文件失败');
  }
});

module.exports = router;
