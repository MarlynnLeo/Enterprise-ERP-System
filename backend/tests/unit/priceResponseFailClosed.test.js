jest.mock('../../src/utils/desensitizer', () => ({
  SENSITIVE_FIELDS: [],
  desensitizeDataForUser: jest.fn(),
  hasPricePermission: jest.fn(),
  isSensitiveFieldName: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));
const express = require('express');
const request = require('supertest');
const { desensitizeDataForUser } = require('../../src/utils/desensitizer');
const { desensitizeSensitiveResponse } = require('../../src/middleware/priceAccessControl');
const app = express();
app.use(desensitizeSensitiveResponse('view'));
app.get('/finance', (req, res) =>
  res.json({ code: 200, data: { cost: 99123, bankAccount: 'private-account' } })
);

test('a masking failure never sends the original financial payload or internal error', async () => {
  desensitizeDataForUser.mockRejectedValue(new Error('private internal failure'));
  const response = await request(app).get('/finance');
  expect(response.status).toBe(500);
  expect(response.body.errorCode).toBe('PRICE_ACCESS_CHECK_FAILED');
  expect(response.text).not.toMatch(/99123|private-account|private internal/);
});

test('successful masking still returns the sanitized response', async () => {
  desensitizeDataForUser.mockResolvedValue({ code: 200, data: { cost: null } });
  const response = await request(app).get('/finance');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ code: 200, data: { cost: null } });
});
