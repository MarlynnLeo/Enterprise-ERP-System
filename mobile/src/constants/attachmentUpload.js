/**
 * 移动端质量附件上传契约。
 * 与后端 /api/upload/file 的单文件限制保持一致。
 */
export const ATTACHMENT_MAX_SIZE_MB = 10
export const ATTACHMENT_MAX_SIZE_BYTES = ATTACHMENT_MAX_SIZE_MB * 1024 * 1024

export const INSPECTION_PHOTO_ACCEPT = 'image/jpeg,image/png,image/gif,image/bmp,image/webp'
export const INSPECTION_PHOTO_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/webp'
])
export const INSPECTION_PHOTO_EXTENSIONS = Object.freeze([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.webp'
])
export const INSPECTION_PHOTO_MAX_COUNT = 20
