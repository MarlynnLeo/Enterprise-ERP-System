async function firstMenu(trx, where) {
  return trx('menus').where(where).orderBy('id').first();
}

async function adminRoleIds(trx) {
  const rows = await trx('roles')
    .select('id')
    .where('code', 'admin')
    .orWhere('id', 1)
    .orWhere('name', 'like', '%管理员%');
  return rows.map((row) => row.id);
}

async function roleIdsWithMenu(trx, menuId) {
  if (!menuId) return [];
  const rows = await trx('role_menus').distinct('role_id').where({ menu_id: menuId });
  return rows.map((row) => row.role_id);
}

async function grantMenuToRoles(trx, menuId, roleIds) {
  if (!menuId) return;

  for (const roleId of [...new Set(roleIds.filter(Boolean))]) {
    const exists = await trx('role_menus').where({ role_id: roleId, menu_id: menuId }).first();
    if (!exists) {
      await trx('role_menus').insert({
        role_id: roleId,
        menu_id: menuId,
        created_at: trx.fn.now(),
      });
    }
  }
}

async function ensureProductionCalendarMenu(trx) {
  const parent =
    (await firstMenu(trx, { permission: 'production' })) ||
    (await firstMenu(trx, { path: '/production' }));

  const parentRoleIds = [
    ...(await roleIdsWithMenu(trx, parent?.id)),
    ...(await adminRoleIds(trx)),
  ];

  const payload = {
    parent_id: parent?.id || 0,
    name: '生产日历',
    path: '/production/calendar',
    component: 'production/ProductionCalendar',
    icon: 'icon-calendar',
    permission: 'production:calendar',
    type: 1,
    visible: 1,
    status: 1,
    sort_order: 100,
    updated_at: trx.fn.now(),
  };

  let menu = await firstMenu(trx, { path: '/production/calendar' });
  if (menu) {
    await trx('menus').where({ id: menu.id }).update(payload);
    await grantMenuToRoles(trx, menu.id, parentRoleIds);
    return menu.id;
  }

  const [menuId] = await trx('menus').insert({
    ...payload,
    created_at: trx.fn.now(),
  });
  await grantMenuToRoles(trx, menuId, parentRoleIds);
  return menuId;
}

async function ensureCalendarButton(trx, calendarMenuId, permission, name, sortOrder) {
  const inheritedRoleIds = [
    ...(await roleIdsWithMenu(trx, calendarMenuId)),
    ...(await adminRoleIds(trx)),
  ];

  const payload = {
    parent_id: calendarMenuId,
    name,
    path: '',
    component: '',
    icon: '',
    permission,
    type: 2,
    visible: 1,
    status: 1,
    sort_order: sortOrder,
    updated_at: trx.fn.now(),
  };

  let menu = await trx('menus').where({ parent_id: calendarMenuId, permission }).orderBy('id').first();
  if (!menu) {
    menu = await firstMenu(trx, { permission });
  }

  if (menu) {
    await trx('menus').where({ id: menu.id }).update(payload);
    await grantMenuToRoles(trx, menu.id, inheritedRoleIds);
    return menu.id;
  }

  const [buttonId] = await trx('menus').insert({
    ...payload,
    created_at: trx.fn.now(),
  });
  await grantMenuToRoles(trx, buttonId, inheritedRoleIds);
  return buttonId;
}

exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS production_calendar (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      work_start TIME NOT NULL DEFAULT '08:00:00',
      work_end TIME NOT NULL DEFAULT '20:00:00',
      break_start TIME NULL DEFAULT '11:30:00',
      break_end TIME NULL DEFAULT '12:30:00',
      dinner_start TIME NULL DEFAULT '17:00:00',
      dinner_end TIME NULL DEFAULT '17:30:00',
      exclude_weekends TINYINT(1) NOT NULL DEFAULT 1,
      is_default TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_production_calendar_default (is_default),
      INDEX idx_production_calendar_status (exclude_weekends)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS production_calendar_overrides (
      id INT AUTO_INCREMENT PRIMARY KEY,
      calendar_date DATE NOT NULL,
      is_workday TINYINT(1) NOT NULL,
      work_start TIME NULL,
      work_end TIME NULL,
      break_start TIME NULL,
      break_end TIME NULL,
      dinner_start TIME NULL,
      dinner_end TIME NULL,
      label VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_production_calendar_overrides_date (calendar_date),
      INDEX idx_production_calendar_overrides_workday (is_workday)
    )
  `);

  await knex.transaction(async (trx) => {
    const [{ count }] = await trx('production_calendar').count({ count: '*' });
    if (Number(count) === 0) {
      await trx('production_calendar').insert({
        name: '白班',
        work_start: '08:00:00',
        work_end: '20:00:00',
        break_start: '11:30:00',
        break_end: '12:30:00',
        dinner_start: '17:00:00',
        dinner_end: '17:30:00',
        exclude_weekends: 1,
        is_default: 1,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
    }

    const [{ default_count: defaultCount }] = await trx('production_calendar')
      .where({ is_default: 1 })
      .count({ default_count: '*' });
    if (Number(defaultCount) === 0) {
      const firstCalendar = await trx('production_calendar').select('id').orderBy('id').first();
      if (firstCalendar) {
        await trx('production_calendar').where({ id: firstCalendar.id }).update({
          is_default: 1,
          updated_at: trx.fn.now(),
        });
      }
    }

    const calendarMenuId = await ensureProductionCalendarMenu(trx);
    await ensureCalendarButton(trx, calendarMenuId, 'production:calendar:view', '查看生产日历', 1);
    await ensureCalendarButton(trx, calendarMenuId, 'production:calendar:update', '维护生产日历', 2);
  });
};

exports.down = async function down(knex) {
  await knex.transaction(async (trx) => {
    const permissions = ['production:calendar:view', 'production:calendar:update'];
    const calendarMenu = await trx('menus')
      .select('id')
      .where({ path: '/production/calendar' })
      .orderBy('id')
      .first();
    const buttonRows = calendarMenu
      ? await trx('menus').select('id').where({ parent_id: calendarMenu.id }).whereIn('permission', permissions)
      : [];
    const buttonIds = buttonRows.map((row) => row.id);
    if (buttonIds.length > 0) {
      await trx('role_menus').whereIn('menu_id', buttonIds).delete();
      await trx('menus').whereIn('id', buttonIds).delete();
    }
  });

  const hasOverrides = await knex.schema.hasTable('production_calendar_overrides');
  if (hasOverrides) {
    const [{ count }] = await knex('production_calendar_overrides').count({ count: '*' });
    if (Number(count) === 0) {
      await knex.schema.dropTableIfExists('production_calendar_overrides');
    }
  }

  const hasCalendar = await knex.schema.hasTable('production_calendar');
  if (hasCalendar) {
    const [{ count }] = await knex('production_calendar').count({ count: '*' });
    if (Number(count) === 0) {
      await knex.schema.dropTableIfExists('production_calendar');
    }
  }
};
