import { describe, expect, test } from 'vitest'

import { API_CONFIG, buildResourceUrl } from '@/config/app'

describe('mobile buildResourceUrl', () => {
  test('keeps controlled relative upload paths', () => {
    const resourceUrl = buildResourceUrl('/uploads/attachments/photo.jpg')
    expect(resourceUrl).toMatch(/\/uploads\/attachments\/photo\.jpg$/)
    if (API_CONFIG.baseURL) {
      expect(resourceUrl).toContain(new URL(API_CONFIG.baseURL).origin)
    }
  })

  test('allows the current origin and rejects untrusted absolute URLs', () => {
    const sameOriginUrl = `${window.location.origin}/uploads/attachments/photo.jpg`

    expect(buildResourceUrl(sameOriginUrl)).toBe(sameOriginUrl)
    expect(buildResourceUrl('https://untrusted.example/uploads/photo.jpg')).toBe('')
    expect(buildResourceUrl('javascript:alert(1)')).toBe('')
    expect(buildResourceUrl('//untrusted.example/uploads/photo.jpg')).toBe('')
  })
})
