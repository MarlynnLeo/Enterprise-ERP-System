jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('../../src/services/PermissionService', () => ({
  isAdmin: jest.fn(),
  getUserPermissions: jest.fn(),
}));

jest.mock('../../src/services/DataScopeService', () => ({
  attachRequestScope: jest.fn(),
}));

const {
  ACTION_PERMISSIONS,
  FINANCE_DEPARTMENT_NAME,
  canAccessInventoryApproval,
  isFinanceDepartment,
  requireInventoryApprovalAccess,
} = require('../../src/middleware/inventoryApprovalAccess');
const { pool } = require('../../src/config/db');
const PermissionService = require('../../src/services/PermissionService');
const DataScopeService = require('../../src/services/DataScopeService');

describe('inventory approval access policy', () => {
  test('super administrators can access every approval action', () => {
    expect(
      canAccessInventoryApproval({ isAdmin: true, departmentName: '仓库部', action: 'reverse' })
    ).toBe(true);
  });

  test('users need the permission for the requested action', () => {
    expect(
      canAccessInventoryApproval({
        departmentName: FINANCE_DEPARTMENT_NAME,
        permissions: [ACTION_PERMISSIONS.view],
        action: 'view',
      })
    ).toBe(true);
    expect(
      canAccessInventoryApproval({
        departmentName: FINANCE_DEPARTMENT_NAME,
        permissions: [ACTION_PERMISSIONS.view],
        action: 'approve',
      })
    ).toBe(false);
    expect(
      canAccessInventoryApproval({
        departmentName: FINANCE_DEPARTMENT_NAME,
        permissions: [ACTION_PERMISSIONS.reverse],
        action: 'reverse',
      })
    ).toBe(true);
  });

  test('department assignment does not override an explicit approval permission', () => {
    expect(
      canAccessInventoryApproval({
        departmentName: '仓库部',
        permissions: [ACTION_PERMISSIONS.view, ACTION_PERMISSIONS.approve],
        action: 'approve',
      })
    ).toBe(true);
  });

  test('department matching is exact and whitespace tolerant', () => {
    expect(isFinanceDepartment(` ${FINANCE_DEPARTMENT_NAME} `)).toBe(true);
    expect(isFinanceDepartment('财务')).toBe(false);
    expect(isFinanceDepartment('')).toBe(false);
  });

  test.each([
    'inventory:outbound:view', 'inventory:inbound:view', 'inventory:transfer:view',
    'inventory:check:view', 'sales:outbound:view', 'purchase:receipts:view',
    'purchase:returns:view', 'sales:returns:view', 'sales:exchanges:view',
  ])('business permission %s does not expose finance posting records', (permission) => {
    expect(canAccessInventoryApproval({ permissions: [permission], action: 'view' })).toBe(false);
  });

  test.each(['unknown', 'toString', '__proto__'])(
    'unknown action %s fails closed even for an administrator', (action) => {
      expect(canAccessInventoryApproval({ isAdmin: true, action })).toBe(false);
    }
  );

  test.each(['/inventory-postings', '/inventory-postings/91', '/inventory-postings/by-source'])(
    'rejects a purchase viewer before serving %s', async (path) => {
      pool.query.mockResolvedValue([[{ department_id: 2, department_name: '采购部' }]]);
      PermissionService.isAdmin.mockResolvedValue(false);
      PermissionService.getUserPermissions.mockResolvedValue(['purchase:receipts:view']);
      const req = { user: { id: 7 }, method: 'GET', path };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      await requireInventoryApprovalAccess('view')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
      expect(DataScopeService.attachRequestScope).not.toHaveBeenCalled();
    }
  );

  test('financial readers retain access from business pages', async () => {
    pool.query.mockResolvedValue([[{ department_id: 2, department_name: '采购部' }]]);
    PermissionService.isAdmin.mockResolvedValue(false);
    PermissionService.getUserPermissions.mockResolvedValue(['finance:inventory:view']);
    const req = { user: { id: 7 }, method: 'GET' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await requireInventoryApprovalAccess('view')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.inventoryApprovalAccess.action).toBe('view');
    expect(DataScopeService.attachRequestScope).toHaveBeenCalledWith(req);
  });
});
