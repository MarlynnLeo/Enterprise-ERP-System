exports.up = async function(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS system_backups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      file_path VARCHAR(1000) NOT NULL,
      file_size BIGINT NOT NULL DEFAULT 0,
      checksum VARCHAR(64),
      status ENUM('success','failed') NOT NULL DEFAULT 'success',
      message TEXT,
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统数据库备份记录'
  `);

  await knex.transaction(async (trx) => {
    const systemRoot = await trx('menus').where('permission', 'system').first();
    const fallbackParentId = systemRoot?.id || null;

    const specs = [
      ['system:users:create', 'system:users', '新增用户'],
      ['system:users:update', 'system:users', '编辑用户'],
      ['system:departments:create', 'system:departments', '新增部门'],
      ['system:departments:update', 'system:departments', '编辑部门'],
      ['system:departments:delete', 'system:departments', '删除部门'],
      ['system:permissions:manage', 'system:permissions', '管理权限'],
      ['system:business-types:create', 'system:business-types', '新增业务类型'],
      ['system:business-types:update', 'system:business-types', '编辑业务类型'],
      ['system:business-types:delete', 'system:business-types', '删除业务类型'],
      ['system:print:view', 'system:print', '查看打印'],
      ['system:print:create', 'system:print', '新增打印配置'],
      ['system:print:update', 'system:print', '编辑打印配置'],
      ['system:print:delete', 'system:print', '删除打印配置'],
      ['system:notifications:create', 'system:notifications', '创建通知'],
      ['system:notifications:delete', 'system:notifications', '删除通知'],
      ['system:tech-comm:create', 'system:tech-comm', '发布技术通讯'],
      ['system:tech-comm:edit', 'system:tech-comm', '编辑技术通讯'],
      ['system:tech-comm:delete', 'system:tech-comm', '删除技术通讯'],
      ['system:tech-comm:manage', 'system:tech-comm', '管理私有技术通讯'],
      ['system:workflow:view', 'system:workflow', '查看工作流'],
      ['system:workflow:create', 'system:workflow', '新增工作流'],
      ['system:workflow:edit', 'system:workflow', '编辑工作流'],
      ['system:workflow:delete', 'system:workflow', '删除工作流'],
      ['system:workflow:use', 'system:workflow', '使用工作流'],
      ['system:settings:view', 'system:settings', '查看系统配置'],
      ['system:settings:edit', 'system:settings', '编辑系统配置'],
      ['system:settings:read', 'system:settings', '读取系统配置'],
      ['system:settings:write', 'system:settings', '写入系统配置'],
      ['system:settings:update', 'system:settings', '维护系统配置'],
      ['system:documents:view', 'system:documents', '查看文档'],
      ['system:documents:create', 'system:documents', '新增文档'],
      ['system:documents:edit', 'system:documents', '编辑文档'],
      ['system:documents:delete', 'system:documents', '删除文档'],
      ['system:monitor', 'system', '系统监控'],
      ['system:backup:view', 'system:monitor', '查看备份'],
      ['system:backup:create', 'system:monitor', '创建备份'],
      ['system:backup:download', 'system:monitor', '下载备份'],
      ['system:logs', 'system', '查看系统日志'],
      ['system:admin', 'system:permissions', '系统高级管理'],
    ];

    const insertedOrExistingIds = [];
    for (const [permission, parentPermission, name] of specs) {
      let menu = await trx('menus').where('permission', permission).first();
      if (!menu) {
        const parent = await trx('menus').where('permission', parentPermission).first();
        const [id] = await trx('menus').insert({
          parent_id: parent?.id || fallbackParentId,
          name,
          path: '',
          component: '',
          permission,
          type: 2,
          status: 1,
          sort_order: 999,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
        menu = { id };
      }
      insertedOrExistingIds.push(menu.id);
    }

    const adminRoles = await trx('roles')
      .where('code', 'admin')
      .orWhere('id', 1)
      .orWhere('name', 'like', '%管理员%');

    for (const role of adminRoles) {
      for (const menuId of insertedOrExistingIds) {
        const existing = await trx('role_menus')
          .where({ role_id: role.id, menu_id: menuId })
          .first();
        if (!existing) {
          await trx('role_menus').insert({
            role_id: role.id,
            menu_id: menuId,
            created_at: trx.fn.now(),
          });
        }
      }
    }
  });
};

exports.down = async function(knex) {
  await knex.raw('DROP TABLE IF EXISTS system_backups');
};
