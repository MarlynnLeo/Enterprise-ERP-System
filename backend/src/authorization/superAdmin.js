/**
 * Single runtime definition of a super-admin role.
 * Role code/name is mutable metadata; only the protected database marker is
 * authoritative for privilege bypasses.
 */

function isSuperAdminRole(role) {
  return Number(role?.is_super_admin) === 1;
}

/**
 * Role codes that must never be created or renamed into by role management.
 *
 * These codes historically carried an implicit super-admin meaning (isAdmin()
 * used to match on them), so a role administrator could self-escalate by simply
 * naming a role `super_admin`. Authorization now keys exclusively off
 * `roles.is_super_admin`, but the codes stay reserved so they cannot be
 * squatted, cannot be confused with the built-in roles, and cannot silently
 * regain privilege meaning if code-based checks are ever reintroduced.
 */
const RESERVED_ROLE_CODES = Object.freeze(
  new Set(['admin', 'super_admin', 'system_admin', 'superadmin', 'root'])
);

function isReservedRoleCode(code) {
  if (!code || typeof code !== 'string') return false;
  return RESERVED_ROLE_CODES.has(code.trim().toLowerCase());
}

module.exports = { isSuperAdminRole, RESERVED_ROLE_CODES, isReservedRoleCode };
