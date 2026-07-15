/**
 * 生产管理模块：英文菜单/按钮名称本地化为中文
 * 同步 permissions 表中对应权限的中文显示名（权限码不变）
 */

const MENU_RENAMES = [
  // 页面菜单
  { match: { path: '/production/material-shortage' }, name: '缺料统计' },
  { match: { permission: 'production:shortage' }, name: '缺料统计' },
  { match: { path: '/production/material-readiness' }, name: '物料齐套检查' },
  { match: { permission: 'production:material-check' }, name: '物料齐套检查' },
  { match: { path: '/production/data-view' }, name: '生产数据看板' },
  { match: { permission: 'production:data-view' }, name: '生产数据看板' },
  { match: { path: '/production/gantt' }, name: '排程甘特图' },
  { match: { permission: 'production:gantt' }, name: '排程甘特图' },
  { match: { path: '/production/work-stations' }, name: '工位管理' },
  { match: { permission: 'production:stations' }, name: '工位管理' },
  { match: { path: '/production/process-routes' }, name: '工序路线' },
  { match: { permission: 'production:routes' }, name: '工序路线' },
  { match: { path: '/production/assembly-board' }, name: '装配看板' },
  { match: { permission: 'production:assembly' }, name: '装配看板' },

  // 按钮权限（type=2）
  { match: { permission: 'production:anomaly:view' }, name: '查看异常上报' },
  { match: { permission: 'production:anomaly:create' }, name: '创建异常上报' },
  { match: { permission: 'production:anomaly:update' }, name: '编辑异常上报' },
  { match: { permission: 'production:anomaly:delete' }, name: '删除异常上报' },
  { match: { permission: 'production:material-check:view' }, name: '查看物料齐套' },
  { match: { permission: 'production:stations:view' }, name: '查看工位' },
  { match: { permission: 'production:stations:create' }, name: '创建工位' },
  { match: { permission: 'production:stations:update' }, name: '编辑工位' },
  { match: { permission: 'production:stations:delete' }, name: '删除工位' },
  { match: { permission: 'production:routes:view' }, name: '查看工序路线' },
  { match: { permission: 'production:routes:create' }, name: '创建工序路线' },
  { match: { permission: 'production:routes:update' }, name: '编辑工序路线' },
  { match: { permission: 'production:routes:delete' }, name: '删除工序路线' },
  { match: { permission: 'production:assembly:view' }, name: '查看装配看板' },
  { match: { permission: 'production:assembly:execute' }, name: '执行装配工序' },
];

const PERMISSION_NAMES = {
  'production:shortage': '缺料统计',
  'production:shortage:view': '查看缺料统计',
  'production:shortage:export': '导出缺料统计',
  'production:material-check': '物料齐套检查',
  'production:material-check:view': '查看物料齐套',
  'production:data-view': '生产数据看板',
  'production:data-view:view': '查看生产数据看板',
  'production:data-view:create': '创建生产数据看板',
  'production:data-view:edit': '编辑生产数据看板',
  'production:data-view:delete': '删除生产数据看板',
  'production:gantt': '排程甘特图',
  'production:stations': '工位管理',
  'production:stations:view': '查看工位',
  'production:stations:create': '创建工位',
  'production:stations:update': '编辑工位',
  'production:stations:delete': '删除工位',
  'production:routes': '工序路线',
  'production:routes:view': '查看工序路线',
  'production:routes:create': '创建工序路线',
  'production:routes:update': '编辑工序路线',
  'production:routes:delete': '删除工序路线',
  'production:assembly': '装配看板',
  'production:assembly:view': '查看装配看板',
  'production:assembly:execute': '执行装配工序',
  'production:anomaly': '异常上报',
  'production:anomaly:view': '查看异常上报',
  'production:anomaly:create': '创建异常上报',
  'production:anomaly:update': '编辑异常上报',
  'production:anomaly:delete': '删除异常上报',
  'production:calendar': '生产日历',
  'production:calendar:view': '查看生产日历',
  'production:calendar:update': '维护生产日历',
  'production:mrp': '生产需求',
  'production:mrp:view': '查看生产需求',
  'production:mrp:create': '创建生产需求',
  'production:mrp:update': '编辑生产需求',
  'production:mrp:delete': '删除生产需求',
  'production:equipment': '设备监控',
  'production:equipment:view': '查看设备监控',
  'production:equipment:create': '创建设备监控',
  'production:equipment:update': '编辑设备监控',
  'production:equipment:delete': '删除设备监控',
  'production:plans': '生产计划',
  'production:plans:view': '查看计划',
  'production:plans:create': '创建计划',
  'production:plans:update': '编辑计划',
  'production:plans:delete': '删除计划',
  'production:plans:approve': '审批计划',
  'production:plans:export': '导出计划',
  'production:plans:pushdown': '下推计划',
  'production:plans:submit': '提交计划',
  'production:plans:close': '关闭计划',
  'production:plans:cancel': '取消计划',
  'production:plans:import': '导入计划',
  'production:tasks': '生产任务',
  'production:tasks:view': '查看任务',
  'production:tasks:create': '创建任务',
  'production:tasks:update': '编辑任务',
  'production:tasks:delete': '删除任务',
  'production:tasks:start': '开始任务',
  'production:tasks:complete': '完成任务',
  'production:tasks:close': '关闭任务',
  'production:tasks:submit': '提交任务',
  'production:tasks:issue': '任务发料',
  'production:tasks:export': '导出任务',
  'production:tasks:import': '导入任务',
  'production:process': '生产过程',
  'production:process:view': '查看过程',
  'production:process:create': '创建过程',
  'production:process:update': '编辑过程',
  'production:process:delete': '删除过程',
  'production:reports': '生产报工',
  'production:reports:view': '查看报工',
  'production:reports:create': '创建报工',
  'production:reports:update': '编辑报工',
  'production:reports:delete': '删除报工',
  'production:outsourced': '委外管理',
  'production:outsourced:view': '查看委外',
  'production:outsourced:create': '创建委外',
  'production:outsourced:update': '编辑委外',
  'production:outsourced:delete': '删除委外',
  production: '生产管理',
};

async function renameMenu(trx, match, name) {
  const q = trx('menus');
  if (match.path) q.where({ path: match.path });
  if (match.permission) q.where({ permission: match.permission });
  const updated = await q.update({ name, updated_at: trx.fn.now() });
  return updated;
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    for (const item of MENU_RENAMES) {
      await renameMenu(trx, item.match, item.name);
    }

    const hasPermissions = await trx.schema.hasTable('permissions');
    if (hasPermissions) {
      for (const [code, name] of Object.entries(PERMISSION_NAMES)) {
        await trx('permissions')
          .where({ code })
          .update({ name, updated_at: trx.fn.now() });
      }
    }
  });
};

exports.down = async function down(knex) {
  // 本地化不回滚为英文（避免再次出现英文侧栏）
  return knex;
};
