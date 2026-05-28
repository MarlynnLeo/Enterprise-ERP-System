const REQUIRED_PERMISSIONS = `
basedata:boms:approve
basedata:boms:create
basedata:boms:delete
basedata:boms:export
basedata:boms:update
basedata:boms:view
basedata:categories:create
basedata:categories:delete
basedata:categories:export
basedata:categories:import
basedata:categories:update
basedata:categories:view
basedata:customers:create
basedata:customers:delete
basedata:customers:export
basedata:customers:import
basedata:customers:update
basedata:customers:view
basedata:locations:create
basedata:locations:delete
basedata:locations:export
basedata:locations:update
basedata:locations:view
basedata:inspection-methods:create
basedata:inspection-methods:delete
basedata:inspection-methods:update
basedata:inspection-methods:view
basedata:inspectionmethods:view
basedata:material-sources:create
basedata:material-sources:delete
basedata:material-sources:update
basedata:material-sources:view
basedata:materialsources:view
basedata:materials:create
basedata:materials:delete
basedata:materials:export
basedata:materials:import
basedata:materials:update
basedata:materials:view
basedata:process-templates:create
basedata:process-templates:delete
basedata:process-templates:export
basedata:process-templates:update
basedata:process-templates:view
basedata:processtemplates:create
basedata:processtemplates:delete
basedata:processtemplates:export
basedata:processtemplates:update
basedata:processtemplates:view
basedata:product-categories:create
basedata:product-categories:delete
basedata:product-categories:update
basedata:product-categories:view
basedata:productcategories:create
basedata:productcategories:delete
basedata:productcategories:update
basedata:productcategories:view
basedata:suppliers:create
basedata:suppliers:delete
basedata:suppliers:export
basedata:suppliers:import
basedata:suppliers:update
basedata:suppliers:view
basedata:units:create
basedata:units:delete
basedata:units:export
basedata:units:update
basedata:units:view
finance:accounts:update
finance:cash:update
finance:closing:execute
finance:cost:export
finance:entries:approve
finance:overdue:notify
finance:periodEnd:execute
finance:periodEnd:view
finance:periods:create
finance:periods:update
finance:pricing:create
finance:pricing:delete
finance:pricing:export
finance:tax:update
hr:performance:edit
hr:performance:view
inventory:inbound:create
inventory:inbound:update
inventory:inbound:view
inventory:ledger:view
inventory:manual:create
inventory:manual:delete
inventory:manual:view
inventory:outbound:create
inventory:outbound:update
inventory:report:view
inventory:stock:adjust
inventory:stock:view
inventory:stock:view-detail
inventory:transactions:export
inventory:transactions:view
inventory:transfer:create
inventory:transfer:delete
inventory:transfer:export
inventory:transfer:view
production:equipment:create
production:equipment:delete
production:equipment:update
production:equipment:view
production:plans:create
production:plans:delete
production:plans:export
production:process:create
production:process:delete
production:process:view
production:reports:create
production:reports:delete
purchase:orders:create
purchase:receipts:create
purchase:receipts:update
purchase:receipts:view
purchase:requisitions:delete
purchase:requisitions:view
purchase:returns:create
purchase:returns:update
purchase:returns:view
quality:inspections:delete
quality:nonconforming:view
quality:reports:view
quality:settings:update
quality:settings:view
quality:templates:create
quality:templates:delete
quality:templates:view
quality:traceability:view
sales:orders:delete
sales:orders:export
sales:outbound:create
sales:outbound:delete
sales:outbound:update
sales:outbound:view
sales:packing:delete
sales:packing:update
sales:packing:view
sales:quotations:view
sales:returns:create
sales:returns:delete
sales:returns:view
system:files:delete
system:files:upload
`
  .trim()
  .split(/\s+/);

const PREFIX_PARENT_OVERRIDES = {
  'basedata:inspection-methods': 'basedata:productcategories',
  'basedata:inspectionmethods': 'basedata:productcategories',
  'basedata:material-sources': 'basedata:productcategories',
  'basedata:materialsources': 'basedata:productcategories',
  'basedata:process-templates': 'basedata:processtemplates',
  'basedata:product-categories': 'basedata:productcategories',
  'finance:overdue': 'finance:reports:view',
  'finance:periodEnd': 'finance:automation:view',
};

