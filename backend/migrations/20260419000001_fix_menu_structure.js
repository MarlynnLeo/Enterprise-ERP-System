/**
 * 迁移：修复菜单结构
 *
 * 问题列表：
 * 1. 约 60 个按钮(type=2)错误地挂在目录(type=0)下，应挂在对应子菜单(type=1)下
 * 2. 7 个按钮使用英文名（receive/pay/execute/reconcile）→ 改为中文
 * 3. 8 个旧格式"关闭"按钮使用 camelCase 权限码，无实际引用 → 删除
 * 4. basedata:process-templates 与 basedata:processtemplates 重复 → 统一为后者并删除前者
 * 5. 3 个空目录（quality:gauges/spc/supplier-quality）→ 删除
 *
 * @date 2026-04-19
 */

exports.up = async function(knex) {
  await knex.transaction(async (trx) => {

    // ============================================================
    // 1. 英文名称 → 中文名称
    // ============================================================
    const renameMap = [
      { id: 1774, newName: '执行' },       // finance:cost:execute
      { id: 1783, newName: '付款' },       // finance:expenses:pay
      { id: 1787, newName: '付款' },       // finance:ap:pay
      { id: 1790, newName: '收款' },       // finance:ar:receive
      { id: 1796, newName: '执行' },       // finance:assets:execute
      { id: 1802, newName: '对账' },       // finance:cash:reconcile
      { id: 1807, newName: '缴税' },       // finance:tax:pay
    ];
    for (const item of renameMap) {
      await trx('menus').where('id', item.id).update({ name: item.newName });
    }

    // ============================================================
    // 2. 删除旧格式"关闭"按钮（这些是之前迁移产生的孤儿，无前端引用）
    // ============================================================
    const oldCloseIds = [1904, 1910, 1922, 1936, 1956, 1962, 1972, 1974, 2041, 2043];
    // 先清理 role_menus 关联
    await trx('role_menus').whereIn('menu_id', oldCloseIds).del();
    await trx('menus').whereIn('id', oldCloseIds).del();

    // ============================================================
    // 3. 删除重复的 basedata:process-templates:* （保留 processtemplates:*）
    // ============================================================
    const dupProcessIds = [1305, 1306, 1307]; // process-templates:create/update/delete
    await trx('role_menus').whereIn('menu_id', dupProcessIds).del();
    await trx('menus').whereIn('id', dupProcessIds).del();

    // ============================================================
    // 4. 删除空目录
    // ============================================================
    const emptyDirIds = [1744, 1745, 1746]; // quality:gauges, quality:spc, quality:supplier-quality
    await trx('role_menus').whereIn('menu_id', emptyDirIds).del();
    await trx('menus').whereIn('id', emptyDirIds).del();

    // ============================================================
    // 5. 移动孤儿按钮到正确的父菜单下
    //    按钮(type=2)应挂在菜单(type=1)下，不应直接挂在目录(type=0)下
    // ============================================================

    // --- 财务模块：按钮移到对应子菜单 ---

    // finance:ar 系列 → 移到 "应收账款" (ID=1432, perm=finance:ar:invoices)
    await trx('menus').whereIn('id', [1768, 1788, 1789, 1790])
      .update({ parent_id: 1432 });

    // finance:ap 系列 → 移到 "应付账款" (ID=1435, perm=finance:ap:invoices)
    await trx('menus').whereIn('id', [1769, 1785, 1786, 1787])
      .update({ parent_id: 1435 });

    // finance:cash 系列 → 已在 ID=1438 下，正确

    // finance:expenses 系列 → 移到 "费用列表" (ID=1442, perm=finance:expenses:list)
    await trx('menus').whereIn('id', [1778, 1779, 1780, 1781, 1782, 1783])
      .update({ parent_id: 1442 });

    // finance:assets 系列 → 移到 "资产列表" (ID=1733, perm=finance:assets:list)
    await trx('menus').whereIn('id', [1791, 1792, 1793, 1794, 1796, 1797])
      .update({ parent_id: 1733 });

    // finance:tax 系列 → 移到 "税务发票" (ID=1450, perm=finance:tax:invoices)
    await trx('menus').whereIn('id', [1804, 1805, 1806, 1807, 1808])
      .update({ parent_id: 1450 });

    // finance:periodEnd 系列 → 移到 "期末结转" (ID=1431, perm=finance:gl:period-closing)
    await trx('menus').whereIn('id', [1858, 1859])
      .update({ parent_id: 1431 });

    // finance:approval 系列 → 没有对应子菜单，创建一个
    const [approvalMenuId] = await trx('menus').insert({
      parent_id: 11,  // 财务管理
      name: '财务审批',
      permission: 'finance:approval',
      type: 1,
      status: 1,
      sort_order: 50,
    });
    await trx('menus').whereIn('id', [1860, 1861, 1862])
      .update({ parent_id: approvalMenuId });

    // finance:budgets 系列 → 移到 "预算列表" (ID=1454, perm=finance:budget:list)
    await trx('menus').whereIn('id', [1863, 1864, 1865, 1866, 1867])
      .update({ parent_id: 1454 });

    // finance:cost 系列 → 移到 "成本设置" (ID=1460, perm=finance:cost:settings)
    await trx('menus').whereIn('id', [1771, 1772, 1773, 1774, 1775])
      .update({ parent_id: 1460 });

    // --- 生产模块 ---
    // production:outsourced 系列 → 没有对应子菜单，创建一个
    const [outsourcedMenuId] = await trx('menus').insert({
      parent_id: 4,  // 生产管理
      name: '委外管理',
      permission: 'production:outsourced',
      type: 1,
      status: 1,
      sort_order: 60,
    });
    await trx('menus').whereIn('id', [1869, 1870, 1871, 1872])
      .update({ parent_id: outsourcedMenuId });

    // --- 采购模块 ---
    // purchase:reports:view → 移到采购订单下(ID=72) 作为通用查看
    await trx('menus').where('id', 1868).update({ parent_id: 72 });

    // --- 销售模块 ---
    // sales:reports:view → 移到销售订单下(ID=81)
    await trx('menus').where('id', 1886).update({ parent_id: 81 });

    // --- 质量模块 ---
    // quality:inspections 系列 → 移到 "来料检验" (ID=101, perm=quality:incoming)
    await trx('menus').whereIn('id', [1873, 1874, 1875, 1876])
      .update({ parent_id: 101 });

    // quality:settings 系列 → 移到 "检验模板" (ID=103, perm=quality:templates)
    await trx('menus').whereIn('id', [1877, 1878, 1879, 1880])
      .update({ parent_id: 103 });

    // quality:standards 系列 → 创建 "AQL标准" 子菜单
    const [aqlMenuId] = await trx('menus').insert({
      parent_id: 10,  // 质量管理
      name: 'AQL标准',
      permission: 'quality:standards',
      type: 1,
      status: 1,
      sort_order: 80,
    });
    await trx('menus').whereIn('id', [1881, 1882, 1883, 1884])
      .update({ parent_id: aqlMenuId });

    // quality:nonconforming 按钮 → 移到 "不合格品" (ID=1265)
    await trx('menus').whereIn('id', [2022, 2023, 2024])
      .update({ parent_id: 1265 });

    // quality:replacement:update → 移到 "换货单管理" (ID=1266)
    await trx('menus').where('id', 2025).update({ parent_id: 1266 });

    // quality:rework:update → 移到 "返工任务管理" (ID=1267)
    await trx('menus').where('id', 2027).update({ parent_id: 1267 });

    // quality:scrap:update → 移到 "报废记录管理" (ID=1268)
    await trx('menus').where('id', 2029).update({ parent_id: 1268 });

    // --- 系统模块 ---
    // system:notifications 下的按钮已在目录下，可接受（通知中心类似菜单功能）
    // system:tech-comm 下的按钮已在目录下，可接受

    // system:backup 系列 → 移到 "系统监控" (ID=1288)
    await trx('menus').whereIn('id', [1284, 1285, 1286])
      .update({ parent_id: 1288 });

    // system:settings 系列（read/write/update）→ 移到用户管理(ID=91)下更合理
    // 实际上 system:settings:update(ID=1777) 应移到通用位置
    // system:permissions:manage(ID=1289) → 移到权限设置(ID=93)
    await trx('menus').where('id', 1289).update({ parent_id: 93 });

    // system:admin(ID=1283) → 移到权限设置(ID=93)
    await trx('menus').where('id', 1283).update({ parent_id: 93 });

    // system:settings:read/write → 移到用户管理(ID=91)
    await trx('menus').whereIn('id', [1290, 1291]).update({ parent_id: 91 });

    // system:settings:update(ID=1777) → 移到系统日志(ID=1287)
    await trx('menus').where('id', 1777).update({ parent_id: 1287 });

    // --- HR 模块 ---
    // hr:salary 按钮 → 移到 "薪资管理" (ID=133)
    await trx('menus').whereIn('id', [2045, 2046]).update({ parent_id: 133 });
  });
};

exports.down = async function(knex) {
  // 回滚此迁移需要手工恢复，因为涉及大量的 parent_id 变更和删除
  // 建议通过重新导入菜单数据来回滚
  console.warn('此迁移不支持自动回滚，请通过重新导入菜单数据恢复');
};
