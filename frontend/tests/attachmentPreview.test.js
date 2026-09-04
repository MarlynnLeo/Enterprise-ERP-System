import { describe, expect, it } from 'vitest'
import { isPreviewableAttachmentImage } from '@/utils/attachmentPreview'

describe('attachment image preview policy', () => {
  it.each([
    [{ type: 'image/jpeg', name: 'photo.jpg' }, true],
    [{ type: 'IMAGE/PNG; charset=binary', name: 'photo' }, true],
    [{ url: '/uploads/attachments/photo.WEBP?version=2' }, true],
    [{ type: 'image/svg+xml', name: 'unsafe.svg' }, false],
    [{ type: 'image/svg+xml', name: 'misleading.jpg' }, false],
    [{ type: 'image/heic', name: 'photo.heic' }, false],
    [{ url: '/uploads/attachments/unsafe.svg' }, false],
    [{ url: '/uploads/attachments/report.pdf' }, false]
  ])('classifies %o as previewable=%s', (file, expected) => {
    expect(isPreviewableAttachmentImage(file)).toBe(expected)
  })
})
