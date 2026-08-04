/**
 * 财务专业化收口：
 * 1) 配置写入正确表 system_config（修复 20260801000003 写到 system_configs 的问题）
 * 2) 三单匹配菜单绑定管理员角色
 * 3) 清洗历史「已取消仍占用 source_id」的 AR/AP 发票
 */

const FINANCE_CONFIGS = [
  {
    key: 'finance_tax_split_fail_closed',
    value: 'true',
    type: 'boolean',
    description: '价税分离失败时拒绝确认发票',
  },
  {
    key: 'enable_order_level_ar_invoice',
    value: 'false',
    type: 'boolean',
    description: '是否允许订单级应收（专业路径默认关闭）',
  },
  {
    key: 'enable_order_level_ap_invoice',
    value: 'false',
    type: 'boolean',
    description: '是否允许订单级应付（专业路径默认关闭）',
  },
  {
    key: 'ap_three_way_match_required',
    value: 'false',
    type: 'boolean',
    description: '确认应付前是否强制三单匹配（开启后未匹配不可确认）',
  },
  {
    key: 'ap_match_qty_tolerance_pct',
    value: '0.02',
    type: 'number',
    description: '三单匹配数量容差比例',
  },
  {
    key: 'ap_match_amount_tolerance',
    value: '1',
    type: 'number',
    description: '三单匹配金额容差（元）',
  },
  {
    key: 'ap_payment_approval_threshold',
    value: '50000',
    type: 'number',
    description: '应付付款审批金额阈值（元）',
  },
];

const THREE_WAY_MENU = {
  id: 952,
  name: '三单匹配',
  path: '/finance/ap/three-way-match',
  component: 'finance/ap/ThreeWayMatch',
  permission: 'finance:ap:view',
  icon: 'Connection',
  sort_order: 52,
  anchor_path: '/finance/ap/invoices',
  fallback_parent_path: '/finance',
};

const INACTIVE_STATUSES = ['已取消', 'cancelled', 'void', '作废', 'VOID', 'VOIDED'];

async function upsertConfig(knex, item) {
  const existing = await knex('system_config').where({ config_key: item.key }).first();
  if (existing) {
    await knex('system_config')
      .where({ config_key: item.key })
      .update({
        config_value: item.value,
        config_type: item.type,
        description: item.description,
        module: 'finance',
        status: 1,
        updated_at: knex.fn.now(),
      });
    return;
  }
  await knex('system_config').insert({
    config_key: item.key,
    config_value: item.value,
    config_type: item.type,
    description: item.description,
    module: 'finance',
    is_system: 1,
    status: 1,
  });
}

async function resolveParentId(trx, menu) {
  const anchor = await trx('menus').where('path', menu.anchor_path).first();
  if (anchor?.parent_id) return anchor.parent_id;
  if (anchor?.id) return anchor.parent_id || anchor.id;
  const finance = await trx('menus').where('path', menu.fallback_parent_path).first();
  return finance?.id || null;
}

async function ensureThreeWayMenu(trx) {
  const menu = THREE_WAY_MENU;
  const exists = await trx('menus').where('path', menu.path).orWhere({ id: menu.id }).first();
  const parentId = await resolveParentId(trx, menu);
  if (!parentId) return null;

  let menuId;
  if (exists) {
    await trx('menus')
      .where('id', exists.id)
      .update({
        name: menu.name,
        path: menu.path,
        component: menu.component,
        permission: menu.permission,
        icon: menu.icon,
        parent_id: parentId,
        type: 1,
        visible: 1,
        status: 1,
        sort_order: menu.sort_order,
        updated_at: trx.fn.now(),
      });
    menuId = exists.id;
  } else {
    const insertRow = {
      id: menu.id,
      parent_id: parentId,
      name: menu.name,
      path: menu.path,
      component: menu.component,
      permission: menu.permission,
      icon: menu.icon,
      type: 1,
      visible: 1,
      status: 1,
      sort_order: menu.sort_order,
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    };
    try {
      await trx('menus').insert(insertRow);
      menuId = menu.id;
    } catch {
      delete insertRow.id;
      const [id] = await trx('menus').insert(insertRow);
      menuId = id;
    }
  }

  // 绑定管理员 + 所有 is_super_admin 角色
  const roles = await trx('roles')
    .where('code', 'admin')
    .orWhere('name', '管理员')
    .orWhere('name', '超级管理员')
    .orWhere('is_super_admin', 1);

  // 同时确保结算菜单也有角色（幂等）
  const settlementIds = (
    await trx('menus')
      .whereIn('path', [
        '/finance/ar/settlement',
        '/finance/ap/settlement',
        '/finance/ap/three-way-match',
      ])
      .select('id')
  ).map((r) => r.id);

  const menuIds = [...new Set([menuId, ...settlementIds].filter(Boolean))];
  for (const role of roles) {
    for (const mid of menuIds) {
      const link = await trx('role_menus').where({ role_id: role.id, menu_id: mid }).first();
      if (!link) {
        try {
          await trx('role_menus').insert({
            role_id: role.id,
            menu_id: mid,
            created_at: trx.fn.now(),
          });
        } catch {
          /* ignore duplicate */
        }
      }
    }
  }
  return menuId;
}

async function releaseCancelledSources(knex, tableName) {
  const hasTable = await knex.schema.hasTable(tableName);
  if (!hasTable) return 0;
  const hasSource = await knex.schema.hasColumn(tableName, 'source_id');
  if (!hasSource) return 0;

  const noteSuffix = '[source released on cancel backfill 20260801]';
  const updated = await knex(tableName)
    .whereIn('status', INACTIVE_STATUSES)
    .whereNotNull('source_id')
    .update({
      source_id: null,
      notes: knex.raw(
        `CONCAT(COALESCE(notes, ''), CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE ' | ' END, ?)`,
        [noteSuffix]
      ),
      updated_at: knex.fn.now(),
    });
  return Number(updated) || 0;
}

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('system_config')) {
    for (const item of FINANCE_CONFIGS) {
      await upsertConfig(knex, item);
    }
  }

  if (await knex.schema.hasTable('menus')) {
    await knex.transaction(async (trx) => {
      await ensureThreeWayMenu(trx);
    });
  }

  await releaseCancelledSources(knex, 'ar_invoices');
  await releaseCancelledSources(knex, 'ap_invoices');
};

exports.down = async function down(knex) {
  // 配置与数据清洗不自动回滚；菜单角色绑定保留
  if (await knex.schema.hasTable('system_config')) {
    await knex('system_config')
      .whereIn(
        'config_key',
        FINANCE_CONFIGS.map((c) => c.key)
      )
      .del();
  }
};
