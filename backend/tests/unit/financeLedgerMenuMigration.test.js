const migration = require('../../migrations/20261016000100_nest_finance_ledger_menus');
const centerMigration = require('../../migrations/20261016000001_add_finance_report_center');
const { ensureCoreMenus } = require('../../src/bootstrap/menus');
const productionMenus = {
  menus: require('../fixtures/finance-report-menu-20261016.json'),
  // Synthetic assignments, including a half-checked ancestor and a role that
  // can navigate a report but has no corresponding business permission.
  role_menus: [
    { id: 1, role_id: 21, menu_id: 11, created_at: '2020-01-01', is_half_checked: 1 },
    { id: 2, role_id: 21, menu_id: 1421, created_at: '2020-01-01', is_half_checked: 1 },
    { id: 3, role_id: 21, menu_id: 1447, created_at: '2020-01-01', is_half_checked: 0 },
    { id: 4, role_id: 21, menu_id: 2167, created_at: '2020-01-01', is_half_checked: 0 },
    { id: 5, role_id: 60, menu_id: 2071, created_at: '2020-01-01', is_half_checked: 0 },
    { id: 6, role_id: 10, menu_id: 1421, created_at: '2020-01-01', is_half_checked: 0 },
  ],
};

const ledgerPaths = ['vat', 'quantity', 'general', 'cash', 'payable'].map(
  (type) => `/finance/reports/ledgers/${type}`
);
const reportPaths = ['balance-sheet', 'income-statement', 'cash-flow', 'standard-cash-flow']
  .map((type) => `/finance/reports/${type}`)
  .concat(ledgerPaths);

