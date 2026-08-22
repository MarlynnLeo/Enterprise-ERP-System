const {
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

  it('keeps row-level DataScope and ScopeGuard SSOT wired', () => {
    expect(auditRowLevelDataScopeGuards()).toEqual([]);
  });
});
