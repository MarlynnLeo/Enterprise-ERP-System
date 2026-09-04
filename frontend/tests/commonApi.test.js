import { beforeEach, describe, expect, test, vi } from 'vitest'

const apiGet = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: new Blob() })))

vi.mock('@/services/axiosInstance', () => ({
  api: { get: apiGet }
}))

import { commonApi } from '@/api/common'

describe('commonApi.downloadResource', () => {
  beforeEach(() => {
    apiGet.mockClear()
  })

  test('requests static uploads outside the API base path', async () => {
    await commonApi.downloadResource('/uploads/attachments/photo.jpg')

    expect(apiGet).toHaveBeenCalledWith('/uploads/attachments/photo.jpg', {
      responseType: 'blob',
      baseURL: ''
    })
  })

  test('keeps API download endpoints on the normal API client', async () => {
    await commonApi.downloadResource('/api/base-data/download-file?filePath=guide.pdf')

    expect(apiGet).toHaveBeenCalledWith('/api/base-data/download-file?filePath=guide.pdf', {
      responseType: 'blob'
    })
  })
})