// Relational in-memory query double: exercise joins against real role/permission
// rows, and never connect these migration tests to a business database.
function database(seed = {}) {
  const tables = structuredClone({
    menus: [{ id: 11, path: '/finance', parent_id: null, type: 0 }],
    permissions: [
      { id: 126, code: 'finance' },
      { id: 302, code: 'finance:reports' },
      { id: 319, code: 'finance:reports:standard-cash-flow:view' },
      { id: 320, code: 'finance:reports:view' },
      { id: 400, code: 'finance:*' },
    ],
    roles: [
      { id: 1, code: 'admin', is_super_admin: 0 },
      { id: 10, code: 'system_admin', is_super_admin: 0 },
      { id: 21, code: 'accountant', is_super_admin: 0 },
      { id: 22, code: 'custom_report_viewer', is_super_admin: 0 },
      { id: 60, code: 'cashier', is_super_admin: 0 },
      { id: 61, code: 'menu_only', is_super_admin: 0 },
      { id: 62, code: 'finance_wildcard', is_super_admin: 0 },
      { id: 63, code: 'custom_super', is_super_admin: 1 },
    ],
    role_permissions: [
      { id: 1, role_id: 21, permission_id: 320 },
      { id: 2, role_id: 22, permission_id: 320 },
      { id: 3, role_id: 60, permission_id: 319 },
      { id: 4, role_id: 62, permission_id: 400 },
    ],
    role_menus: [],
    ...seed,
  });
  let clock = 0;
  let updates = 0;
  const source = (table) => {
    const [name, alias = name] = table.split(' as ');
    if (!tables[name]) throw new Error(`Unexpected table ${name}`);
    return { name, alias };
  };
  const qualify = (row, alias) => ({
    ...row,
    ...Object.fromEntries(Object.entries(row).map(([key, value]) => [`${alias}.${key}`, value])),
  });
  const predicate = (...args) => {
    if (typeof args[0] === 'function') {
      const conditions = [];
      const group = {
        where(...values) {
          conditions.push(['and', predicate(...values)]);
          return this;
        },
        orWhere(...values) {
          conditions.push(['or', predicate(...values)]);
          return this;
        },
      };
      args[0](group);
      return (row) =>
        conditions.reduce(
          (result, [operator, test], index) =>
            index === 0 ? test(row) : operator === 'or' ? result || test(row) : result && test(row),
          true
        );
    }
    if (typeof args[0] === 'object')
      return (row) => Object.entries(args[0]).every(([key, value]) => row[key] === value);
    return (row) => row[args[0]] === args[1];
  };
  const knex = (table) => {
    const { name, alias } = source(table);
    const filters = [];
    const joins = [];
    let fields = null;
    let first = false;
    let distinct = false;
    let action;
    let payload;
    let conflictKeys = [];
    const query = {
      select(...keys) {
        fields = keys;
        return this;
      },
      first(...keys) {
        if (keys.length) fields = keys;
        first = true;
        return this;
      },
      distinct(...keys) {
        fields = keys;
        distinct = true;
        return this;
      },
      orderBy() {
        return this;
      },
      where(...args) {
        filters.push(predicate(...args));
        return this;
      },
      whereNot(key, value) {
        filters.push((row) => row[key] !== value);
        return this;
      },
      leftJoin(joinTable, left, right) {
        joins.push({ ...source(joinTable), left, right });
        return this;
      },
      update(changes) {
        action = 'update';
        payload = changes;
        return this;
      },
      insert(record) {
        action = 'insert';
        payload = record;
        return this;
      },
      onConflict(keys) {
        conflictKeys = keys;
        return this;
      },
      ignore() {
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve()
          .then(() => {
            if (action && ['role_permissions', 'permissions'].includes(name))
              throw new Error(`Forbidden write to ${name}`);
            if (action === 'insert') {
              const existing =
                conflictKeys.length &&
                tables[name].find((row) => conflictKeys.every((key) => row[key] === payload[key]));
              if (existing) return [existing.id];
              const id = Math.max(0, ...tables[name].map((row) => row.id || 0)) + 1;
              tables[name].push({ ...payload, id });
              return [id];
            }
            if (action === 'update') {
              const matches = tables[name].filter((row) => filters.every((filter) => filter(row)));
              updates += matches.length;
              matches.forEach((row) => Object.assign(row, payload));
              return matches.length;
            }
            let rows = tables[name].map((row) => qualify(row, alias));
            for (const join of joins) {
              rows = rows.flatMap((row) => {
                const matches = tables[join.name]
                  .map((other) => ({ ...row, ...qualify(other, join.alias) }))
                  .filter((candidate) => candidate[join.left] === candidate[join.right]);
                return matches.length ? matches : [row];
              });
            }
            rows = rows
              .filter((row) => filters.every((filter) => filter(row)))
              .map((row) =>
                fields?.length && fields[0] !== '*'
                  ? Object.fromEntries(fields.map((key) => [key.split('.').pop(), row[key]]))
                  : Object.fromEntries(Object.entries(row).filter(([key]) => !key.includes('.')))
              );
            if (distinct)
              rows = [...new Map(rows.map((row) => [JSON.stringify(row), row])).values()];
            return first ? rows[0] : rows;
          })
          .then(resolve, reject);
      },
    };
    return query;
  };
  knex.fn = { now: () => `2026-10-16T00:00:${String(clock++).padStart(2, '0')}Z` };
  knex.transaction = async (action) => {
    const before = structuredClone(tables);
    try {
      return await action(knex);
    } catch (error) {
      Object.assign(tables, before);
      throw error;
    }
  };
  return { knex, tables, updateCount: () => updates };
}

const rowByPath = (tables, path) => tables.menus.find((menu) => menu.path === path);
const grantKey = (grant) => `${grant.role_id}:${grant.menu_id}`;

