/**
 * Single runtime definition of a super-admin role.
 * Role code/name is mutable metadata; only the protected database marker is
 * authoritative for privilege bypasses.
 */

function isSuperAdminRole(role) {
  return Number(role?.is_super_admin) === 1;
}

module.exports = { isSuperAdminRole };
