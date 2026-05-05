/**
 * 统一文件上传中间件
 * 提供标准化的文件上传、验证和处理功能
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { ErrorFactory } = require('./unifiedErrorHandler');

// 文件类型配置
const FILE_TYPES = {
  IMAGE: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'],
    maxSize: 5 * 1024 * 1024, // 5MB
  },
  DOCUMENT: {
    extensions: ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt'],
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
    ],
    maxSize: 10 * 1024 * 1024, // 10MB
  },
  AVATAR: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxSize: 2 * 1024 * 1024, // 2MB
  },
  EXCEL: {
    extensions: ['.xlsx', '.xls', '.csv'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/octet-stream',
    ],
    maxSize: 10 * 1024 * 1024, // 10MB
  },
  ARCHIVE: {
    extensions: ['.zip', '.rar', '.7z'],
    mimeTypes: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'],
    maxSize: 50 * 1024 * 1024, // 50MB
  },
};

// 存储策略
const STORAGE_STRATEGIES = {
  DISK: 'disk',
  MEMORY: 'memory',
  CLOUD: 'cloud',
};

// 文件上传配置类
class FileUploadConfig {
  constructor(options = {}) {
    this.allowedTypes = options.allowedTypes || ['DOCUMENT'];
    this.maxSize = options.maxSize || 10 * 1024 * 1024;
    this.storage = options.storage || STORAGE_STRATEGIES.DISK;
    this.destination = options.destination || 'uploads';
    this.preserveOriginalName = options.preserveOriginalName || false;
    this.generateThumbnails = options.generateThumbnails || false;
    this.allowMultiple = options.allowMultiple || false;
    this.maxFiles = options.maxFiles || 5;
    this.fieldName = options.fieldName || (this.allowMultiple ? 'files' : 'file');
    this.urlPrefix =
      options.urlPrefix ||
      `/${this.destination.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}`;
  }

  getAllowedExtensions() {
    const extensions = new Set();
    this.allowedTypes.forEach((type) => {
      if (FILE_TYPES[type]) {
        FILE_TYPES[type].extensions.forEach((ext) => extensions.add(ext));
      }
    });
    return Array.from(extensions);
  }

  getAllowedMimeTypes() {
    const mimeTypes = new Set();
    this.allowedTypes.forEach((type) => {
      if (FILE_TYPES[type]) {
        FILE_TYPES[type].mimeTypes.forEach((mime) => mimeTypes.add(mime));
      }
    });
    return Array.from(mimeTypes);
  }

  getMaxFileSize() {
    return Math.min(
      this.maxSize,
      Math.max(
        ...this.allowedTypes.map((type) =>
          FILE_TYPES[type] ? FILE_TYPES[type].maxSize : this.maxSize
        )
      )
    );
  }
}

// 文件验证器
class FileValidator {
  static validateFile(file, config) {
    const errors = [];

    // 检查文件大小
    if (file.size > config.getMaxFileSize()) {
      errors.push(`文件大小不能超过 ${this.formatFileSize(config.getMaxFileSize())}`);
    }

    // 检查文件扩展名
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = config.getAllowedExtensions();
    if (!allowedExtensions.includes(ext)) {
      errors.push(`不支持的文件类型，允许的类型: ${allowedExtensions.join(', ')}`);
    }

    // 检查MIME类型
    const allowedMimeTypes = config.getAllowedMimeTypes();
    if (!allowedMimeTypes.includes(file.mimetype)) {
      errors.push('不支持的文件格式');
    }

    // 检查文件名安全性
    if (this.hasUnsafeCharacters(file.originalname)) {
      errors.push('文件名包含不安全的字符');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static hasUnsafeCharacters(filename) {
    // 检查危险字符和路径遍历
    // eslint-disable-next-line no-control-regex -- filenames must reject ASCII control characters.
    const unsafePattern = new RegExp('[<>:"|?*\\x00-\\x1f]|\\.\\.|/|\\\\');
    return unsafePattern.test(filename);
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// 文件名生成器
class FilenameGenerator {
  static generate(originalname, preserveOriginal = false) {
    const ext = path.extname(originalname).toLowerCase();
    const basename = path.basename(originalname, ext);

    if (preserveOriginal) {
      // 清理原始文件名但保持可读性
      const cleanBasename = basename.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').substring(0, 50);
      return `${cleanBasename}_${Date.now()}${ext}`;
    } else {
      // 生成唯一文件名
      const timestamp = Date.now();
      const random = crypto.randomBytes(4).toString('hex');
      return `file_${timestamp}_${random}${ext}`;
    }
  }
}

// 存储策略工厂
class StorageFactory {
  static createDiskStorage(config) {
    return multer.diskStorage({
      destination: async (req, file, cb) => {
        try {
          const uploadPath = path.join(process.cwd(), config.destination);
          await fs.mkdir(uploadPath, { recursive: true });
          cb(null, uploadPath);
        } catch (error) {
          cb(error);
        }
      },
      filename: (req, file, cb) => {
        const filename = FilenameGenerator.generate(file.originalname, config.preserveOriginalName);
        cb(null, filename);
      },
    });
  }

  static createMemoryStorage() {
    return multer.memoryStorage();
  }
}

// 统一文件上传中间件工厂
function createFileUploadMiddleware(options = {}) {
  const config = new FileUploadConfig(options);

  // 选择存储策略
  let storage;
  switch (config.storage) {
    case STORAGE_STRATEGIES.MEMORY:
      storage = StorageFactory.createMemoryStorage();
      break;
    case STORAGE_STRATEGIES.DISK:
    default:
      storage = StorageFactory.createDiskStorage(config);
      break;
  }

  // 创建multer实例
  const upload = multer({
    storage,
    limits: {
      fileSize: config.getMaxFileSize(),
      files: config.maxFiles,
    },
    fileFilter: (req, file, cb) => {
      const validation = FileValidator.validateFile(file, config);
      if (validation.isValid) {
        cb(null, true);
      } else {
        cb(new Error(validation.errors.join('; ')));
      }
    },
  });

  // 返回中间件函数
  return (req, res, next) => {
    const uploadHandler = config.allowMultiple
      ? upload.array(config.fieldName, config.maxFiles)
      : upload.single(config.fieldName);

    uploadHandler(req, res, (err) => {
      if (err) {
        let error;

        if (err.code === 'LIMIT_FILE_SIZE') {
          error = ErrorFactory.business(
            'FILE_TOO_LARGE',
            `文件大小不能超过 ${FileValidator.formatFileSize(config.getMaxFileSize())}`
          );
        } else if (err.code === 'LIMIT_FILE_COUNT') {
          error = ErrorFactory.business(
            'VALIDATION_ERROR',
            `最多只能上传 ${config.maxFiles} 个文件`
          );
        } else if (
          err.message.includes('不支持的文件类型') ||
          err.message.includes('不支持的文件格式')
        ) {
          error = ErrorFactory.business('INVALID_FILE_TYPE', err.message);
        } else {
          error = ErrorFactory.business('FILE_UPLOAD_ERROR', err.message || '文件上传失败');
        }

        return next(error);
      }

      // 添加文件信息到请求对象
      if (req.file) {
        req.fileInfo = {
          originalName: req.file.originalname,
          filename: req.file.filename,
          size: req.file.size,
          mimetype: req.file.mimetype,
          path: req.file.path,
          url: config.storage === STORAGE_STRATEGIES.DISK ? `${config.urlPrefix}/${req.file.filename}` : null,
        };
      }

      if (req.files) {
        req.filesInfo = req.files.map((file) => ({
          originalName: file.originalname,
          filename: file.filename,
          size: file.size,
          mimetype: file.mimetype,
          path: file.path,
          url: config.storage === STORAGE_STRATEGIES.DISK ? `${config.urlPrefix}/${file.filename}` : null,
        }));
      }

      next();
    });
  };
}

// 预定义的文件上传中间件
const FileUploadMiddlewares = {
  // 图片上传
  image: createFileUploadMiddleware({
    allowedTypes: ['IMAGE'],
    maxSize: 5 * 1024 * 1024,
    storage: STORAGE_STRATEGIES.DISK,
    destination: 'uploads/images',
  }),

  // 文档上传
  document: createFileUploadMiddleware({
    allowedTypes: ['DOCUMENT'],
    maxSize: 10 * 1024 * 1024,
    storage: STORAGE_STRATEGIES.DISK,
    destination: 'uploads/documents',
  }),

  // Excel文件上传
  excel: createFileUploadMiddleware({
    allowedTypes: ['EXCEL'],
    maxSize: 10 * 1024 * 1024,
    storage: STORAGE_STRATEGIES.MEMORY, // Excel通常需要立即处理
  }),

  // 多文件上传
  multiple: createFileUploadMiddleware({
    allowedTypes: ['IMAGE', 'DOCUMENT'],
    allowMultiple: true,
    maxFiles: 5,
    storage: STORAGE_STRATEGIES.DISK,
    destination: 'uploads/multiple',
  }),

  // ERP通用附件上传
  attachment: createFileUploadMiddleware({
    allowedTypes: ['IMAGE', 'DOCUMENT', 'EXCEL', 'ARCHIVE'],
    maxSize: 50 * 1024 * 1024,
    storage: STORAGE_STRATEGIES.DISK,
    destination: 'uploads',
  }),

  // 通用附件单文件上传
  attachmentFile: createFileUploadMiddleware({
    allowedTypes: ['IMAGE', 'DOCUMENT', 'EXCEL', 'ARCHIVE'],
    maxSize: 10 * 1024 * 1024,
    storage: STORAGE_STRATEGIES.DISK,
    destination: 'uploads/attachments',
    fieldName: 'file',
  }),

  // 通用附件多文件上传
  attachmentFiles: createFileUploadMiddleware({
    allowedTypes: ['IMAGE', 'DOCUMENT', 'EXCEL', 'ARCHIVE'],
    maxSize: 10 * 1024 * 1024,
    storage: STORAGE_STRATEGIES.DISK,
    destination: 'uploads/attachments',
    fieldName: 'files',
    allowMultiple: true,
    maxFiles: 5,
  }),

  // 用户头像上传
  avatar: createFileUploadMiddleware({
    allowedTypes: ['AVATAR'],
    maxSize: 2 * 1024 * 1024,
    storage: STORAGE_STRATEGIES.DISK,
    destination: 'uploads/avatars',
    fieldName: 'avatar',
  }),

  // 打印Logo上传
  logo: createFileUploadMiddleware({
    allowedTypes: ['IMAGE'],
    maxSize: 5 * 1024 * 1024,
    storage: STORAGE_STRATEGIES.DISK,
    destination: 'uploads/logos',
    fieldName: 'logo',
  }),
};

module.exports = {
  FILE_TYPES,
  STORAGE_STRATEGIES,
  FileUploadConfig,
  FileValidator,
  FilenameGenerator,
  createFileUploadMiddleware,
  FileUploadMiddlewares,
};