describe('financial report directory and ledger navigation upgrade', () => {
  test('restores the deployed IDs and adds only five pages and exact-viewer navigation grants', async () => {
    const { knex, tables, updateCount } = database(productionMenus);
    tables.role_menus.push({
      id: 200000,
      role_id: 61,
      menu_id: 1447,
      created_at: '2026-01-01',
      is_half_checked: 1,
    });
    const before = structuredClone(tables);
    await migration.up(knex);
    expect(tables.menus).toHaveLength(before.menus.length + 5);
    expect(tables.menus.find((menu) => menu.id === 1421)).toMatchObject({
      name: '财务报表',
      path: '/finance/reports',
      parent_id: 11,
      type: 0,
      visible: 1,
      permission: 'finance:reports',
      permission_id: 302,
      sort_order: 7,
    });
    expect(tables.menus.find((menu) => menu.id === 1447)).toMatchObject({
      name: '资产负债表',
      path: '/finance/reports/balance-sheet',
      parent_id: 1421,
      component: 'finance/reports/BalanceSheet',
      type: 1,
      permission_id: 320,
    });
    for (const menu of before.menus.filter((row) => ![1421, 1447].includes(row.id))) {
      expect(tables.menus.find((row) => row.id === menu.id)).toEqual(menu);
    }
    for (const [index, path] of ledgerPaths.entries()) {
      expect(rowByPath(tables, path)).toMatchObject({
        parent_id: 1421,
        component: 'finance/reports/LedgerReport',
        type: 1,
        visible: 1,
        status: 1,
        permission: 'finance:reports:view',
        permission_id: 320,
        sort_order: index + 5,
      });
    }
    for (const grant of before.role_menus) expect(tables.role_menus).toContainEqual(grant);
    const oldKeys = new Set(before.role_menus.map(grantKey));
    const additions = tables.role_menus.filter((grant) => !oldKeys.has(grantKey(grant)));
    const permittedMenus = new Set([
      11,
      1421,
      ...ledgerPaths.map((path) => rowByPath(tables, path).id),
    ]);
    expect(
      additions.every(
        (grant) => [1, 21, 22, 63].includes(grant.role_id) && permittedMenus.has(grant.menu_id)
      )
    ).toBe(true);
    for (const roleId of [1, 21, 22, 63]) {
      for (const menuId of permittedMenus)
        expect(tables.role_menus).toContainEqual(
          expect.objectContaining({ role_id: roleId, menu_id: menuId })
        );
    }
    expect(tables.permissions).toEqual(before.permissions);
    expect(tables.role_permissions).toEqual(before.role_permissions);
    const firstRun = structuredClone(tables);
    const firstUpdates = updateCount();
    await migration.up(knex);
    expect(tables).toEqual(firstRun);
    expect(updateCount()).toBe(firstUpdates);
  });

  test('creates a missing directory and retains the original balance-sheet page and its buttons', async () => {
    const { knex, tables } = database({
      menus: [
        { id: 11, path: '/finance', type: 0 },
        {
          id: 1447,
          parent_id: 11,
          path: '/finance/reports',
          type: 1,
          component: 'finance/reports/ReportCenter',
          visible: 1,
        },
        { id: 2167, parent_id: 1447, type: 2, permission: 'finance:reports:balance-sheet:view' },
      ],
      role_menus: [{ id: 99, role_id: 61, menu_id: 1447, is_half_checked: 0 }],
    });
    await migration.up(knex);
    const directory = rowByPath(tables, '/finance/reports');
    expect(directory).toMatchObject({ name: '财务报表', type: 0, parent_id: 11 });
    expect(rowByPath(tables, '/finance/reports/balance-sheet')).toMatchObject({
      id: 1447,
      parent_id: directory.id,
    });
    expect(tables.menus.find((menu) => menu.id === 2167).parent_id).toBe(1447);
    expect(reportPaths.every((path) => rowByPath(tables, path).parent_id === directory.id)).toBe(
      true
    );
    expect(tables.role_menus.filter((grant) => grant.role_id === 61)).toEqual([
      { id: 99, role_id: 61, menu_id: 1447, is_half_checked: 0 },
    ]);
  });

  test('builds all nine report routes on a fresh finance root without adding business permissions', async () => {
    const { knex, tables } = database();
    const permissions = structuredClone(tables.role_permissions);
    await migration.up(knex);
    const directory = rowByPath(tables, '/finance/reports');
    expect(tables.menus.filter((menu) => menu.parent_id === directory.id)).toHaveLength(9);
    expect(new Set(tables.menus.map((menu) => menu.path)).size).toBe(11);
    expect(tables.role_permissions).toEqual(permissions);
    const firstRun = structuredClone(tables);
    await migration.up(knex);
    expect(tables).toEqual(firstRun);
  });

  test('preserves unrelated custom folders, their contents and grants', async () => {
    const custom = [
      {
        id: 8000,
        parent_id: 11,
        path: '/finance/custom-reports',
        name: '财务报表',
        permission: 'finance:reports',
        type: 0,
        visible: 0,
      },
      {
        id: 8001,
        parent_id: 11,
        path: null,
        name: '财务报表',
        permission: 'finance:custom:view',
        type: 0,
        visible: 1,
      },
      { id: 8002, parent_id: 8001, path: '/finance/custom-view', type: 1, name: '自定义报表' },
      {
        id: 8003,
        parent_id: 8000,
        path: ledgerPaths[0],
        type: 1,
        name: '自定义增值税账簿',
        permission: 'finance:reports:view',
      },
    ];
    const { knex, tables } = database({
      ...productionMenus,
      menus: [...productionMenus.menus, ...custom],
      role_menus: [...productionMenus.role_menus, { id: 200000, role_id: 61, menu_id: 8002 }],
    });
    await migration.up(knex);
    for (const menu of custom) expect(tables.menus.find((row) => row.id === menu.id)).toEqual(menu);
    expect(tables.role_menus).toContainEqual({ id: 200000, role_id: 61, menu_id: 8002 });
    for (const roleId of [1, 21, 22, 63]) {
      expect(tables.role_menus).toContainEqual(
        expect.objectContaining({ role_id: roleId, menu_id: 8000 })
      );
      expect(tables.role_menus).toContainEqual(
        expect.objectContaining({ role_id: roleId, menu_id: 8003 })
      );
    }
  });

  test('survives bootstrap then the immutable center migration and repeated bootstrap', async () => {
    const { knex, tables } = database();
    await ensureCoreMenus(knex);
    const directory = rowByPath(tables, '/finance/reports');
    expect(directory.type).toBe(0);
    expect(tables.menus.filter((menu) => menu.parent_id === directory.id)).toHaveLength(9);
    const identities = reportPaths.map((path) => rowByPath(tables, path).id);
    await centerMigration.up(knex);
    expect(reportPaths.every((path) => rowByPath(tables, path).parent_id === 11)).toBe(true);
    await migration.up(knex);
    expect(reportPaths.every((path) => rowByPath(tables, path).parent_id === directory.id)).toBe(
      true
    );
    expect(reportPaths.map((path) => rowByPath(tables, path).id)).toEqual(identities);
    const repaired = structuredClone(tables);
    expect(await ensureCoreMenus(knex)).toEqual({ created: 0, repaired: 0 });
    expect(tables).toEqual(repaired);
  });

  test.each(['duplicate-directory', 'independent-balance-sheet'])(
    'rejects ambiguous %s identities without changing rows or grants',
    async (conflict) => {
      const menus = structuredClone(productionMenus.menus);
      menus.push(
        conflict === 'duplicate-directory'
          ? {
              id: 9000,
              parent_id: 11,
              name: '财务报表',
              path: '',
              permission: 'finance:reports',
              type: 0,
            }
          : {
              id: 9000,
              parent_id: 11,
              name: '资产负债表',
              path: '/finance/reports/balance-sheet',
              type: 1,
            }
      );
      const { knex, tables } = database({ ...productionMenus, menus });
      const before = structuredClone(tables);
      await expect(migration.up(knex)).rejects.toThrow(
        'Conflicting financial report menu identities'
      );
      expect(tables).toEqual(before);
    }
  );

  test('leaves an empty pre-bootstrap database and a missing report permission unchanged in business access', async () => {
    const empty = database({ menus: [] });
    const before = structuredClone(empty.tables);
    await migration.up(empty.knex);
    expect(empty.tables).toEqual(before);
    const noPermission = database({ permissions: [], role_permissions: [] });
    await migration.up(noPermission.knex);
    expect(noPermission.tables.permissions).toEqual([]);
    expect(noPermission.tables.role_permissions).toEqual([]);
    expect(noPermission.tables.role_menus.every((grant) => [1, 63].includes(grant.role_id))).toBe(
      true
    );
  });
});
