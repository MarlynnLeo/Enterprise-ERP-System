/* global describe, expect, test */

const {
  FileUploadConfig,
  FileValidator,
} = require('../../src/middleware/unifiedFileUpload');

const attachmentConfig = new FileUploadConfig({
  allowedTypes: ['IMAGE', 'DOCUMENT', 'EXCEL', 'ARCHIVE'],
  maxSize: 10 * 1024 * 1024,
});

const file = (originalname, mimetype, buffer = Buffer.from('')) => ({
  originalname,
  mimetype,
  size: buffer.length,
  buffer,
});

describe('unified upload policy', () => {
  test('keeps the shared contract aligned with the actual attachment middleware', () => {
    expect(attachmentConfig.getAllowedExtensions()).toEqual(
      expect.arrayContaining(['.bmp', '.webp', '.ppt', '.pptx', '.rar', '.7z'])
    );
    expect(attachmentConfig.getAllowedMimeTypes()).toEqual(
      expect.arrayContaining(['application/vnd.rar', 'application/octet-stream'])
    );
  });

  test('only accepts octet-stream for Excel/CSV extensions', () => {
    const validation = FileValidator.validateFile(
      file('payload.exe', 'application/octet-stream'),
      attachmentConfig
    );

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('application/octet-stream 仅允许 Excel/CSV 扩展名');
  });

  test('validates octet-stream xlsx by ZIP signature', async () => {
    const valid = await FileValidator.validateMagicAfterUpload(
      file('import.xlsx', 'application/octet-stream', Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    );
    const invalid = await FileValidator.validateMagicAfterUpload(
      file('import.xlsx', 'application/octet-stream', Buffer.from('%PDF-1.7'))
    );

    expect(valid.isValid).toBe(true);
    expect(invalid.isValid).toBe(false);
  });

  test('validates octet-stream xls and CSV payloads without allowing binary data', async () => {
    const xls = await FileValidator.validateMagicAfterUpload(
      file('legacy.xls', 'application/octet-stream', Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
    );
    const csv = await FileValidator.validateMagicAfterUpload(
      file('rows.csv', 'application/octet-stream', Buffer.from('code,name\nA-01,测试', 'utf8'))
    );
    const binaryCsv = await FileValidator.validateMagicAfterUpload(
      file('rows.csv', 'application/octet-stream', Buffer.from([0x00, 0xff, 0x01]))
    );

    expect(xls.isValid).toBe(true);
    expect(csv.isValid).toBe(true);
    expect(binaryCsv.isValid).toBe(false);
  });

  test('checks archive signatures when a specific archive MIME is declared', async () => {
    const rar = await FileValidator.validateMagicAfterUpload(
      file('archive.rar', 'application/vnd.rar', Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]))
    );
    const fake = await FileValidator.validateMagicAfterUpload(
      file('archive.rar', 'application/vnd.rar', Buffer.from('not a rar'))
    );

    expect(rar.isValid).toBe(true);
    expect(fake.isValid).toBe(false);
  });
});
