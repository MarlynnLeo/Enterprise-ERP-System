const crypto = require('crypto');
const { pool } = require('../../config/db');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

class RefreshTokenService {
  static async register({ userId, jti, familyId, token, expiresAt, connection = pool }) {
    if (!Number.isInteger(Number(userId)) || Number(userId) <= 0 || !jti || !familyId || !token) {
      const error = new Error('invalid refresh token registration');
      error.code = 'INVALID_REFRESH_TOKEN';
      throw error;
    }
    await connection.execute(
      `INSERT INTO refresh_tokens
        (user_id, jti, family_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId, jti, familyId, hashToken(token), expiresAt]
    );
  }

  static async rotate({
    userId,
    oldJti,
    oldFamilyId,
    oldToken,
    newJti,
    newFamilyId,
    newToken,
    expiresAt,
  }) {
    const connection = await pool.getConnection();
    let committed = false;
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `UPDATE refresh_tokens
           SET used_at = NOW(), replaced_by_jti = ?
          WHERE user_id = ?
            AND jti = ?
            AND family_id = ?
            AND token_hash = ?
            AND used_at IS NULL
            AND revoked_at IS NULL
            AND expires_at > NOW()`,
        [newJti, userId, oldJti, oldFamilyId, hashToken(oldToken)]
      );

      if (result.affectedRows !== 1) {
        await connection.execute(
          `UPDATE refresh_tokens
              SET revoked_at = NOW(),
                  revoked_reason = COALESCE(revoked_reason, 'refresh_token_reuse')
            WHERE family_id = ? AND revoked_at IS NULL`,
          [oldFamilyId]
        );
        await connection.execute(
          `UPDATE users
              SET token_version = COALESCE(token_version, 0) + 1,
                  updated_at = NOW()
            WHERE id = ?`,
          [userId]
        );
        await connection.commit();
        committed = true;
        const error = new Error('刷新令牌已被使用或撤销');
        error.code = 'REFRESH_TOKEN_REUSED';
        throw error;
      }

      await this.register({
        userId,
        jti: newJti,
        familyId: newFamilyId,
        token: newToken,
        expiresAt,
        connection,
      });
      await connection.commit();
    } catch (error) {
      if (!committed) {
        try {
          await connection.rollback();
        } catch {
          // Preserve the original rotation error.
        }
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  static async revokeUserTokens(userId, connection = pool) {
    await connection.execute(
      `UPDATE refresh_tokens
          SET revoked_at = NOW(),
              revoked_reason = COALESCE(revoked_reason, 'user_session_revoked')
        WHERE user_id = ? AND revoked_at IS NULL`,
      [userId]
    );
  }
}

module.exports = RefreshTokenService;
