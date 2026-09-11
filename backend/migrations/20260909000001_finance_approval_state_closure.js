'use strict';

const RoleAccessService = require('../src/services/RoleAccessService');

async function addColumnIfMissing(knex, tableName, columnName, callback) {
  if (!(await knex.schema.hasTable(tableName))) return;
  if (await knex.schema.hasColumn(tableName, columnName)) return;
  await knex.schema.alterTable(tableName, callback);
}

async function ensurePermission(knex, code, name) {
  const existing = await knex('permissions').where({ code }).first('id');
  if (existing) return existing.id;
  const [id] = await knex('permissions').insert({
    code,
    name,
    module: 'finance',
    status: 1,
    source: 'migration',
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

async function ensureInventoryWorkbenchMenu(knex) {
  if (!(await knex.schema.hasTable('menus'))) return;
  const financeRoot = await knex('menus').where({ path: '/finance' }).first('id');
  if (!financeRoot) return;

  const viewPermissionId = await ensurePermission(
    knex,
    'finance:inventory:view',
    '库存过账审核查看'
  );
  const approvePermissionId = await ensurePermission(
    knex,
    'finance:inventory:approve',
    '库存过账审核'
  );
  const reversePermissionId = await ensurePermission(
    knex,
    'finance:inventory:reverse',
    '库存过账反审核'
  );

  const values = {
    parent_id: financeRoot.id,
    name: '库存过账审核',
    path: '/finance/inventory-posting',
    component: 'finance/inventory/InventoryPostingApproval',
    icon: 'Stamp',
    permission: 'finance:inventory:view',
    permission_id: viewPermissionId,
    type: 1,
    visible: 1,
    status: 1,
    sort_order: 18,
    updated_at: knex.fn.now(),
  };
  let menu = await knex('menus').where({ path: values.path }).first('id');
  if (menu) {
    await knex('menus').where({ id: menu.id }).update(values);
  } else {
    const [id] = await knex('menus').insert({ ...values, created_at: knex.fn.now() });
    menu = { id };
  }

  for (const [permission, permissionId, name, sortOrder] of [
    ['finance:inventory:approve', approvePermissionId, '审核过账', 901],
    ['finance:inventory:reverse', reversePermissionId, '反审核冲销', 902],
  ]) {
    const action = await knex('menus').where({ permission, type: 2 }).first('id');
    const actionValues = {
      parent_id: menu.id,
      name,
      path: '',
      component: '',
      icon: '',
      permission,
      permission_id: permissionId,
      type: 2,
      visible: 1,
      status: 1,
      sort_order: sortOrder,
      updated_at: knex.fn.now(),
    };
    if (action) await knex('menus').where({ id: action.id }).update(actionValues);
    else await knex('menus').insert({ ...actionValues, created_at: knex.fn.now() });
  }
}

exports.up = async function up(knex) {
  for (const table of ['ap_invoices', 'ar_invoices']) {
    await addColumnIfMissing(knex, table, 'approved_by', (t) => {
      t.bigInteger('approved_by').unsigned().nullable();
    });
    await addColumnIfMissing(knex, table, 'approved_at', (t) => {
      t.dateTime('approved_at').nullable();
    });
  }

  await addColumnIfMissing(knex, 'hr_salary_records', 'calculated_by', (t) => {
    t.bigInteger('calculated_by').unsigned().nullable();
  });
  await addColumnIfMissing(knex, 'hr_salary_records', 'calculated_at', (t) => {
    t.dateTime('calculated_at').nullable();
  });
  await addColumnIfMissing(knex, 'hr_salary_records', 'approved_by', (t) => {
    t.bigInteger('approved_by').unsigned().nullable();
  });
  await addColumnIfMissing(knex, 'hr_salary_records', 'approved_at', (t) => {
    t.dateTime('approved_at').nullable();
  });

  await addColumnIfMissing(knex, 'ap_payments', 'approval_id', (t) => {
    t.bigInteger('approval_id').unsigned().nullable();
  });

  if (await knex.schema.hasTable('finance_payment_approvals')) {
    await addColumnIfMissing(knex, 'finance_payment_approvals', 'status', (t) => {
      t.string('status', 24).notNullable().defaultTo('pending');
    });
    await addColumnIfMissing(knex, 'finance_payment_approvals', 'payment_id', (t) => {
      t.bigInteger('payment_id').unsigned().nullable();
    });
    await addColumnIfMissing(knex, 'finance_payment_approvals', 'supplier_id', (t) => {
      t.bigInteger('supplier_id').unsigned().nullable();
    });
    await addColumnIfMissing(knex, 'finance_payment_approvals', 'invoice_id', (t) => {
      t.bigInteger('invoice_id').unsigned().nullable();
    });
    await addColumnIfMissing(knex, 'finance_payment_approvals', 'invoice_ids', (t) => {
      t.json('invoice_ids').nullable();
    });
    await addColumnIfMissing(knex, 'finance_payment_approvals', 'approved_at', (t) => {
      t.dateTime('approved_at').nullable();
    });
    await addColumnIfMissing(knex, 'finance_payment_approvals', 'created_by', (t) => {
      t.bigInteger('created_by').unsigned().nullable();
    });
    await addColumnIfMissing(knex, 'finance_payment_approvals', 'used_at', (t) => {
      t.dateTime('used_at').nullable();
    });
    try {
      await knex.raw(
        'CREATE INDEX idx_finance_payment_approvals_status ON finance_payment_approvals (status, used_at)'
      );
    } catch {
      // The index already exists on an upgraded database.
    }
  }

  if (!(await knex.schema.hasTable('fund_transfer_requests'))) {
    await knex.schema.createTable('fund_transfer_requests', (t) => {
      t.bigIncrements('id').primary();
      t.string('transaction_number', 100).notNullable().unique();
      t.bigInteger('from_account_id').unsigned().notNullable();
      t.bigInteger('to_account_id').unsigned().notNullable();
      t.decimal('amount', 18, 2).notNullable();
      t.date('transaction_date').notNullable();
      t.string('reference_number', 100).nullable();
      t.string('description', 500).nullable();
      t.string('status', 24).notNullable().defaultTo('pending');
      t.bigInteger('created_by').unsigned().notNullable();
      t.bigInteger('approved_by').unsigned().nullable();
      t.dateTime('approved_at').nullable();
      t.string('reject_reason', 500).nullable();
      t.bigInteger('from_transaction_id').unsigned().nullable();
      t.bigInteger('to_transaction_id').unsigned().nullable();
      t.bigInteger('gl_entry_id').unsigned().nullable();
      t.timestamps(true, true);
      t.index(['status', 'transaction_date']);
    });
  }

  for (const [code, name] of [
    ['finance:ap:approve', '应付发票财务审核'],
    ['finance:ar:approve', '应收发票财务审核'],
    ['finance:salary:approve', '工资财务审核'],
  ]) {
    await ensurePermission(knex, code, name);
  }
  await ensureInventoryWorkbenchMenu(knex);
  await RoleAccessService.applyAllWithKnex(knex);
};

exports.down = async function down() {
  // Forward-only control migration. Approval evidence and posted documents
  // must remain available for audit after a rollback of application code.
};
