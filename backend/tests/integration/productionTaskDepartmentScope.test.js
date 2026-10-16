/* global jest, beforeAll, afterAll, beforeEach, afterEach, describe, test, expect */

jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(() => {
      throw new Error('Department scope tests must use their isolated connection');
    }),
  },
}));

const mysql = require('mysql2/promise');
const ProductionTaskScope = require('../../src/authorization/ProductionTaskScope');

// All seven tables are connection-local shadows. No permanent fixture tables,
// application pool, migrations or existing business data are changed here.
const schemas = {
  users: 'id INT PRIMARY KEY, department_id INT NULL, status TINYINT NOT NULL DEFAULT 1',
  roles:
    'id INT PRIMARY KEY, code VARCHAR(50), status TINYINT NOT NULL DEFAULT 1, is_super_admin TINYINT NOT NULL DEFAULT 0',
  user_roles: 'user_id INT NOT NULL, role_id INT NOT NULL',
  departments: 'id INT PRIMARY KEY, name VARCHAR(100), code VARCHAR(50), parent_id INT NULL',
  production_tasks:
    'id INT PRIMARY KEY, manager VARCHAR(100), plan_id INT NULL, product_id INT NULL, created_by INT NULL, status VARCHAR(30), deleted_at DATETIME NULL',
  production_plans: 'id INT PRIMARY KEY, department_id INT NULL, deleted_at DATETIME NULL',
  materials: 'id INT PRIMARY KEY, production_group_id INT NULL',
};

let connection;
let tablesReady = false;

