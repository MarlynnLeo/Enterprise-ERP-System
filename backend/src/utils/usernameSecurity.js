/**
 * Canonical username handling shared by authentication, account locking, and
 * user creation. A single canonical value prevents case/whitespace variants
 * from bypassing lockout or creating duplicate identities.
 */

const USERNAME_PATTERN = /^[\p{L}\p{N}._@-]+$/u;

function normalizeUsername(value) {
  if (typeof value !== 'string') return null;

  const username = value.normalize('NFKC').trim().toLowerCase();
  if (username.length < 2 || username.length > 50) return null;
  if (!USERNAME_PATTERN.test(username)) return null;
  return username;
}

module.exports = {
  normalizeUsername,
};
