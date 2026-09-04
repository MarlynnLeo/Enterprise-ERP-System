import { describe, expect, test } from 'vitest'

import { buildDownloadUrl, buildResourceUrl } from '@/config/app'

describe('buildResourceUrl', () => {
  test('keeps controlled relative upload paths', () => {
    expect(buildResourceUrl('/uploads/attachments/photo.jpg')).toBe(
      '/uploads/attachments/photo.jpg'
    )
    expect(buildResourceUrl('uploads/attachments/photo.jpg')).toBe(
      '/uploads/attachments/photo.jpg'
    )
  })

  test('allows HTTP resources only from the current or configured API origin', () => {
    const sameOriginUrl = `${window.location.origin}/uploads/attachments/photo.jpg`

    expect(buildResourceUrl(sameOriginUrl)).toBe(sameOriginUrl)
    expect(buildResourceUrl('https://untrusted.example/uploads/photo.jpg')).toBe('')
  })

  test('rejects executable, opaque, and protocol-relative resource URLs', () => {
    expect(buildResourceUrl('javascript:alert(1)')).toBe('')
    expect(buildResourceUrl('data:text/html,<script>alert(1)</script>')).toBe('')
    expect(buildResourceUrl('blob:https://untrusted.example/id')).toBe('')
    expect(buildResourceUrl('//untrusted.example/uploads/photo.jpg')).toBe('')
  })

  test('keeps upload downloads outside the API base path', () => {
    expect(buildDownloadUrl('/uploads/attachments/photo.jpg')).toBe(
      '/uploads/attachments/photo.jpg'
    )
    expect(buildDownloadUrl('/api/base-data/download-file?filePath=x.pdf')).toBe(
      '/api/base-data/download-file?filePath=x.pdf'
    )
    expect(buildDownloadUrl('javascript:alert(1)')).toBe('')
  })
})