beforeAll(async () => {
  if (!/(test|uat)/i.test(process.env.DB_NAME || '')) {
    throw new Error('Department scope integration tests require an isolated test/UAT database');
  }
  connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });
  for (const [table, columns] of Object.entries(schemas)) {
    await connection.query(
      `CREATE TEMPORARY TABLE ${table} (${columns}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  }
  tablesReady = true;
});

afterAll(async () => {
  // Closing this connection also drops every temporary shadow table, even if
  // fixture setup or a test failed before the transaction could be rolled back.
  if (connection) await connection.end();
});

beforeEach(async () => {
  if (!tablesReady) throw new Error('Temporary department scope tables were not initialized');
  await connection.beginTransaction();
  await connection.query('INSERT INTO departments (id, name, code, parent_id) VALUES ?', [
    [
      [10, '生产部', '10005', null],
      [11, '机加组', 'MACHINING', 10],
      [12, '装配组', 'ASSEMBLY', 10],
      [13, '机加子组', 'MACHINING-CHILD', 11],
      [20, '采购部', 'PURCHASE', null],
    ],
  ]);
  await connection.query('INSERT INTO users (id, department_id, status) VALUES ?', [
    [
      [101, 11, 1],
      [102, 11, 1],
      [103, 12, 1],
      [104, 13, 1],
      [105, 10, 1],
      [106, 20, 1],
      [107, 11, 1],
      [108, null, 1],
      [109, 11, 0],
      [110, 999, 1],
      [111, 11, 1],
      [112, 11, 1],
    ],
  ]);
  await connection.query('INSERT INTO roles (id, code, status, is_super_admin) VALUES ?', [
    [
      [1, 'worker', 1, 0],
      [2, 'custom-super-admin', 1, 1],
      [3, 'admin', 1, 0],
      [4, 'disabled-super-admin', 0, 1],
    ],
  ]);
  await connection.query('INSERT INTO user_roles (user_id, role_id) VALUES ?', [
    [
      [101, 1],
      [107, 2],
      [111, 3],
      [112, 4],
    ],
  ]);
  await connection.query('INSERT INTO production_plans (id, department_id, deleted_at) VALUES ?', [
    [
      [21, 11, null],
      [22, 12, null],
      [23, 11, '2026-01-01 00:00:00'],
      [24, null, null],
    ],
  ]);
  await connection.query('INSERT INTO materials (id, production_group_id) VALUES ?', [
    [
      [31, 11],
      [32, 12],
      [33, null],
    ],
  ]);
  await connection.query(
    'INSERT INTO production_tasks (id, manager, plan_id, product_id, created_by, status, deleted_at) VALUES ?',
    [
      [
        [1, '机加组', 21, 31, 102, 'material_issued', null],
        [2, '装配组', 22, 32, 101, 'in_progress', null],
        [3, '装配组', 21, 31, 102, 'in_progress', null],
        [4, '未分配', 21, 32, 103, 'completed', null],
        [5, '未分配', 22, 31, 101, 'in_progress', null],
        [6, '张三', null, 31, 103, 'in_progress', null],
        [7, null, null, 32, 101, 'material_issued', null],
        [8, '未知负责人', null, null, 101, 'in_progress', null],
        [9, '机加子组', 21, 31, 101, 'completed', null],
        [10, '机加组', 21, 31, 102, 'completed', '2026-01-01 00:00:00'],
        [11, '张三', 23, 32, 101, 'material_issued', null],
        [12, ' 机加组 ', null, null, 103, 'material_issued', null],
        [13, '采购部', 21, 31, 101, 'in_progress', null],
        [14, '', 24, 31, 103, 'completed', null],
        [15, '未分配', null, 33, 101, 'in_progress', null],
      ],
    ]
  );
});

afterEach(async () => {
  if (connection) await connection.rollback();
});

const requestFor = (id) => ({ user: { id }, query: {}, body: {} });
const machiningIds = [1, 4, 6, 12, 14];
const assemblyIds = [2, 3, 5, 7, 11];

async function queryVisible(req, selection = 'pt.id', suffix = ' ORDER BY pt.id') {
  const clause = await ProductionTaskScope.buildRequestClause(
    req,
    { tableAlias: 'pt' },
    connection
  );
  const [rows] = await connection.query(
    `SELECT ${selection} FROM production_tasks pt ${clause.join}
      WHERE pt.deleted_at IS NULL${clause.where}${suffix}`,
    clause.params
  );
  return rows;
}

async function visibleIds(req) {
  return (await queryVisible(req)).map((row) => row.id);
}

describe('production task department ownership with real MySQL clauses', () => {
  test('shares tasks within a workshop regardless of creator and denies cross-workshop tasks', async () => {
    expect(await visibleIds(requestFor(101))).toEqual(machiningIds);
    expect(await visibleIds(requestFor(102))).toEqual(machiningIds);
    expect(await visibleIds(requestFor(103))).toEqual(assemblyIds);
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(101), 1)).resolves.toBe(
      true
    );
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(101), 2)).resolves.toBe(
      false
    );
  });

  test('current explicit reassignment overrides both the original plan and product group', async () => {
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(101), 3)).resolves.toBe(
      false
    );
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(103), 3)).resolves.toBe(
      true
    );
    await connection.query('UPDATE production_tasks SET manager = ? WHERE id = 3', ['机加组']);
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(101), 3)).resolves.toBe(
      true
    );
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(103), 3)).resolves.toBe(
      false
    );
    expect(await visibleIds(requestFor(101))).toContain(3);
    expect(await visibleIds(requestFor(103))).not.toContain(3);
  });

  test('unassigned and personal managers fall back to plan department before product group', async () => {
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(101), 4)).resolves.toBe(
      true
    );
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(101), 5)).resolves.toBe(
      false
    );
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(101), 6)).resolves.toBe(
      true
    );
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(101), 14)).resolves.toBe(
      true
    );
    // A deleted plan cannot override the product's currently assigned workshop.
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(101), 11)).resolves.toBe(
      false
    );
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(103), 11)).resolves.toBe(
      true
    );
  });

  test('does not expose unowned tasks, another recognized department, or soft-deleted records', async () => {
    for (const id of [8, 10, 13, 15, 9999]) {
      await expect(ProductionTaskScope.assertAccess(connection, requestFor(101), id)).resolves.toBe(
        false
      );
    }
    expect(
      (await visibleIds(requestFor(101))).filter((id) => [8, 10, 13, 15].includes(id))
    ).toEqual([]);
  });

  test('limits a nested production account to its own exact department', async () => {
    expect(await visibleIds(requestFor(104))).toEqual([9]);
    expect(await visibleIds(requestFor(101))).not.toContain(9);
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(104), 1)).resolves.toBe(
      false
    );
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(104), 9)).resolves.toBe(
      true
    );
  });

  test.each([
    ['production management', 105],
    ['another business department', 106],
    ['a database-marked super administrator', 107],
    ['an account without a department', 108],
  ])('preserves existing shared scope for %s', async (_label, userId) => {
    const req = requestFor(userId);
    await expect(
      ProductionTaskScope.buildRequestClause(req, { tableAlias: 'pt' }, connection)
    ).resolves.toEqual({ join: '', where: '', params: [] });
    expect(await visibleIds(req)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15]);
    // This module adds a department restriction only. ScopeGuard remains
    // responsible for existence/soft-deletion checks on unrestricted callers.
    await expect(ProductionTaskScope.assertAccess(connection, req, 2)).resolves.toBe(true);
  });

  test('ignores forged request department and administrator attributes', async () => {
    const req = requestFor(101);
    Object.assign(req.user, { departmentId: 12, department_id: 10, is_super_admin: 1 });
    req.query = { departmentId: 12, department_id: 12, dataScope: 'all' };
    req.body = { departmentId: 10, department_id: 20 };
    req.departmentId = 12;
    expect(await visibleIds(req)).toEqual(machiningIds);
    await expect(ProductionTaskScope.assertAccess(connection, req, 2)).resolves.toBe(false);
  });

  test('a role name or disabled super administrator role cannot bypass the department restriction', async () => {
    expect(await visibleIds(requestFor(111))).toEqual(machiningIds);
    expect(await visibleIds(requestFor(112))).toEqual(machiningIds);
  });

  test('ambiguous department names do not fall back to an old plan or product assignment', async () => {
    await connection.query(
      'INSERT INTO departments (id, name, code, parent_id) VALUES (25, ?, ?, 20)',
      ['机加组', 'DUPLICATE-MACHINING']
    );
    expect(await visibleIds(requestFor(101))).toEqual([4, 6, 14]);
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(101), 1)).resolves.toBe(
      false
    );
    await expect(ProductionTaskScope.assertAccess(connection, requestFor(101), 12)).resolves.toBe(
      false
    );
  });

  test('applies the same scope to counts, statistics and manager options as to list rows', async () => {
    const req = requestFor(101);
    expect(await queryVisible(req, 'COUNT(*) AS total', '')).toEqual([{ total: 5 }]);
    expect(
      await queryVisible(
        req,
        'pt.status, COUNT(*) AS total',
        ' GROUP BY pt.status ORDER BY pt.status'
      )
    ).toEqual([
      { status: 'completed', total: 2 },
      { status: 'in_progress', total: 1 },
      { status: 'material_issued', total: 2 },
    ]);
    const managers = await queryVisible(req, 'DISTINCT pt.manager', ' ORDER BY pt.manager');
    expect(managers.map((row) => row.manager).sort()).toEqual(
      ['', ' 机加组 ', '未分配', '机加组', '张三'].sort()
    );
    expect(managers.map((row) => row.manager)).not.toContain('装配组');
  });

  test.each([109, 110, 9999])(
    'denies inactive/missing users and unresolved departments (user %i)',
    async (userId) => {
      expect(await visibleIds(requestFor(userId))).toEqual([]);
      await expect(
        ProductionTaskScope.assertAccess(connection, requestFor(userId), 1)
      ).resolves.toBe(false);
    }
  );

  test('denies broken and cyclic department ancestry', async () => {
    await connection.query('UPDATE departments SET parent_id = 999 WHERE id = 11');
    expect(await visibleIds(requestFor(101))).toEqual([]);
    await connection.query('UPDATE departments SET parent_id = 13 WHERE id = 11');
    expect(await visibleIds(requestFor(101))).toEqual([]);
    expect(await visibleIds(requestFor(104))).toEqual([]);
  });

  test('recognizes a renamed production root by its stable department code', async () => {
    await connection.query("UPDATE departments SET name = '制造中心' WHERE id = 10");
    expect(await visibleIds(requestFor(101))).toEqual(machiningIds);
    await expect(
      ProductionTaskScope.buildRequestClause(requestFor(105), {}, connection)
    ).resolves.toEqual({ join: '', where: '', params: [] });
  });

  test('reloads the database department on a new request after an account transfer', async () => {
    expect(await visibleIds(requestFor(101))).toEqual(machiningIds);
    await connection.query('UPDATE users SET department_id = 12 WHERE id = 101');
    expect(await visibleIds(requestFor(101))).toEqual(assemblyIds);
  });
});
