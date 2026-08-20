/**
 * Authorization/session revocation helpers.
 *
 * Token-version increments are transaction-aware and must be committed with
 * the permission graph change. Socket disconnection happens only after commit.
 */
const { logger } = require('./logger');

function normalizePositiveIds(values) {
  const source = Array.isArray(values) ? values : [values];
  return [
    ...new Set(
      source
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];
}

function revokeUserSockets(userId, reason = 'authorization_revoked') {
  try {
    const { disconnectUserSockets } = require('../socket');
    return disconnectUserSockets(userId, reason);
  } catch (error) {
    logger.warn('[SessionRevocation] socket revocation unavailable', {
      userId,
      reason,
      error: error.message,
    });
    return 0;
  }
}

function disconnectUserSessions(userIds, reason = 'authorization_revoked') {
  const normalizedUserIds = normalizePositiveIds(userIds);
  for (const userId of normalizedUserIds) revokeUserSockets(userId, reason);
  return normalizedUserIds.length;
}

async function getUserIdsForRoles(connection, roleIds) {
  const normalizedRoleIds = normalizePositiveIds(roleIds);
  if (!normalizedRoleIds.length) return [];
  const placeholders = normalizedRoleIds.map(() => '?').join(',');
  const [rows] = await connection.execute(
    `SELECT DISTINCT user_id
       FROM user_roles
      WHERE role_id IN (${placeholders})`,
    normalizedRoleIds
  );
  return normalizePositiveIds(rows.map((row) => row.user_id));
}

async function incrementUserTokenVersions(connection, userIds) {
  const normalizedUserIds = normalizePositiveIds(userIds);
  if (!normalizedUserIds.length) return [];
  const placeholders = normalizedUserIds.map(() => '?').join(',');
  await connection.execute(
    `UPDATE users
        SET token_version = COALESCE(token_version, 0) + 1,
            updated_at = NOW()
      WHERE id IN (${placeholders})`,
    normalizedUserIds
  );
  return normalizedUserIds;
}

async function revokeRoleSessionsInTransaction(connection, roleIds) {
  if (!connection || typeof connection.execute !== 'function') {
    throw new Error('A transaction connection is required for role session revocation');
  }
  const userIds = await getUserIdsForRoles(connection, roleIds);
  return incrementUserTokenVersions(connection, userIds);
}

async function revokeRoleSessions(roleIds, reason = 'role_permissions_changed') {
  const { pool } = require('../config/db');
  const connection = await pool.getConnection();
  let userIds;
  try {
    await connection.beginTransaction();
    userIds = await revokeRoleSessionsInTransaction(connection, roleIds);
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original revocation error.
    }
    throw error;
  } finally {
    connection.release();
  }
  disconnectUserSessions(userIds, reason);
  return userIds.length;
}

module.exports = {
  disconnectUserSessions,
  getUserIdsForRoles,
  incrementUserTokenVersions,
  normalizePositiveIds,
  revokeRoleSessions,
  revokeRoleSessionsInTransaction,
  revokeUserSockets,
};
