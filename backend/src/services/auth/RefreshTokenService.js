const crypto = require('crypto');
const { pool } = require('../../config/db');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/**
 * In-process grace cache for concurrent refresh (multi-tab).
 * When tab A rotates successfully, tab B may still submit the previous
 * refresh cookie for a few seconds. Replaying the same rotated pair is safe;
 * treating it as theft would revoke the whole family and freeze the UI.
 */
const REUSE_GRACE_MS = Math.min(
  60000,
  Math.max(1000, Number.parseInt(process.env.REFRESH_REUSE_GRACE_MS || '20000', 10) || 20000)
);
const MAX_GRACE_ENTRIES = 5000;
const recentRotations = new Map();

function pruneGraceCache(now = Date.now()) {
  for (const [key, entry] of recentRotations.entries()) {
    if (!entry || entry.expiresAt <= now) {
      recentRotations.delete(key);
    }
  }
  while (recentRotations.size > MAX_GRACE_ENTRIES) {
    recentRotations.delete(recentRotations.keys().next().value);
  }
}

function rememberRotation(oldToken, payload) {
  if (!oldToken || !payload?.refreshToken || !payload?.accessToken) return;
  pruneGraceCache();
  recentRotations.set(hashToken(oldToken), {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    refreshJti: payload.refreshJti || null,
    refreshFamilyId: payload.refreshFamilyId || null,
    expiresAt: Date.now() + REUSE_GRACE_MS,
  });
}

function takeGraceRotation(oldToken) {
  if (!oldToken) return null;
  pruneGraceCache();
  const entry = recentRotations.get(hashToken(oldToken));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    recentRotations.delete(hashToken(oldToken));
    return null;
  }
  return entry;
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

  /**
   * @returns {Promise<{ status: 'rotated' } | { status: 'grace', accessToken: string, refreshToken: string, refreshJti?: string, refreshFamilyId?: string }>}
   */
  static async rotate({
    userId,
    oldJti,
    oldFamilyId,
    oldToken,
    newJti,
    newFamilyId,
    newToken,
    newAccessToken,
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

      if (result.affectedRows === 1) {
        await this.register({
          userId,
          jti: newJti,
          familyId: newFamilyId,
          token: newToken,
          expiresAt,
          connection,
        });
        await connection.commit();
        committed = true;

        rememberRotation(oldToken, {
          accessToken: newAccessToken,
          refreshToken: newToken,
          refreshJti: newJti,
          refreshFamilyId: newFamilyId,
        });
        return { status: 'rotated' };
      }

      // Concurrent multi-tab refresh: previous request already rotated this jti.
      const grace = takeGraceRotation(oldToken);
      if (grace) {
        await connection.rollback();
        committed = true;
        return {
          status: 'grace',
          accessToken: grace.accessToken,
          refreshToken: grace.refreshToken,
          refreshJti: grace.refreshJti,
          refreshFamilyId: grace.refreshFamilyId,
        };
      }

      // Confirm the row was recently used (true race) vs stolen/expired.
      const [rows] = await connection.execute(
        `SELECT used_at, replaced_by_jti, revoked_at
           FROM refresh_tokens
          WHERE user_id = ?
            AND jti = ?
            AND family_id = ?
            AND token_hash = ?
          LIMIT 1`,
        [userId, oldJti, oldFamilyId, hashToken(oldToken)]
      );
      const existing = rows[0];
      const usedAtMs = existing?.used_at ? new Date(existing.used_at).getTime() : 0;
      const recentlyUsed =
        existing &&
        existing.replaced_by_jti &&
        !existing.revoked_at &&
        usedAtMs > 0 &&
        Date.now() - usedAtMs <= REUSE_GRACE_MS;

      if (recentlyUsed) {
        // Grace cache miss (multi-instance / restart). Do not nuke the family;
        // ask the client to retry once with the cookie jar updated by the winner.
        await connection.rollback();
        committed = true;
        const error = new Error('刷新令牌刚被并发轮换，请重试');
        error.code = 'REFRESH_TOKEN_BUSY';
        throw error;
      }

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

  /** test helper */
  static _clearGraceCacheForTests() {
    recentRotations.clear();
  }
}

module.exports = RefreshTokenService;
