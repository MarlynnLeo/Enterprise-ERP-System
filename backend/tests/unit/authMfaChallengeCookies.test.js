/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/jwtEnhanced', () => ({
  generateTokens: jest.fn(),
  setTokensToCookies: jest.fn(),
  clearTokenCookies: jest.fn(),
}));
jest.mock('../../src/utils/passwordSecurity', () => ({
  verifyPassword: jest.fn().mockResolvedValue(true),
  isPasswordExpired: jest.fn().mockReturnValue(false),
  isPasswordChangeRequired: jest.fn().mockReturnValue(false),
}));
jest.mock('../../src/services/system/AccountLockService', () => ({
  isLocked: jest.fn().mockResolvedValue({ locked: false }),
  clearFailedAttempts: jest.fn().mockResolvedValue(undefined),
  recordFailedAttempt: jest.fn(),
}));
jest.mock('../../src/services/auth/AuthService', () => ({
  findUserByUsername: jest.fn(),
}));
jest.mock('../../src/services/auth/MfaService', () => ({
  getLoginRequirement: jest.fn(),
  createChallenge: jest.fn(),
}));
jest.mock('../../src/services/system/AuditLogService', () => ({
  log: jest.fn().mockResolvedValue(undefined),
}));

const jwtEnhanced = require('../../src/config/jwtEnhanced');
const AuthService = require('../../src/services/auth/AuthService');
const MfaService = require('../../src/services/auth/MfaService');
const { login } = require('../../src/controllers/auth/authController');

function responseDouble() {
  return {
    set: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('password-to-MFA login boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuthService.findUserByUsername.mockResolvedValue({
      id: 42,
      username: 'privileged',
      password: 'bcrypt-hash',
      status: 1,
      token_version: 7,
    });
    MfaService.getLoginRequirement.mockResolvedValue({ enabled: true, required: true });
    MfaService.createChallenge.mockResolvedValue({ challengeId: 'a'.repeat(43), expiresIn: 300 });
  });

  test('clears stale cookies and issues no token before the second factor', async () => {
    const req = {
      body: { username: 'privileged', password: 'correct-password' },
      ip: '127.0.0.1',
      method: 'POST',
      originalUrl: '/api/auth/login',
      headers: {},
      get: jest.fn().mockReturnValue('jest'),
    };
    const res = responseDouble();

    await login(req, res);

    expect(jwtEnhanced.clearTokenCookies).toHaveBeenCalledWith(req, res);
    expect(jwtEnhanced.generateTokens).not.toHaveBeenCalled();
    expect(jwtEnhanced.setTokensToCookies).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store, max-age=0');
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json.mock.calls[0][0].data).toMatchObject({
      mfaRequired: true,
      challengeId: 'a'.repeat(43),
    });
  });
});
