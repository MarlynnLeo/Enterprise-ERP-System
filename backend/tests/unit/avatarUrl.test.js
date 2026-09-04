/* global beforeEach, describe, expect, jest, test */

jest.mock('fs', () => ({
  statSync: jest.fn(),
}));

const fs = require('fs');
const { normalizeAvatarUrl } = require('../../src/utils/avatarUrl');

describe('avatar URL normalization', () => {
  beforeEach(() => {
    fs.statSync.mockReset();
  });

  test('preserves an existing local avatar URL', () => {
    fs.statSync.mockReturnValueOnce({ isFile: () => true });

    expect(
      normalizeAvatarUrl('/uploads/avatars/file_1.jpg', { uploadsRoot: 'C:/erp/uploads' })
    ).toBe('/uploads/avatars/file_1.jpg');
  });

  test('removes a stale local avatar URL', () => {
    fs.statSync.mockImplementationOnce(() => {
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    });

    expect(
      normalizeAvatarUrl('/uploads/avatars/missing.jpg', { uploadsRoot: 'C:/erp/uploads' })
    ).toBeNull();
  });

  test('rejects traversal while preserving non-local URLs', () => {
    expect(
      normalizeAvatarUrl('/uploads/avatars/..%2Fsecret.txt', { uploadsRoot: 'C:/erp/uploads' })
    ).toBeNull();
    expect(normalizeAvatarUrl('https://cdn.example.com/avatar.png')).toBe(
      'https://cdn.example.com/avatar.png'
    );
    expect(fs.statSync).not.toHaveBeenCalled();
  });
});
