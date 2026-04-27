/**
 * 迁移：统一权限码命名
 * 
 * 将 menus 表中前端旧命名的权限码更新为后端统一命名，
 * 同时为 HR 细化的子权限码新增菜单条目。
 *
 * @date 2026-04-18
 */

// 旧权限码 → 新权限码 映射表
const PERMISSION_MAPPING = {
  // Finance: Cash/Bank
  'finance:bankaccounts:create': 'finance:cash:create',
  'finance:bankaccounts:export': 'finance:cash:export',
  'finance:cashtransactions:create': 'finance:cash:create',
  'finance:cashtransactions:delete': 'finance:cash:delete',
  'finance:cashtransactions:export': 'finance:cash:export',
  'finance:cashtransactions:import': 'finance:cash:create',
  'finance:cashtransactions:print': 'finance:cash:view',
  'finance:cashtransactions:submit': 'finance:cash:approve',
  'finance:transactions:create': 'finance:cash:create',
  'finance:transactions:delete': 'finance:cash:delete',
  'finance:transactions:export': 'finance:cash:export',
  'finance:transactions:import': 'finance:cash:create',
  'finance:transactions:print': 'finance:cash:view',
  'finance:transactions:submit': 'finance:cash:approve',
  'finance:reconciliation:import': 'finance:cash:reconcile',

  // Finance: AP
  'finance:ap:invoices:create': 'finance:ap:create',
  'finance:ap:invoices:delete': 'finance:ap:update',
  'finance:ap:invoices:update': 'finance:ap:update',
  'finance:payments:create': 'finance:ap:pay',
  'finance:payments:print': 'finance:ap:view',
  'finance:payments:void': 'finance:ap:update',

  // Finance: AR
  'finance:ar:invoices:create': 'finance:ar:create',
  'finance:ar:invoices:delete': 'finance:ar:update',
  'finance:ar:invoices:update': 'finance:ar:update',
  'finance:receipts:create': 'finance:ar:receive',
  'finance:receipts:print': 'finance:ar:view',
  'finance:receipts:void': 'finance:ar:update',
  'finance:invoices:create': 'finance:ar:create',
  'finance:invoices:print': 'finance:ar:view',
  'finance:aging:export': 'finance:ar:view',
  'finance:aging:print': 'finance:ar:view',

  // Finance: GL/Entries
  'finance:entryform:create': 'finance:entries:create',
  'finance:entryform:update': 'finance:entries:update',
  'finance:entries:delete': 'finance:entries:update',
  'finance:entries:print': 'finance:entries:view',
  'finance:gl:accounts:create': 'finance:accounts:create',
  'finance:gl:entries:create': 'finance:entries:create',

  // Finance: Reports
  'finance:balancesheet:export': 'finance:reports:view',
  'finance:balancesheet:print': 'finance:reports:view',
  'finance:cashflow:export': 'finance:reports:view',
  'finance:cashflow:print': 'finance:reports:view',
  'finance:incomestatement:export': 'finance:reports:view',
  'finance:incomestatement:print': 'finance:reports:view',
  'finance:standardcashflow:export': 'finance:reports:view',
  'finance:standardcashflow:print': 'finance:reports:view',

  // Finance: Assets
  'finance:assetcategorylist:create': 'finance:assets:create',
  'finance:assetcategorylist:delete': 'finance:assets:delete',
  'finance:assetslist:audit': 'finance:assets:update',
  'finance:assetslist:create': 'finance:assets:create',
  'finance:assetreports:export': 'finance:assets:export',
  'finance:ciplist:delete': 'finance:assets:delete',
  'finance:depreciation:export': 'finance:assets:export',

  // Finance: Budget
  'finance:budgetedit:create': 'finance:budgets:create',
  'finance:budgetedit:delete': 'finance:budgets:delete',
  'finance:budgetedit:update': 'finance:budgets:update',
  'finance:budgetlist:approve': 'finance:budgets:approve',
  'finance:budgetlist:create': 'finance:budgets:create',
  'finance:budgetlist:delete': 'finance:budgets:delete',

  // Finance: Expenses
  'finance:expenses:reject': 'finance:expenses:approve',
  'finance:expenses:submit': 'finance:expenses:update',
  'finance:expensecategories:create': 'finance:expenses:create',
  'finance:expensecategories:delete': 'finance:expenses:delete',
  'finance:expensecategories:update': 'finance:expenses:update',

  // Finance: Cost
  'finance:costcenter:delete': 'finance:cost:delete',
  'finance:costcenter:update': 'finance:cost:update',
  'finance:costdashboard:update': 'finance:cost:update',
  'finance:costsettings:create': 'finance:cost:create',
  'finance:costsettings:delete': 'finance:cost:delete',
  'finance:costsettings:update': 'finance:cost:update',
  'finance:activitybasedcosting:delete': 'finance:cost:delete',

  // Finance: Settings
  'finance:financesettings:create': 'finance:settings:update',
  'finance:financesettings:delete': 'finance:settings:update',
  'finance:financesettings:update': 'finance:settings:update',

  // Finance: Tax
  'finance:taxaccountconfig:create': 'finance:tax:create',
  'finance:taxaccountconfig:delete': 'finance:tax:delete',
  'finance:taxinvoices:create': 'finance:tax:create',
  'finance:taxreturns:create': 'finance:tax:create',

  // Finance: Pricing
  'finance:productpricing:update': 'finance:pricing:update',

  // Quality
  'quality:eightdreport:audit': 'quality:8d:update',
  'quality:eightdreport:close': 'quality:8d:update',
  'quality:eightdreport:delete': 'quality:8d:delete',
  'quality:eightdreport:print': 'quality:8d:view',
  'quality:eightdreport:submit': 'quality:8d:create',
  'quality:eightdreport:update': 'quality:8d:update',
  'quality:firstarticleinspection:create': 'quality:inspections:create',
  'quality:firstarticleinspection:print': 'quality:inspections:view',
  'quality:finalinspection:submit': 'quality:inspections:create',
  'quality:incominginspection:close': 'quality:inspections:update',
  'quality:incominginspection:print': 'quality:inspections:view',
  'quality:incominginspection:submit': 'quality:inspections:create',
  'quality:gaugemanagement:delete': 'quality:settings:delete',
  'quality:gaugemanagement:submit': 'quality:settings:create',
  'quality:aqlstandards:delete': 'quality:standards:delete',
  'quality:inspectiontemplates:update': 'quality:templates:update',
  'quality:nonconformingproducts:delete': 'quality:nonconforming:delete',
  'quality:nonconformingproducts:submit': 'quality:nonconforming:create',
  'quality:nonconformingproductconfig:update': 'quality:nonconforming:update',
  'quality:replacementorders:close': 'quality:replacement:update',
  'quality:replacementorders:update': 'quality:replacement:update',
  'quality:reworktasks:close': 'quality:rework:update',
  'quality:reworktasks:update': 'quality:rework:update',
  'quality:scraprecords:approve': 'quality:scrap:update',
  'quality:scraprecords:close': 'quality:scrap:update',
  'quality:scraprecords:update': 'quality:scrap:update',
  'quality:spccontrolchart:create': 'quality:settings:create',
  'quality:spccontrolchart:submit': 'quality:settings:create',

  // Sales
  'sales:salesquotations:create': 'sales:quotations:create',
  'sales:salesquotations:delete': 'sales:quotations:delete',
  'sales:salesquotations:update': 'sales:quotations:update',
  'sales:packinglists:create': 'sales:packing:create',
  'sales:exchanges:close': 'sales:returns:update',

  // Purchase
  'purchase:purchaseorderform:approve': 'purchase:orders:update',
  'purchase:purchaseorderform:update': 'purchase:orders:update',
  'purchase:purchaserequisitionform:approve': 'purchase:requisitions:update',
  'purchase:purchaserequisitionform:create': 'purchase:requisitions:create',
  'purchase:purchaserequisitionform:update': 'purchase:requisitions:update',

  // Inventory
  'inventory:inventoryoutbound:delete': 'inventory:outbound:delete',
  'inventory:inventoryoutbound:print': 'inventory:outbound:view',
  'inventory:inventoryreport:export': 'inventory:report:export',
  'inventory:inventorystockadd:submit': 'inventory:stock:edit',
  'inventory:inventorytransfer:close': 'inventory:transfer:update',
  'inventory:manualtransaction:close': 'inventory:manual:update',
  'inventory:manualtransaction:reject': 'inventory:manual:approve',

  // Production
  'production:productionplan:close': 'production:plans:update',
  'production:productionplan:update': 'production:plans:update',
  'production:productionprocess:close': 'production:process:update',
  'production:productionreport:close': 'production:reports:update',
  'production:productionreport:print': 'production:reports:view',
  'production:productiontask:close': 'production:tasks:update',
  'production:productiontask:print': 'production:tasks:view',

  // System
  'system:permissions:create': 'system:permissions:manage',
  'system:permissions:delete': 'system:permissions:manage',
  'system:permissions:update': 'system:permissions:manage',
  'system:permissions:close': 'system:permissions:manage',
};

