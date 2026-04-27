/**
 * 迁移：插入新模块菜单到 menus 表并为 admin 角色分配
 * 包含：MRP / 合同管理 / ECN / 汇率维护 / 工作流 / 编码规则 / 文档管理 / 业务告警
 * @date 2026-04-21
 */

exports.up = async function(knex) {
  // 获取各父菜单的 id（通过 path 匹配）
  const getParentId = async (path) => {
    const [rows] = await knex.raw('SELECT id FROM menus WHERE path = ? LIMIT 1', [path]);
    return rows.length > 0 ? rows[0].id : null;
  };

  const productionId = await getParentId('/production');
  const salesId = await getParentId('/sales');
  const basedataId = await getParentId('/basedata');
  const financeId = await getParentId('/finance');
  const systemId = await getParentId('/system');
  const hrId = await getParentId('/hr');

  // 待插入菜单定义
  const newMenus = [];

  // ========== 生产管理下 — MRP ==========
  if (productionId) {
    newMenus.push({
      parent_id: productionId,
      name: 'MRP需求计划',
      path: '/production/mrp',
      icon: 'icon-data-analysis',
      permission: 'production:plans',
      type: 1,
      sort_order: 70
    });
  }

  // ========== 销售管理下 — 合同管理 ==========
  if (salesId) {
    newMenus.push({
      parent_id: salesId,
      name: '合同管理',
      path: '/sales/contracts',
      icon: 'icon-document-copy',
      permission: 'contract:view',
      type: 1,
      sort_order: 80
    });
  }

  // ========== 基础数据下 — ECN ==========
  if (basedataId) {
    newMenus.push({
      parent_id: basedataId,
      name: '工程变更(ECN)',
      path: '/basedata/ecn',
      icon: 'icon-edit',
      permission: 'basedata:bom',
      type: 1,
      sort_order: 100
    });
  }

  // ========== 财务管理下 — 汇率维护 ==========
  if (financeId) {
    newMenus.push({
      parent_id: financeId,
      name: '汇率维护',
      path: '/finance/settings/exchange-rates',
      icon: 'icon-coin',
      permission: 'finance:settings',
      type: 1,
      sort_order: 161
    });
  }

  // ========== 系统管理下 — 工作流 / 编码规则 / 文档管理 / 业务告警 ==========
  if (systemId) {
    newMenus.push({
      parent_id: systemId,
      name: '审批工作流',
      path: '/system/workflow',
      icon: 'icon-connection',
      permission: 'system:workflow',
      type: 1,
      sort_order: 80
    });
    newMenus.push({
      parent_id: systemId,
      name: '编码规则',
      path: '/system/coding-rules',
      icon: 'icon-stamp',
      permission: 'system:settings',
      type: 1,
      sort_order: 90
    });
    newMenus.push({
      parent_id: systemId,
      name: '文档管理',
      path: '/system/documents',
      icon: 'icon-files',
      permission: 'system:documents',
      type: 1,
      sort_order: 100
    });
    newMenus.push({
      parent_id: systemId,
      name: '业务告警',
      path: '/system/business-alerts',
      icon: 'icon-warning',
      permission: 'system:settings',
      type: 1,
      sort_order: 110
    });
  }

  // ========== 人力资源下 — 绩效考核 ==========
  if (hrId) {
    newMenus.push({
      parent_id: hrId,
      name: '绩效考核',
      path: '/hr/performance',
      icon: 'icon-trophy',
      permission: 'hr:performance',
      type: 1,
      sort_order: 40
    });
  }

  // 逐条插入，跳过已存在的（通过 path 判断）
  const insertedIds = [];
  for (const menu of newMenus) {
    const [existing] = await knex.raw('SELECT id FROM menus WHERE path = ?', [menu.path]);
    if (existing.length === 0) {
      const [result] = await knex.raw(
        `INSERT INTO menus (parent_id, name, path, icon, permission, type, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
        [menu.parent_id, menu.name, menu.path, menu.icon, menu.permission, menu.type, menu.sort_order]
      );
      insertedIds.push(result.insertId);
    } else {
      insertedIds.push(existing[0].id);
    }
  }

  // 为 admin 角色（id=1）分配新菜单
  const [adminRole] = await knex.raw("SELECT id FROM roles WHERE code = 'admin' OR name = '超级管理员' LIMIT 1");
  const adminRoleId = adminRole.length > 0 ? adminRole[0].id : 1;

  for (const menuId of insertedIds) {
    const [existLink] = await knex.raw(
      'SELECT id FROM role_menus WHERE role_id = ? AND menu_id = ?',
      [adminRoleId, menuId]
    );
    if (existLink.length === 0) {
      await knex.raw(
        'INSERT INTO role_menus (role_id, menu_id, created_at) VALUES (?, ?, NOW())',
        [adminRoleId, menuId]
      );
    }
  }

  console.log(`[Migration] 已插入 ${insertedIds.length} 个新菜单并分配给 admin 角色`);
};

exports.down = async function(knex) {
  const paths = [
    '/production/mrp',
    '/sales/contracts',
    '/basedata/ecn',
    '/finance/settings/exchange-rates',
    '/system/workflow',
    '/system/coding-rules',
    '/system/documents',
    '/system/business-alerts',
    '/hr/performance'
  ];

  for (const path of paths) {
    const [rows] = await knex.raw('SELECT id FROM menus WHERE path = ?', [path]);
    if (rows.length > 0) {
      await knex.raw('DELETE FROM role_menus WHERE menu_id = ?', [rows[0].id]);
      await knex.raw('DELETE FROM menus WHERE id = ?', [rows[0].id]);
    }
  }
};
