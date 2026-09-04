/**
 * 通用附件上传契约。
 *
 * /api/upload/file 的服务端限制为单文件 10MB；网页端的校验、提示和
 * accept 列表统一从这里读取，避免各页面出现不同的上传规则。
 */
export const ATTACHMENT_MAX_SIZE_MB = 10

export const ATTACHMENT_IMAGE_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/webp'
])

export const ATTACHMENT_IMAGE_EXTENSIONS = Object.freeze([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.webp'
])

export const ATTACHMENT_MIME_TYPES = Object.freeze([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/octet-stream',
  ...ATTACHMENT_IMAGE_MIME_TYPES,
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed'
])

export const ATTACHMENT_EXTENSIONS = Object.freeze([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  ...ATTACHMENT_IMAGE_EXTENSIONS,
  '.zip',
  '.rar',
  '.7z'
])

export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.join(',')
