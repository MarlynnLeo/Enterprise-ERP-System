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
} = require('../../src/middleware/inventoryApprovalAccess');

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
});
