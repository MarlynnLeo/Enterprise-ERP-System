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
const { FileUploadMiddlewares } = require('../middleware/unifiedFileUpload');
const { ResponseHandler } = require('../utils/responseHandler');
const { logger } = require('../utils/logger');

// 确保上传目录存在
const uploadDir = path.join(process.cwd(), 'uploads', 'attachments');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * 上传单个文件
 */
router.post('/file', authenticateToken, FileUploadMiddlewares.attachmentFile, (req, res) => {
  if (!req.fileInfo) {
    return ResponseHandler.error(res, '没有文件上传', 'BAD_REQUEST', 400);
  }

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
router.post('/files', authenticateToken, FileUploadMiddlewares.attachmentFiles, (req, res) => {
  if (!req.filesInfo || req.filesInfo.length === 0) {
    return ResponseHandler.error(res, '没有文件上传', 'BAD_REQUEST', 400);
  }

  const files = req.filesInfo.map((file) => ({
    url: file.url,
    filename: file.originalName,
    size: file.size,
    mimetype: file.mimetype,
  }));

  ResponseHandler.success(res, { files });
});

/**
 * 删除文件
 */
router.delete('/file', authenticateToken, (req, res) => {
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

    ResponseHandler.success(res, { message: '文件删除成功' });
  } catch (error) {
    logger.error('删除文件失败:', error);
    ResponseHandler.error(res, '删除文件失败');
  }
});

module.exports = router;