const EXACT_PARENT_OVERRIDES = {
  'system:files:delete': 'system',
  'system:files:upload': 'system',
};

const ACTION_SEGMENTS = new Set([
  'adjust',
  'approve',
  'create',
  'delete',
  'edit',
  'execute',
  'export',
  'import',
  'pay',
  'receive',
  'reconcile',
  'update',
  'view',
  'view-detail',
]);

async function firstMenu(trx, permission) {
  return trx('menus').where({ permission }).orderBy('id').first();
}

async function adminRoleIds(trx) {
  const rows = await trx('roles').select('id').where('code', 'admin').orWhere('id', 1);
  return rows.map((row) => row.id);
}

async function roleIdsWithMenu(trx, menuId) {
  if (!menuId) return [];
  const rows = await trx('role_menus').distinct('role_id').where({ menu_id: menuId });
  return rows.map((row) => row.role_id);
}

async function roleIdsWithAnyMenu(trx) {
  const rows = await trx('role_menus').distinct('role_id');
  return rows.map((row) => row.role_id);
}

async function grantMenuToRoles(trx, menuId, roleIds) {
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

function parentCandidates(permission) {
  const candidates = [];
  if (EXACT_PARENT_OVERRIDES[permission]) {
    candidates.push(EXACT_PARENT_OVERRIDES[permission]);
  }

  for (const [prefix, parentPermission] of Object.entries(PREFIX_PARENT_OVERRIDES)) {
    if (permission === prefix || permission.startsWith(`${prefix}:`)) {
      candidates.push(parentPermission);
    }
  }

  const parts = permission.split(':');
  const last = parts[parts.length - 1];
  if (ACTION_SEGMENTS.has(last) && parts.length > 1) {
    const base = parts.slice(0, -1).join(':');
    candidates.push(base);
    if (`${base}:view` !== permission) {
      candidates.push(`${base}:view`);
    }
  }

  for (let length = parts.length - 1; length >= 1; length -= 1) {
    candidates.push(parts.slice(0, length).join(':'));
  }

  return [...new Set(candidates.filter((candidate) => candidate && candidate !== permission))];
}

async function findParentMenu(trx, permission) {
  for (const candidate of parentCandidates(permission)) {
    const menu = await firstMenu(trx, candidate);
    if (menu) return menu;
  }
  return null;
}

function displayName(permission) {
  const parts = permission.split(':');
  return parts[parts.length - 1].replace(/-/g, ' ');
}

async function inheritedRoleIds(trx, parent, permission) {
  if (permission === 'system:files:upload') {
    return [...(await roleIdsWithAnyMenu(trx)), ...(await adminRoleIds(trx))];
  }
  if (permission === 'system:files:delete') {
    return adminRoleIds(trx);
  }
  if (!parent?.id) {
    return adminRoleIds(trx);
  }
  return [...(await roleIdsWithMenu(trx, parent.id)), ...(await adminRoleIds(trx))];
}

async function ensurePermissionMenu(trx, permission) {
  const existing = await firstMenu(trx, permission);
  if (existing) return existing.id;

  const parent = await findParentMenu(trx, permission);
  const [id] = await trx('menus').insert({
    parent_id: parent?.id || 0,
    name: displayName(permission),
    path: '',
    component: '',
    icon: '',
    permission,
    type: 2,
    visible: 1,
    status: 1,
    sort_order: 900,
    created_at: trx.fn.now(),
    updated_at: trx.fn.now(),
  });

  await grantMenuToRoles(trx, id, await inheritedRoleIds(trx, parent, permission));
  return id;
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    for (const permission of REQUIRED_PERMISSIONS) {
      await ensurePermissionMenu(trx, permission);
    }
  });
};

exports.down = async function down() {
  // Permission menu closure is data repair and is intentionally not rolled back.
};
