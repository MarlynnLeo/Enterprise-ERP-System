/* global jest, test, expect, beforeEach, afterEach */
jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn(), query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/middleware/authEnhanced', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.headers['x-test-user']) return res.status(401).json({ message: 'login required' });
    req.user = { id: Number(req.headers['x-test-user']) };
    next();
  },
}));
jest.mock('../../src/services/PermissionService', () => ({ getUserPermissions: jest.fn() }));
jest.mock('../../src/services/DataScopeService', () => ({ attachRequestScope: jest.fn() }));
jest.mock('../../src/services/business/AnomalyReportService', () => ({
  getTaskOptions: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const FileAccessService = require('../../src/services/FileAccessService');
const PermissionService = require('../../src/services/PermissionService');
const AnomalyReportService = require('../../src/services/business/AnomalyReportService');
const router = require('../../src/routes/business/anomalyReportRoutes');
const app = express();
app.use('/anomalies', router);
app.use((error, _req, res, _next) => res.status(400).json({ message: error.message }));
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
);
let uploaded;

beforeEach(() => {
  uploaded = [];
  jest.clearAllMocks();
  PermissionService.getUserPermissions.mockResolvedValue(['production:anomaly:create']);
  jest.spyOn(FileAccessService, 'recordUpload').mockImplementation(async (payload) => {
    uploaded.push(payload.fileUrl);
  });
});
afterEach(() => {
  FileAccessService.removeLocalFiles(uploaded);
  jest.restoreAllMocks();
});

test('create permission supports genuine multipart photo upload and scoped task options', async () => {
  const res = await request(app)
    .post('/anomalies/images')
    .set('x-test-user', '7')
    .attach('file', png, { filename: '现场.png', contentType: 'image/png' });
  expect(res.status).toBe(200);
  expect(res.body.data).toMatchObject({
    url: expect.stringMatching(/^\/uploads\/anomalies\/file_.*\.png$/),
    mimetype: 'image/png',
    size: png.length,
  });
  expect(FileAccessService.recordUpload).toHaveBeenCalledWith(
    expect.objectContaining({ source: 'anomaly_image', uploadedBy: 7, isPublic: 0 })
  );
  AnomalyReportService.getTaskOptions.mockResolvedValue({
    list: [{ id: 23, product_name: '开关' }],
    total: 1,
    page: 1,
    pageSize: 20,
  });
  const options = await request(app).get('/anomalies/task-options').set('x-test-user', '7');
  expect(options.status).toBe(200);
  expect(options.body.data.list[0]).toMatchObject({ id: 23, productName: '开关' });
});

test('authentication and anomaly create permission are required before file upload', async () => {
  const guest = await request(app).post('/anomalies/images').attach('file', png, 'photo.png');
  expect(guest.status).toBe(401);
  PermissionService.getUserPermissions.mockResolvedValue(['production:anomaly:view']);
  const viewer = await request(app)
    .post('/anomalies/images')
    .set('x-test-user', '7')
    .attach('file', png, 'photo.png');
  expect(viewer.status).toBe(403);
  expect(FileAccessService.recordUpload).not.toHaveBeenCalled();
});

test.each([
  [Buffer.from('not an image'), 'photo.png', 'image/png'],
  [Buffer.from('<svg></svg>'), 'photo.svg', 'image/svg+xml'],
  [Buffer.alloc(5 * 1024 * 1024 + 1), 'photo.png', 'image/png'],
])(
  'rejects forged, unsupported and oversized photos without recording an upload',
  async (buffer, filename, contentType) => {
    const res = await request(app)
      .post('/anomalies/images')
      .set('x-test-user', '7')
      .attach('file', buffer, { filename, contentType });
    expect(res.status).toBe(400);
    expect(FileAccessService.recordUpload).not.toHaveBeenCalled();
  }
);
