const migration = require('../../migrations/20261012000001_restore_inventory_posting_workbench');

function fixture({ bothMenus = false } = {}) {
  const rows = {
    menus: [
      { id: 10, path: '/finance', type: 0 },
      { id: 11, path: '/finance/inventory-posting', parent_id: 10, type: 1 },
      { id: 12, path: '', permission: 'finance:inventory:approve', parent_id: 11, type: 2 },
      { id: 22, path: '/finance/gl/entries', parent_id: 10, type: 1 },
      ...(bothMenus ? [{ id: 13, path: '/finance/inventory-postings', parent_id: 10, type: 1 }] : []),
    ],
    permissions: [
      { id: 1, code: 'finance:inventory:view' },
      { id: 2, code: 'finance:inventory:approve' },
    ],
    roles: [
      { id: 1, code: 'admin', is_super_admin: 1 },
      { id: 2, code: 'accountant' },
      { id: 3, code: 'finance_manager' },
      { id: 4, code: 'custom_finance_reader' },
      { id: 5, code: 'inventory_operator' },
      { id: 6, code: 'custom_finance_approver' },
    ],
    role_menus: [{ role_id: 4, menu_id: 11 }, { role_id: 4, menu_id: 22 }],
    role_permissions: [{ role_id: 4, permission_id: 1 }, { role_id: 6, permission_id: 2 }],
  };
  function knex(table) {
    if (!rows[table]) throw new Error(`Unexpected table ${table}`);
    let filters = {};
    let fields = null;
    let action = null;
    let value;
    let conflicts = [];
    let first = false;
    const query = {
      where(where) { filters = { ...filters, ...where }; return query; },
      first(...keys) { fields = keys; first = true; return query; },
      select(...keys) { fields = keys; return query; },
      insert(record) { action = 'insert'; value = record; return query; },
      update(record) { action = 'update'; value = record; return query; },
      del() { action = 'delete'; return query; },
      onConflict(keys) { conflicts = keys; return query; },
      ignore() { return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          const matches = rows[table].filter(row => Object.entries(filters).every(([key, expected]) => row[key] === expected));
          if (action === 'insert') {
            const existing = conflicts.length && rows[table].find(row => conflicts.every(key => row[key] === value[key]));
            if (existing) return [existing.id];
            const id = Math.max(0, ...rows[table].map(row => row.id || 0)) + 1;
            rows[table].push({ ...value, id });
            return [id];
          }
          if (action === 'update') { matches.forEach(row => Object.assign(row, value)); return matches.length; }
          if (action === 'delete') { rows[table] = rows[table].filter(row => !matches.includes(row)); return matches.length; }
          const selected = matches.map(row => fields?.length ? Object.fromEntries(fields.map(key => [key, row[key]])) : { ...row });
          return first ? selected[0] : selected;
        }).then(resolve, reject);
      },
    };
    return query;
  }
  knex.fn = { now: () => '2026-10-12 12:00:00' };
  return { knex, rows };
}

test.each([false, true])('consolidates legacy menus idempotently without losing grants (both menus: %s)', async bothMenus => {
  const { knex, rows } = fixture({ bothMenus });
  await migration.up(knex);
  const firstRun = JSON.stringify(rows);
  await migration.up(knex);
  expect(JSON.stringify(rows)).toBe(firstRun);
  const workbench = rows.menus.find(row => row.path === '/finance/inventory-postings');
  expect(workbench.component).toBe('finance/InventoryPostings');
  expect(rows.menus.some(row => row.path === '/finance/inventory-posting')).toBe(false);
  expect(rows.menus.find(row => row.id === 12).parent_id).toBe(workbench.id);
  expect(rows.role_menus).toEqual(expect.arrayContaining([
    expect.objectContaining({ role_id: 4, menu_id: workbench.id }),
    { role_id: 4, menu_id: 22 },
  ]));
  const codes = roleId => rows.role_permissions.filter(row => row.role_id === roleId)
    .map(row => rows.permissions.find(permission => permission.id === row.permission_id).code);
  expect(codes(2)).toEqual(['finance:inventory:view']);
  expect(codes(4)).toEqual(['finance:inventory:view']);
  expect(codes(5)).toEqual([]);
  expect(codes(6).sort()).toEqual(['finance:inventory:approve', 'finance:inventory:view']);
});

test('fails explicitly if finance root is absent', async () => {
  const { knex, rows } = fixture();
  rows.menus = rows.menus.filter(row => row.path !== '/finance');
  await expect(migration.up(knex)).rejects.toThrow('财务根菜单');
});
