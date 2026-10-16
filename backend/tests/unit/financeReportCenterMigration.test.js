const migration = require('../../migrations/20261016000001_add_finance_report_center');

// In-memory query double: migration tests never connect to a business database.
function database(seed = {}) {
  const tables = {
    menus: [{ id: 7, path: '/finance', type: 0 }],
    permissions: [{ id: 10, code: 'finance:reports:view' }],
    role_menus: [],
    role_permissions: [],
    'roles as r': [],
    ...structuredClone(seed),
  };
  const predicate = (...args) => {
    if (typeof args[0] === 'function') {
      const group = { tests: [], where(...values) { this.tests.push(predicate(...values)); return this; }, orWhere(...values) { this.tests.push(predicate(...values)); return this; } };
      args[0](group);
      return row => group.tests.some(test => test(row));
    }
    if (typeof args[0] === 'object') return row => Object.entries(args[0]).every(([key, value]) => row[key] === value);
    return row => row[args[0]] === args[1];
  };
  const knex = table => {
    const filters = [];
    let distinctKey;
    const rows = () => tables[table].filter(row => filters.every(filter => filter(row)));
    const query = {
      where(...args) { filters.push(predicate(...args)); return this; },
      whereNot(key, value) { filters.push(row => row[key] !== value); return this; },
      orderBy() { return this; },
      distinct(key) { distinctKey = key; return this; },
      leftJoin() { return this; },
      first() { return Promise.resolve(rows()[0]); },
      update(changes) { rows().forEach(row => Object.assign(row, changes)); return Promise.resolve(rows().length); },
      insert(payload) {
        const id = payload.id || Math.max(0, ...tables[table].map(row => row.id || 0)) + 1;
        const inserted = { ...payload, ...(table === 'menus' ? { id } : {}) };
        if (table !== 'role_menus' || !tables[table].some(row => row.role_id === payload.role_id && row.menu_id === payload.menu_id)) tables[table].push(inserted);
        const result = Promise.resolve([id]);
        result.onConflict = () => ({ ignore: () => result });
        return result;
      },
      then(resolve, reject) {
        const result = distinctKey ? [...new Set(rows().map(row => row[distinctKey]))].map(id => ({ id })) : rows();
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  };
  knex.transaction = action => action(knex);
  knex.fn = { now: () => '2026-10-16T00:00:00Z' };
  return { knex, tables };
}

describe('financial report center navigation upgrade', () => {
  test('moves the production legacy balance sheet directly under finance without changing grants or sibling reports', async () => {
    const details = [
      { id: 1448, parent_id: 1421, name: '利润表', path: '/finance/reports/income-statement', permission: 'finance:reports:view', type: 1, visible: 1, status: 1 },
      { id: 1449, parent_id: 1421, name: '现金流量表', path: '/finance/reports/cash-flow', permission: 'finance:reports:view', type: 1, visible: 1, status: 1 },
      { id: 2071, parent_id: 1421, name: '现金流量表(直接法)', path: '/finance/reports/standard-cash-flow', permission: 'finance:reports:standard-cash-flow:view', type: 1, visible: 1, status: 1 },
      { id: 2167, parent_id: 1447, name: '查看', path: null, permission: 'finance:reports:balance-sheet:view', type: 2, visible: 1, status: 1 },
    ];
    const { knex, tables } = database({
      menus: [
        { id: 11, path: '/finance', name: '财务管理', type: 0 },
        { id: 1421, parent_id: 11, path: null, name: '财务报表', permission: 'finance:reports', type: 0, visible: 1, status: 1, sort_order: 7 },
        { id: 1447, parent_id: 1421, path: '/finance/reports/balance-sheet', name: '资产负债表', permission: 'finance:reports:view', type: 1, visible: 1, status: 1, sort_order: 1 },
        ...details,
      ],
      role_menus: [
        { role_id: 21, menu_id: 11 }, { role_id: 21, menu_id: 1421 },
        { role_id: 21, menu_id: 1447 }, { role_id: 21, menu_id: 1448 },
        { role_id: 21, menu_id: 1449 }, { role_id: 21, menu_id: 2071 },
        { role_id: 21, menu_id: 2167 }, { role_id: 60, menu_id: 1421 },
      ],
      role_permissions: [{ role_id: 21, permission_id: 10 }],
    });
    const grants = structuredClone(tables.role_menus);
    const permissions = structuredClone(tables.permissions);
    const rolePermissions = structuredClone(tables.role_permissions);
    await migration.up(knex);
    expect(tables.menus.find(menu => menu.id === 1447)).toMatchObject({
      parent_id: 11, path: '/finance/reports', name: '财务报表',
      component: 'finance/reports/ReportCenter', permission: 'finance:reports:view', permission_id: 10,
      type: 1, visible: 1, status: 1,
    });
    expect(tables.menus.find(menu => menu.id === 1421)).toMatchObject({
      parent_id: 11, path: null, name: '报表明细', permission: 'finance:reports',
      type: 0, visible: 1, status: 1, sort_order: 7,
    });
    for (const detail of details) expect(tables.menus.find(menu => menu.id === detail.id)).toEqual(detail);
    expect(tables.role_menus).toEqual(grants);
    expect(tables.permissions).toEqual(permissions);
    expect(tables.role_permissions).toEqual(rolePermissions);
    const migratedMenus = structuredClone(tables.menus);
    await migration.up(knex);
    expect(tables.menus).toEqual(migratedMenus);
    expect(tables.role_menus).toEqual(grants);
    expect(tables.role_permissions).toEqual(rolePermissions);
  });

  test('repairs an already converted nested center and hides only the empty legacy folder', async () => {
    const { knex, tables } = database({
      menus: [
        { id: 11, path: '/finance', type: 0 },
        { id: 1421, parent_id: 11, path: '', name: '财务报表', permission: 'finance:reports', type: 0, visible: 1, status: 1 },
        { id: 1447, parent_id: 1421, path: '/finance/reports', name: '会计报表中心', permission: 'finance:reports:view', type: 1, visible: 0, status: 1 },
        { id: 2167, parent_id: 1421, permission: 'finance:reports:export', type: 2 },
      ],
      role_menus: [{ role_id: 21, menu_id: 1421 }, { role_id: 21, menu_id: 1447 }, { role_id: 21, menu_id: 2167 }],
    });
    const grants = structuredClone(tables.role_menus);
    await migration.up(knex);
    expect(tables.menus.find(menu => menu.id === 1447)).toMatchObject({
      parent_id: 11, name: '会计报表中心', visible: 0, status: 1,
    });
    expect(tables.menus.find(menu => menu.id === 1421)).toMatchObject({ name: '报表明细', visible: 0, status: 1 });
    expect(tables.menus.find(menu => menu.id === 2167).parent_id).toBe(1421);
    expect(tables.role_menus).toEqual(grants);
  });

  test('keeps custom report directories with their own route or permission unchanged', async () => {
    const folders = [
      { id: 50, parent_id: 7, path: '/finance/custom-reports', name: '财务报表', permission: 'finance:reports', type: 0, visible: 1 },
      { id: 51, parent_id: 7, path: null, name: '财务报表', permission: 'finance:custom:view', type: 0, visible: 1 },
    ];
    const { knex, tables } = database({
      menus: [{ id: 7, path: '/finance', type: 0 },
        { id: 716, parent_id: 7, path: '/finance/reports', name: '会计报表中心', type: 1 }, ...folders],
    });
    await migration.up(knex);
    for (const folder of folders) expect(tables.menus.find(menu => menu.id === folder.id)).toEqual(folder);
  });

  test('reuses the legacy menu ID and grants, and makes the center navigable beside its former reports', async () => {
    const { knex, tables } = database({
      menus: [
        { id: 7, path: '/finance', type: 0 },
        { id: 716, parent_id: 7, path: '/finance/reports/balance-sheet', permission: 'finance:reports:view', type: 1, visible: 1, sort_order: 37 },
        { id: 718, parent_id: 716, path: '/finance/reports/standard-cash-flow', type: 1 },
        { id: 719, parent_id: 716, permission: 'finance:reports:export', type: 2 },
      ],
      role_menus: [{ role_id: 4, menu_id: 716 }, { role_id: 4, menu_id: 718 }],
    });
    const grants = structuredClone(tables.role_menus);
    await migration.up(knex);
    expect(tables.menus.find(menu => menu.id === 716)).toMatchObject({
      path: '/finance/reports', name: '财务报表', component: 'finance/reports/ReportCenter',
      permission_id: 10, parent_id: 7, visible: 1, sort_order: 37,
    });
    expect(tables.menus.find(menu => menu.id === 718).parent_id).toBe(7);
    expect(tables.menus.find(menu => menu.id === 719).parent_id).toBe(716);
    expect(tables.role_menus).toEqual(grants);
    await migration.up(knex);
    expect(tables.menus.filter(menu => menu.path === '/finance/reports')).toHaveLength(1);
    expect(tables.role_menus).toEqual(grants);
  });

  test('preserves existing report center customization and an independent balance sheet shortcut', async () => {
    const menus = [
      { id: 7, path: '/finance', type: 0 },
      { id: 716, parent_id: 7, path: '/finance/reports', name: '会计报表中心', type: 1, visible: 0 },
      { id: 717, parent_id: 7, path: '/finance/reports/balance-sheet', name: '资产负债表', type: 1 },
    ];
    const { knex, tables } = database({ menus });
    await migration.up(knex);
    expect(tables.menus).toEqual(menus);
  });

  test('creates a missing entry for exact report viewers and administrators without granting permissions', async () => {
    const { knex, tables } = database({
      'roles as r': [
        { 'r.id': 1, 'r.code': 'admin' },
        { 'r.id': 2, 'r.code': 'accountant', 'p.code': 'finance:reports:view' },
        { 'r.id': 2, 'r.code': 'accountant', 'p.code': 'finance:reports:view' },
        { 'r.id': 3, 'r.code': 'sales', 'p.code': 'finance:ar:view' },
        { 'r.id': 4, 'r.is_super_admin': 1 },
      ],
    });
    const permissions = structuredClone(tables.permissions);
    await migration.up(knex);
    const center = tables.menus.find(menu => menu.path === '/finance/reports');
    expect(center).toMatchObject({ parent_id: 7, type: 1, visible: 1, permission: 'finance:reports:view', permission_id: 10 });
    expect(tables.role_menus).toEqual([
      { role_id: 1, menu_id: center.id }, { role_id: 2, menu_id: center.id }, { role_id: 4, menu_id: center.id },
    ]);
    expect(tables.permissions).toEqual(permissions);
  });
});
