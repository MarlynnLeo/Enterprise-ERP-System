import {
  ATTACHMENT_IMAGE_EXTENSIONS,
  ATTACHMENT_IMAGE_MIME_TYPES
} from '@/constants/attachmentUpload'

const imageMimeTypes = new Set(ATTACHMENT_IMAGE_MIME_TYPES)
const imageExtensions = new Set(ATTACHMENT_IMAGE_EXTENSIONS)

const normalizeMimeType = (value) => String(value || '')
  .split(';', 1)[0]
  .trim()
  .toLowerCase()

const getExtension = (value) => {
  const cleanValue = String(value || '').split(/[?#]/, 1)[0]
  const filename = cleanValue.split('/').pop() || ''
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : ''
}

/**
 * Only browser-render image formats accepted by the server are previewable.
 * When MIME metadata exists it is authoritative; the extension fallback is
 * reserved for legacy records that did not persist a MIME type.
 */
export const isPreviewableAttachmentImage = (file) => {
  const mimeType = normalizeMimeType(
    file?.type || file?.mimetype || file?.mimeType || file?.fileType || file?.file_type
  )
  if (mimeType) return imageMimeTypes.has(mimeType)

  return imageExtensions.has(getExtension(file?.url || file?.name))
}
