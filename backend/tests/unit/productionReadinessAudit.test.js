const {
  auditPermissionSsotGuards,
  auditRoutes,
  auditRowLevelDataScopeGuards,
  auditStaticGuards,
} = require('../../scripts/audit-production-readiness');

describe('production readiness audit', () => {
  it('keeps protected routes covered by auth and the permission matrix', () => {
    const result = auditRoutes();

    expect(result.missingAuth).toEqual([]);
    expect(result.missingPermission).toEqual([]);
    expect(result.permissions).toContain('inventory:stock:view');
    expect(result.permissions).toContain('system:backup:view');
  });

  it('keeps production safety guards wired', () => {
    expect(auditStaticGuards()).toEqual([]);
  });

  it('keeps permission authorization on the explicit SSOT', () => {
    expect(auditPermissionSsotGuards()).toEqual([]);
  });

  it('rejects diagnostic fallbacks from role_permissions to role_menus', () => {
    const findings = auditPermissionSsotGuards({
      permissionDiagnostics: `
        class PermissionDiagnostics {
          static async diagnoseUserPermissions() {
            try {
              await pool.execute('SELECT * FROM role_permissions');
            } catch {
              await pool.execute('SELECT * FROM menus JOIN role_menus');
            }
          }
        }
      `,
    });

    expect(findings).toContain('permission diagnostics must not fall back to role_menus');
  });

  it('keeps row-level DataScope and ScopeGuard SSOT wired', () => {
    expect(auditRowLevelDataScopeGuards()).toEqual([]);
  });
});
