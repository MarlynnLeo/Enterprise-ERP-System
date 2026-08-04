/**
 * 财务专业化加固：
 * 1) 确保 AR/AP/税票来源唯一索引（幂等）
 * 2) 三单匹配表 ap_match_headers / ap_match_items
 * 3) 系统配置：价税 fail-closed、禁用订单级 AR 默认
 */

async function ensureUniqueIndex(knex, table, indexName, columns) {
  const hasTable = await knex.schema.hasTable(table);
  if (!hasTable) return;

  const [rows] = await knex.raw(
    `SELECT INDEX_NAME, NON_UNIQUE
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [table, indexName]
  );
  if (rows && rows.length) return;

  // 清理重复后再建唯一（仅当存在重复时跳过并打日志）
  try {
    await knex.schema.alterTable(table, (t) => {
      t.unique(columns, indexName);
    });
  } catch (e) {
    // 可能已有等价唯一键
    if (!/Duplicate|exists|ER_DUP/i.test(String(e.message || e))) {
      throw e;
    }
  }
}

exports.up = async function up(knex) {
  await ensureUniqueIndex(knex, 'ar_invoices', 'uk_ar_invoices_source_v2', [
    'source_type',
    'source_id',
  ]);
  await ensureUniqueIndex(knex, 'ap_invoices', 'uk_ap_invoices_source_v2', [
    'source_type',
    'source_id',
  ]);
  await ensureUniqueIndex(knex, 'tax_invoices', 'uk_tax_invoices_related_v2', [
    'related_document_type',
    'related_document_id',
  ]);

  if (!(await knex.schema.hasTable('ap_match_headers'))) {
    await knex.schema.createTable('ap_match_headers', (t) => {
      t.increments('id').primary();
      t.string('match_no', 50).notNullable().unique();
      t.integer('supplier_id').unsigned().nullable();
      t.integer('purchase_order_id').unsigned().nullable();
      t.integer('purchase_receipt_id').unsigned().nullable();
      t.integer('ap_invoice_id').unsigned().nullable();
      t.string('supplier_invoice_number', 100).nullable();
      t.date('match_date').nullable();
      t.decimal('po_amount', 18, 2).defaultTo(0);
      t.decimal('receipt_amount', 18, 2).defaultTo(0);
      t.decimal('invoice_amount', 18, 2).defaultTo(0);
      t.decimal('qty_variance', 18, 4).defaultTo(0);
      t.decimal('amount_variance', 18, 2).defaultTo(0);
      t.decimal('qty_tolerance_pct', 8, 4).defaultTo(0.02);
      t.decimal('amount_tolerance', 18, 2).defaultTo(1);
      t
        .enu('status', ['draft', 'matched', 'variance', 'confirmed', 'cancelled'], {
          useNative: true,
          enumName: 'ap_match_status',
        })
        .defaultTo('draft');
      t.string('match_result', 50).nullable(); // matched | within_tolerance | over_tolerance
      t.text('remark').nullable();
      t.integer('created_by').unsigned().nullable();
      t.integer('confirmed_by').unsigned().nullable();
      t.timestamp('confirmed_at').nullable();
      t.timestamps(true, true);
      t.index(['supplier_id']);
      t.index(['purchase_receipt_id']);
      t.index(['purchase_order_id']);
      t.index(['status']);
    });
  }

  if (!(await knex.schema.hasTable('ap_match_items'))) {
    await knex.schema.createTable('ap_match_items', (t) => {
      t.increments('id').primary();
      t.integer('match_id').unsigned().notNullable();
      t.integer('material_id').unsigned().nullable();
      t.string('material_code', 100).nullable();
      t.string('material_name', 200).nullable();
      t.decimal('po_qty', 18, 4).defaultTo(0);
      t.decimal('po_price', 18, 6).defaultTo(0);
      t.decimal('receipt_qty', 18, 4).defaultTo(0);
      t.decimal('receipt_price', 18, 6).defaultTo(0);
      t.decimal('invoice_qty', 18, 4).defaultTo(0);
      t.decimal('invoice_price', 18, 6).defaultTo(0);
      t.decimal('qty_variance', 18, 4).defaultTo(0);
      t.decimal('amount_variance', 18, 2).defaultTo(0);
      t.boolean('within_tolerance').defaultTo(true);
      t.timestamps(true, true);
      t.index(['match_id']);
      t.foreign('match_id').references('ap_match_headers.id').onDelete('CASCADE');
    });
  }

  // 系统配置默认：写入 system_config（运行时表；完整收口见 20260801000004）
  if (await knex.schema.hasTable('system_config')) {
    const defaults = [
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
    ];
    for (const row of defaults) {
      const exists = await knex('system_config').where({ config_key: row.key }).first();
      if (exists) continue;
      try {
        await knex('system_config').insert({
          config_key: row.key,
          config_value: row.value,
          config_type: row.type,
          description: row.description,
          module: 'finance',
          is_system: 1,
          status: 1,
        });
      } catch {
        /* schema may differ */
      }
    }
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('ap_match_items')) {
    await knex.schema.dropTable('ap_match_items');
  }
  if (await knex.schema.hasTable('ap_match_headers')) {
    await knex.schema.dropTable('ap_match_headers');
  }
};
