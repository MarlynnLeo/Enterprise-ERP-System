/* global jest, test, expect, beforeEach */
jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn(), query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const FileAccessService = require('../../src/services/FileAccessService');

beforeEach(() => jest.restoreAllMocks());

test('create-only reporter can preview their pending photo without system file download permission', async () => {
  jest.spyOn(FileAccessService, 'findAccessRecord').mockResolvedValue({
    file_url: '/uploads/anomalies/file_123.png',
    source: 'anomaly_image',
    uploaded_by: 7,
  });
  await expect(
    FileAccessService.authorize({
      userId: 7,
      fileUrl: '/uploads/anomalies/file_123.png',
      userPermissions: ['production:anomaly:create'],
    })
  ).resolves.toMatchObject({ allowed: true });
  await expect(
    FileAccessService.authorize({
      userId: 8,
      fileUrl: '/uploads/anomalies/file_123.png',
      userPermissions: ['production:anomaly:create'],
    })
  ).resolves.toMatchObject({ allowed: false, reason: 'FILE_OWNER_MISMATCH' });
});

test('bound images require anomaly view permission and a live report', async () => {
  jest.spyOn(FileAccessService, 'findAccessRecord').mockResolvedValue({
    file_url: '/uploads/anomalies/file_123.png',
    source: 'anomaly_image',
    uploaded_by: 7,
    business_type: 'anomaly_report',
    business_id: 99,
  });
  const exists = jest
    .spyOn(FileAccessService, 'assertBusinessObjectExists')
    .mockResolvedValue(true);
  jest.spyOn(FileAccessService, 'assertBusinessObjectAccess').mockResolvedValue(true);
  const options = {
    userId: 8,
    fileUrl: '/uploads/anomalies/file_123.png',
    req: { user: { id: 8 } },
  };
  await expect(
    FileAccessService.authorize({ ...options, userPermissions: ['production:anomaly:view'] })
  ).resolves.toMatchObject({ allowed: true });
  await expect(
    FileAccessService.authorize({ ...options, userPermissions: ['system:files:download'] })
  ).resolves.toMatchObject({ allowed: false, reason: 'FEATURE_PERMISSION_DENIED' });
  exists.mockResolvedValue(false);
  await expect(
    FileAccessService.authorize({ ...options, userPermissions: ['production:anomaly:view'] })
  ).resolves.toMatchObject({ allowed: false, reason: 'BUSINESS_OBJECT_NOT_FOUND' });
});

test('binding protects pending ownership and rejects files already claimed by another report', async () => {
  const connection = { execute: jest.fn() };
  const payload = {
    userId: 7,
    fileUrl: '/uploads/anomalies/file_123.png',
    businessType: 'anomaly_report',
    businessId: 99,
  };
  connection.execute.mockResolvedValueOnce([[{ id: 1, uploaded_by: 8 }]]);
  await expect(
    FileAccessService.bindExistingUploadInTransaction(connection, payload)
  ).rejects.toMatchObject({ code: 'FILE_OWNER_MISMATCH' });
  connection.execute.mockResolvedValueOnce([
    [{ id: 1, uploaded_by: 7, business_type: 'anomaly_report', business_id: 98 }],
  ]);
  await expect(
    FileAccessService.bindExistingUploadInTransaction(connection, payload)
  ).rejects.toMatchObject({ code: 'FILE_ACCESS_BINDING_CONFLICT' });
  expect(connection.execute).toHaveBeenCalledTimes(2);
});
