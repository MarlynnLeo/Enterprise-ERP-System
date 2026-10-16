'use strict';

/**
 * Use the existing report menu identity so role assignments survive the move
 * from the balance sheet landing page to the financial report center.
 */
exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const finance = await trx('menus').where({ path: '/finance' }).first();
    if (!finance) return;

    let center = await trx('menus').where({ path: '/finance/reports' }).first();
    const permission = await trx('permissions').where({ code: 'finance:reports:view' }).first();
    let created = false;

    if (!center) {
      const legacy = await trx('menus')
        .where({ path: '/finance/reports/balance-sheet', permission: 'finance:reports:view', type: 1 })
        .orderBy('id')
        .first();
      const changes = {
        name: '财务报表',
        path: '/finance/reports',
        parent_id: finance.id,
        component: 'finance/reports/ReportCenter',
        permission: 'finance:reports:view',
        ...(permission ? { permission_id: permission.id } : {}),
        updated_at: trx.fn.now(),
      };
      if (legacy) {
        await trx('menus').where({ id: legacy.id }).update(changes);
        center = { ...legacy, ...changes };
      } else {
        const payload = {
          ...changes,
          icon: 'icon-document',
          type: 1,
          visible: 1,
          status: 1,
          sort_order: 8,
          created_at: trx.fn.now(),
        };
        const [id] = await trx('menus').insert(payload);
        center = { ...payload, id };
        created = true;
      }
    }

    // Existing installations may already have a center nested under the old
    // pathless report directory. Match the bootstrap route's direct parent.
    if (Number(center.parent_id) !== Number(finance.id)) {
      await trx('menus').where({ id: center.id }).update({
        parent_id: finance.id,
        updated_at: trx.fn.now(),
      });
      center = { ...center, parent_id: finance.id };
    }

    // Sidebar nodes with visible children only expand. Keep the center a
    // navigable page and retain its former report links beside it.
    await trx('menus')
      .where({ parent_id: center.id })
      .whereNot('type', 2)
      .update({ parent_id: center.parent_id || finance.id, updated_at: trx.fn.now() });

    // Keep legacy detail pages and every grant on their original identities.
    // Only distinguish the old pathless folder from the new report center;
    // a folder with no navigable children can be hidden without deleting it.
    const legacyFolders = await trx('menus').where({
      parent_id: finance.id,
      name: '财务报表',
      permission: 'finance:reports',
      type: 0,
    });
    for (const folder of legacyFolders) {
      if (String(folder.path || '').trim()) continue;
      const child = await trx('menus').where({ parent_id: folder.id }).whereNot('type', 2).first();
      await trx('menus').where({ id: folder.id }).update({
        name: '报表明细',
        ...(!child ? { visible: 0 } : {}),
        updated_at: trx.fn.now(),
      });
    }

    if (created) {
      // A menu link does not grant report access. Assign only existing exact
      // report viewers and administrators; never add role permissions here.
      const roles = await trx('roles as r')
        .distinct('r.id')
        .leftJoin('role_permissions as rp', 'rp.role_id', 'r.id')
        .leftJoin('permissions as p', 'p.id', 'rp.permission_id')
        .where(builder => builder
          .where('r.is_super_admin', 1)
          .orWhere('r.code', 'admin')
          .orWhere('p.code', 'finance:reports:view'));
      for (const role of roles) {
        await trx('role_menus')
          .insert({ role_id: role.id, menu_id: center.id })
          .onConflict(['role_id', 'menu_id'])
          .ignore();
      }
    }
  });
};

exports.down = async function down() {
  // Preserve the menu identity and user assignments; the old report URL is
  // still supported by the application.
};
