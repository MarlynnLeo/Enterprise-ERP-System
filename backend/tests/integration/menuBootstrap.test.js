const knex = require('knex')(require('../../knexfile').test);
const { ensureCoreMenus, findMenuHierarchyRepairs } = require('../../src/bootstrap/menus');
let trx;

describe('stable menu initialization and upgrade', () => {
  beforeEach(async () => { trx = await knex.transaction(); });
  afterEach(async () => { await trx.rollback(); });
  afterAll(async () => { await knex.destroy(); });

  test('repairs legacy numeric parents and keeps separate routes sharing a permission', async () => {
    const root = await trx('menus').where({ path: '/production' }).first();
    const action = await trx('menus').where({ type: 2 }).first();
    await trx('menus').where({ path: '/production/task' }).update({ parent_id: action.id });
    await trx('menus').where({ path: '/production/plan' }).update({ parent_id: null });
    await ensureCoreMenus(trx);
    const production = await trx('menus').whereIn('path', ['/production/task', '/production/plan']);
    expect(production).toHaveLength(2);
    expect(production.every(menu => Number(menu.parent_id) === Number(root.id))).toBe(true);
    const paths = ['/finance/gl/accounts', '/finance/gl/opening-balances', '/finance/ar/invoices', '/finance/ar/settlement',
      '/finance/ap/invoices', '/finance/ap/settlement', '/finance/gl/entries/receipt', '/finance/gl/entries/payment',
      '/finance/gl/entries/transfer', '/finance/gl/entries/general'];
    const finance = await trx('menus').whereIn('path', paths);
    expect(new Set(finance.map(menu => menu.path)).size).toBe(paths.length);
    const before = await trx('menus').orderBy('id');
    expect(findMenuHierarchyRepairs(before)).toEqual([]);
    expect(await ensureCoreMenus(trx)).toEqual({ created: 0, repaired: 0 });
    expect(await trx('menus').orderBy('id')).toEqual(before);
  });

  test('preserves valid custom grouping, names, visibility and role assignments', async () => {
    const root = await trx('menus').where({ path: '/production' }).first();
    const [groupId] = await trx('menus').insert({ name: '自定义生产分组', parent_id: root.id, type: 0, path: '/custom-production', status: 1, visible: 1 });
    await trx('menus').where({ path: '/production/task' }).update({ parent_id: groupId, name: '车间派工', visible: 0, status: 0, sort_order: 37 });
    const task = await trx('menus').where({ path: '/production/task' }).first();
    const grants = await trx('role_menus').where({ menu_id: task.id }).orderBy('role_id');
    await ensureCoreMenus(trx);
    expect(await trx('menus').where({ id: task.id }).first()).toEqual(task);
    expect(await trx('role_menus').where({ menu_id: task.id }).orderBy('role_id')).toEqual(grants);
    const edit = await trx('menus').where({ path: '/finance/budget/edit/:id' }).first();
    expect(Number(edit.visible)).toBe(0);
    const actionPages = await trx('menus').whereIn('path', ['/finance/gl/entries/receipt', '/finance/budget/edit']);
    expect(actionPages.every(menu => Number(menu.visible) === 0)).toBe(true);
    const routes = await trx('menus').where({ path: '/production/process-routes' }).first();
    expect(Number(routes.visible)).toBe(0);
  });

  test('retains a valid cross-module permission under its owning feature', async () => {
    const parent = await trx('menus').where({ path: '/system/notifications' }).first();
    const [id] = await trx('menus').insert({ name: '财务通知接收', parent_id: parent.id, type: 2, permission: 'finance:overdue:notify', status: 1, visible: 0 });
    await ensureCoreMenus(trx);
    expect(Number((await trx('menus').where({ id }).first()).parent_id)).toBe(Number(parent.id));
  });
});
