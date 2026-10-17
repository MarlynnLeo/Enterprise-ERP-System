'use strict';

const REPORT_ROOT = '/finance/reports';
const REPORT_PERMISSION = 'finance:reports:view';
const REPORTS = [
  ['balance-sheet', '资产负债表', 'BalanceSheet', REPORT_PERMISSION],
  ['income-statement', '利润表', 'IncomeStatement', REPORT_PERMISSION],
  ['cash-flow', '现金流量表', 'CashFlow', REPORT_PERMISSION],
  [
    'standard-cash-flow',
    '标准现金流量表',
    'StandardCashFlow',
    'finance:reports:standard-cash-flow:view',
  ],
  ['ledgers/vat', '增值税多栏账', 'LedgerReport', REPORT_PERMISSION],
  ['ledgers/quantity', '数量金额明细账', 'LedgerReport', REPORT_PERMISSION],
  ['ledgers/general', '总分类账', 'LedgerReport', REPORT_PERMISSION],
  ['ledgers/cash', '库存现金日记账', 'LedgerReport', REPORT_PERMISSION],
  ['ledgers/payable', '应付账款明细分类账', 'LedgerReport', REPORT_PERMISSION],
];

/**
 * Restore the existing report directory and balance-sheet identity. This is a
 * forward repair of the deployed center migration; no menu or grant is deleted.
 */
exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const menus = await trx('menus').select('*').orderBy('id');
    const finance = menus.find((menu) => menu.path === '/finance');
    // Empty installations receive the same hierarchy from CORE_MENUS at seed time.
    if (!finance) return;

    const permissions = await trx('permissions').select('id', 'code');
    const permissionId = (code) =>
      permissions.find((permission) => permission.code === code)?.id ?? null;
    const update = async (menu, changes) => {
      const patch = Object.fromEntries(
        Object.entries(changes).filter(([key, value]) => menu[key] !== value)
      );
      if (!Object.keys(patch).length) return;
      await trx('menus')
        .where({ id: menu.id })
        .update({ ...patch, updated_at: trx.fn.now() });
      Object.assign(menu, patch);
    };
    const insert = async (definition) => {
      const payload = {
        ...definition,
        visible: 1,
        status: 1,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      };
      const [id] = await trx('menus').insert(payload);
      const menu = { ...payload, id };
      menus.push(menu);
      return menu;
    };

    const directories = menus.filter(
      (menu) =>
        (menu.path === REPORT_ROOT && Number(menu.type) === 0) ||
        (Number(menu.parent_id) === Number(finance.id) &&
          Number(menu.type) === 0 &&
          !String(menu.path || '').trim() &&
          menu.permission === 'finance:reports' &&
          ['财务报表', '报表明细'].includes(menu.name))
    );
    const centers = menus.filter((menu) => menu.path === REPORT_ROOT && Number(menu.type) === 1);
    const balanceSheets = menus.filter((menu) => menu.path === `${REPORT_ROOT}/balance-sheet`);
    if (directories.length > 1 || centers.length > 1 || (centers.length && balanceSheets.length)) {
      // Do not guess which independently customized identity should own grants.
      const ids = [...directories, ...centers, ...balanceSheets].map((menu) => menu.id).join(', ');
      throw new Error(`Conflicting financial report menu identities: ${ids}`);
    }
    let [directory] = directories;
    const [center] = centers;

    if (center) {
      // Vacate the directory path before assigning it to the legacy folder.
      await update(center, {
        name: '资产负债表',
        path: `${REPORT_ROOT}/balance-sheet`,
        component: 'finance/reports/BalanceSheet',
        type: 1,
      });
    }

    const directoryDefinition = {
      name: '财务报表',
      path: REPORT_ROOT,
      component: '',
      parent_id: finance.id,
      permission: 'finance:reports',
      permission_id: permissionId('finance:reports'),
      type: 0,
      visible: 1,
    };
    if (directory) {
      await update(directory, directoryDefinition);
    } else {
      directory = await insert({ ...directoryDefinition, icon: 'icon-pie-chart', sort_order: 8 });
    }

    const ledgerIds = [];
    for (const [index, [suffix, name, component, permission]] of REPORTS.entries()) {
      const path = `${REPORT_ROOT}/${suffix}`;
      const existing = menus.filter((menu) => menu.path === path && Number(menu.type) !== 2);
      if (existing.length) {
        // This also repairs fresh installs where the immutable center migration
        // lifted the seeded report pages out of their directory. Preserve an
        // existing custom grouping outside the built-in report parents.
        const builtInParents = [finance.id, directory.id, center?.id].filter(Boolean).map(Number);
        for (const menu of existing) {
          const parent = menus.find((row) => Number(row.id) === Number(menu.parent_id));
          if (!parent || builtInParents.includes(Number(parent.id))) {
            await update(menu, { parent_id: directory.id });
          }
        }
      } else {
        existing.push(
          await insert({
            name,
            path,
            component: `finance/reports/${component}`,
            parent_id: directory.id,
            permission,
            permission_id: permissionId(permission),
            type: 1,
            icon: 'icon-document',
            sort_order: index + 1,
          })
        );
      }
      if (index >= 4) ledgerIds.push(...existing.map((menu) => menu.id));
    }

    // Navigation links only: never infer business access from an old menu grant
    // or write role_permissions. Exact existing report viewers and admins alone
    // receive the five ledger pages and the ancestors needed to display them.
    const roles = await trx('roles').select('id', 'code', 'is_super_admin');
    const viewerGrants =
      permissionId(REPORT_PERMISSION) === null
        ? []
        : await trx('role_permissions')
            .where({ permission_id: permissionId(REPORT_PERMISSION) })
            .select('role_id');
    const viewerRoleIds = new Set(viewerGrants.map((grant) => Number(grant.role_id)));
    const menuIds = new Set();
    for (const ledgerId of ledgerIds) {
      let menu = menus.find((row) => row.id === ledgerId);
      const visited = new Set();
      while (menu && !visited.has(Number(menu.id))) {
        visited.add(Number(menu.id));
        menuIds.add(menu.id);
        menu = menus.find((row) => Number(row.id) === Number(menu.parent_id));
      }
    }
    for (const role of roles) {
      if (
        Number(role.is_super_admin) !== 1 &&
        role.code !== 'admin' &&
        !viewerRoleIds.has(Number(role.id))
      )
        continue;
      for (const menuId of menuIds) {
        await trx('role_menus')
          .insert({ role_id: role.id, menu_id: menuId })
          .onConflict(['role_id', 'menu_id'])
          .ignore();
      }
    }
  });
};

exports.down = async function down() {
  // Preserve existing menu identities and assignments; use forward repairs.
};