exports.up = async function(knex) {
  // 1. 更新 menus 表中的旧权限码 → 新权限码
  //    使用事务确保原子性
  await knex.transaction(async (trx) => {
    for (const [oldCode, newCode] of Object.entries(PERMISSION_MAPPING)) {
      // 检查新码是否已存在
      const existing = await trx('menus')
        .where('permission', newCode)
        .first();

      if (existing) {
        // 新码已存在: 删除旧码条目（避免重复），并将 role_menus 中引用旧码的记录迁移到新码
        const oldMenus = await trx('menus').where('permission', oldCode);
        for (const oldMenu of oldMenus) {
          // 将 role_menus 中指向旧 menu_id 的记录改为指向新 menu_id
          await trx('role_menus')
            .where('menu_id', oldMenu.id)
            .update({ menu_id: existing.id })
            .catch(() => {
              // 忽略重复键错误（角色已有该权限）
            });
          // 删除旧的 role_menus 关联（可能有残留的重复记录）
          await trx('role_menus').where('menu_id', oldMenu.id).del();
          // 删除旧的 menus 条目
          await trx('menus').where('id', oldMenu.id).del();
        }
      } else {
        // 新码不存在: 直接更新旧码为新码
        await trx('menus')
          .where('permission', oldCode)
          .update({ permission: newCode });
      }
    }

    // 2. 为 HR 细化权限新增按钮级菜单条目
    // 先查找 HR 父菜单
    const hrParent = await trx('menus').where('permission', 'hr').first();
    if (hrParent) {
      const hrPermissions = [
        { name: '新增员工', permission: 'hr:employees:create', type: 2 },
        { name: '编辑员工', permission: 'hr:employees:update', type: 2 },
        { name: '删除员工', permission: 'hr:employees:delete', type: 2 },
        { name: '考勤管理', permission: 'hr:attendance:update', type: 2 },
        { name: '薪酬核算', permission: 'hr:salary:update', type: 2 },
        { name: '薪酬查看', permission: 'hr:salary:view', type: 2 },
      ];

      for (const perm of hrPermissions) {
        const exists = await trx('menus').where('permission', perm.permission).first();
        if (!exists) {
          await trx('menus').insert({
            parent_id: hrParent.id,
            name: perm.name,
            permission: perm.permission,
            type: perm.type,
            status: 1,
            sort_order: 0,
          });
        }
      }
    }
  });
};

exports.down = async function(knex) {
  // 回滚：将新权限码改回旧权限码（仅直接更新的部分可回滚）
  // 注意：已合并删除的记录无法完全恢复，需要重新导入菜单数据
  await knex.transaction(async (trx) => {
    for (const [oldCode, newCode] of Object.entries(PERMISSION_MAPPING)) {
      // 只回滚单一映射（多对一的映射无法自动回滚）
      const count = Object.values(PERMISSION_MAPPING).filter(v => v === newCode).length;
      if (count === 1) {
        await trx('menus')
          .where('permission', newCode)
          .update({ permission: oldCode });
      }
    }

    // 删除 HR 细化权限
    const hrPerms = [
      'hr:employees:create', 'hr:employees:update', 'hr:employees:delete',
      'hr:attendance:update', 'hr:salary:update', 'hr:salary:view',
    ];
    await trx('menus').whereIn('permission', hrPerms).del();
  });
};
