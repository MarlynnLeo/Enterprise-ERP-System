/* global afterAll, beforeAll, beforeEach, describe, expect, jest, test */

jest.mock('../../src/utils/sessionRevocation', () => ({
  revokeUserSockets: jest.fn(),
}));

const bcrypt = require('bcryptjs');
const { pool } = require('../../src/config/db');
const MfaService = require('../../src/services/auth/MfaService');

describe('MFA database security flow', () => {
  const username = `mfa_jest_${Date.now()}`;
  let userId;

  async function enableMfa() {
    const challenge = await MfaService.createChallenge({
      userId,
      purpose: 'enrollment',
      req: { ip: '127.0.0.1', get: () => 'jest' },
    });
    const enrollment = await MfaService.beginEnrollmentForChallenge(challenge.challengeId);
    const token = MfaService._test.createTotp(enrollment.secret, username).generate();
    const result = await MfaService.verifyChallenge({ challengeId: challenge.challengeId, token });
    return { challenge, enrollment, token, result };
  }

  beforeAll(async () => {
    const password = await bcrypt.hash('Mfa-Jest-Only-Password-2026', 12);
    const [result] = await pool.execute(
      `INSERT INTO users
        (username, password, real_name, role, status, employee_status,
         force_password_change, token_version, created_at, updated_at)
       VALUES (?, ?, 'MFA Jest', 'employee', 1, 'active', 0, 0, NOW(), NOW())`,
      [username, password]
    );
    userId = Number(result.insertId);
  });

  beforeEach(async () => {
    await pool.execute('DELETE FROM mfa_login_challenges WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM user_mfa WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    await pool.execute('UPDATE users SET token_version = 0 WHERE id = ?', [userId]);
  });

  afterAll(async () => {
    if (!userId) return;
    await pool.execute('DELETE FROM mfa_login_challenges WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM user_mfa WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
  });

  test('enrollment revokes old sessions and prevents TOTP/challenge replay', async () => {
    const enabled = await enableMfa();
    expect(enabled.result.recoveryCodes).toHaveLength(10);
    expect(new Set(enabled.result.recoveryCodes).size).toBe(10);

    const [userRows] = await pool.execute('SELECT token_version FROM users WHERE id = ?', [userId]);
    expect(Number(userRows[0].token_version)).toBe(1);

    const replayChallenge = await MfaService.createChallenge({ userId, purpose: 'login', req: {} });
    await expect(
      MfaService.verifyChallenge({ challengeId: replayChallenge.challengeId, token: enabled.token })
    ).rejects.toMatchObject({ code: 'MFA_INVALID_CODE' });

    const nextChallenge = await MfaService.createChallenge({ userId, purpose: 'login', req: {} });
    const nextToken = MfaService._test
      .createTotp(enabled.enrollment.secret, username)
      .generate({ timestamp: Date.now() + 30_000 });
    await expect(
      MfaService.verifyChallenge({ challengeId: nextChallenge.challengeId, token: nextToken })
    ).resolves.toMatchObject({ userId });
    await expect(
      MfaService.verifyChallenge({ challengeId: nextChallenge.challengeId, token: nextToken })
    ).rejects.toMatchObject({ code: 'MFA_CHALLENGE_INVALID' });
  });

  test('locks a challenge after five failed attempts', async () => {
    await enableMfa();
    const challenge = await MfaService.createChallenge({ userId, purpose: 'login', req: {} });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const expectedCode = attempt === 5 ? 'MFA_CHALLENGE_LOCKED' : 'MFA_INVALID_CODE';
      await expect(
        MfaService.verifyChallenge({ challengeId: challenge.challengeId, token: 'not-a-token' })
      ).rejects.toMatchObject({ code: expectedCode });
    }

    const [rows] = await pool.execute(
      'SELECT attempts, consumed_at FROM mfa_login_challenges WHERE challenge_hash = ? LIMIT 1',
      [MfaService.hashChallenge(challenge.challengeId)]
    );
    expect(Number(rows[0].attempts)).toBe(5);
    expect(rows[0].consumed_at).toBeTruthy();
  });

  test('rejects expired challenges', async () => {
    await enableMfa();
    const challenge = await MfaService.createChallenge({ userId, purpose: 'login', req: {} });
    await pool.execute(
      'UPDATE mfa_login_challenges SET expires_at = DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE challenge_hash = ?',
      [MfaService.hashChallenge(challenge.challengeId)]
    );
    await expect(
      MfaService.verifyChallenge({ challengeId: challenge.challengeId, token: 'not-a-token' })
    ).rejects.toMatchObject({ code: 'MFA_CHALLENGE_INVALID' });
  });

  test('recovery codes are one-time credentials', async () => {
    const enabled = await enableMfa();
    const recoveryCode = enabled.result.recoveryCodes[0];

    const first = await MfaService.createChallenge({ userId, purpose: 'login', req: {} });
    await expect(
      MfaService.verifyChallenge({ challengeId: first.challengeId, recoveryCode })
    ).resolves.toMatchObject({ userId });

    const second = await MfaService.createChallenge({ userId, purpose: 'login', req: {} });
    await expect(
      MfaService.verifyChallenge({ challengeId: second.challengeId, recoveryCode })
    ).rejects.toMatchObject({ code: 'MFA_INVALID_CODE' });
  });

  test('production-required roles cannot disable MFA', async () => {
    const enabled = await enableMfa();
    const [roles] = await pool.execute("SELECT id FROM roles WHERE code = 'admin' LIMIT 1");
    await pool.execute('INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, NOW())', [userId, roles[0].id]);

    const originalNodeEnv = process.env.NODE_ENV;
    const originalRequiredRoles = process.env.MFA_REQUIRED_ROLE_CODES;
    process.env.NODE_ENV = 'production';
    process.env.MFA_REQUIRED_ROLE_CODES = 'admin';
    try {
      const nextToken = MfaService._test
        .createTotp(enabled.enrollment.secret, username)
        .generate({ timestamp: Date.now() + 30_000 });
      await expect(
        MfaService.disableForUser(userId, username, nextToken, '')
      ).rejects.toMatchObject({ code: 'MFA_REQUIRED_FOR_ROLE' });
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalRequiredRoles === undefined) delete process.env.MFA_REQUIRED_ROLE_CODES;
      else process.env.MFA_REQUIRED_ROLE_CODES = originalRequiredRoles;
    }
  });
});
