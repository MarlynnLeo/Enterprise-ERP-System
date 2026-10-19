const db = require('../../config/db');
const { toGlAccountApi } = require('../../utils/finance/glFieldMap');

// Purpose-limited voucher references: names and IDs only, without contact,
// payroll or login details from the source master records.
async function getEntryOptions() {
  const [accounts, customers, suppliers, departments, costCenters, employees] = await Promise.all([
    db.pool.execute(`SELECT id, account_code, account_name, account_type, parent_id, is_debit,
      is_active, currency_code, has_customer, has_supplier, has_employee, has_department, has_project
      FROM gl_accounts WHERE is_active = 1 ORDER BY account_code, id`),
    db.pool.execute(
      "SELECT id, code, name FROM customers WHERE status = 'active' AND deleted_at IS NULL ORDER BY code, id"
    ),
    db.pool.execute(
      'SELECT id, code, name FROM suppliers WHERE status = 1 AND deleted_at IS NULL ORDER BY code, id'
    ),
    db.pool.execute(
      'SELECT id, code, name, parent_id FROM departments WHERE status = 1 ORDER BY code, id'
    ),
    db.pool.execute(
      'SELECT id, code, name, department_id FROM cost_centers WHERE is_active = 1 AND deleted_at IS NULL ORDER BY code, id'
    ),
    db.pool.execute(
      'SELECT id, username, real_name, department_id FROM users WHERE status = 1 ORDER BY real_name, username, id'
    ),
  ]);
  return {
    accounts: accounts[0].map(toGlAccountApi),
    customers: customers[0],
    suppliers: suppliers[0],
    departments: departments[0].map(({ parent_id, ...row }) => ({ ...row, parentId: parent_id })),
    costCenters: costCenters[0].map(({ department_id, ...row }) => ({
      ...row,
      departmentId: department_id,
    })),
    employees: employees[0].map(({ real_name, department_id, ...row }) => ({
      ...row,
      realName: real_name || row.username,
      departmentId: department_id,
      employeeSource: 'user',
    })),
    currencies: [
      { code: 'CNY', name: '人民币' },
      { code: 'USD', name: '美元' },
    ],
    baseCurrency: 'CNY',
  };
}

module.exports = { getEntryOptions };
