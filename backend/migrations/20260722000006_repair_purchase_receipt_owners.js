exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const before = await trx('purchase_receipts')
      .whereNull('created_by')
      .orWhere('created_by', 0)
      .count({ count: '*' })
      .first();

    await trx.raw(`
      UPDATE purchase_receipts pr
      LEFT JOIN quality_inspections qi ON qi.id = pr.inspection_id
      LEFT JOIN purchase_orders po ON po.id = pr.order_id
         SET pr.created_by = COALESCE(NULLIF(qi.inspector_id, 0), NULLIF(po.created_by, 0))
       WHERE pr.created_by IS NULL OR pr.created_by = 0
    `);

    const unresolved = await trx('purchase_receipts')
      .select('id', 'receipt_no')
      .whereNull('created_by')
      .orWhere('created_by', 0);
    if (unresolved.length) {
      throw new Error(
        `purchase_receipts 缺少可追溯责任人: ${unresolved.map((row) => row.receipt_no || row.id).join(', ')}`
      );
    }

    if (await trx.schema.hasTable('audit_logs')) {
      await trx('audit_logs').insert({
        module: 'purchase',
        action: 'update',
        entity_type: 'purchase_receipt_owner_repair',
        entity_id: '20260722000006',
        old_value: JSON.stringify({ missing_owner_count: Number(before?.count || 0) }),
        new_value: JSON.stringify({ unresolved_owner_count: 0 }),
        created_at: trx.fn.now(),
      });
    }
  });
};

exports.down = async function down() {
  // 责任人回填属于审计事实，不在回滚时清空。
};
