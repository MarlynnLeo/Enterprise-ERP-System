/**
 * DataScope 上下游闭环 — 补齐 owner 字段与历史回填
 *
 * 1. production_tasks.created_by
 * 2. inventory_inbound.created_by 回填（list 已依赖，create 将写入）
 * 3. purchase_orders 自动单历史 created_by 尽量回填
 */

async function ensureColumn(knex, table, column, builder) {
  const has = await knex.schema.hasColumn(table, column);
  if (!has) {
    await knex.schema.alterTable(table, builder);
  }
}

exports.up = async function up(knex) {
  // --- production_tasks.created_by ---
  await ensureColumn(knex, 'production_tasks', 'created_by', (t) => {
    t.integer('created_by').nullable().comment('Creator user id for data-scope authorization');
  });

  // manager 常为姓名/用户名：尽量回填
  try {
    await knex.raw(`
      UPDATE production_tasks t
      INNER JOIN users u ON (
        BINARY u.username = BINARY t.manager OR BINARY u.real_name = BINARY t.manager
      )
      SET t.created_by = u.id
      WHERE t.created_by IS NULL
        AND t.manager IS NOT NULL
        AND t.manager <> ''
        AND t.manager <> '未分配'
    `);
  } catch (e) {
    console.warn('[20260710000004] backfill production_tasks.created_by:', e.message);
  }

  // --- inventory_inbound.created_by 回填 ---
  try {
    const has = await knex.schema.hasColumn('inventory_inbound', 'created_by');
    if (has) {
      await knex.raw(`
        UPDATE inventory_inbound i
        INNER JOIN users u ON BINARY u.username = BINARY i.operator
        SET i.created_by = u.id
        WHERE i.created_by IS NULL
          AND i.operator IS NOT NULL
          AND i.operator <> ''
          AND i.operator <> 'system'
      `);
    }
  } catch (e) {
    console.warn('[20260710000004] backfill inventory_inbound.created_by:', e.message);
  }

  // --- purchase_orders：从申请单申请人回填缺失 created_by ---
  try {
    const hasCreatedBy = await knex.schema.hasColumn('purchase_orders', 'created_by');
    const hasReq = await knex.schema.hasTable('purchase_requisitions');
    if (hasCreatedBy && hasReq) {
      const hasRequester = await knex.schema.hasColumn('purchase_requisitions', 'requester_id');
      const hasCreated = await knex.schema.hasColumn('purchase_requisitions', 'created_by');
      if (hasRequester) {
        await knex.raw(`
          UPDATE purchase_orders po
          INNER JOIN purchase_requisitions pr ON pr.id = po.requisition_id
          SET po.created_by = pr.requester_id
          WHERE po.created_by IS NULL AND pr.requester_id IS NOT NULL
        `);
      } else if (hasCreated) {
        // 若 created_by 是 int
        await knex.raw(`
          UPDATE purchase_orders po
          INNER JOIN purchase_requisitions pr ON pr.id = po.requisition_id
          INNER JOIN users u ON u.id = pr.created_by
          SET po.created_by = pr.created_by
          WHERE po.created_by IS NULL AND pr.created_by IS NOT NULL
        `).catch(async () => {
          // created_by 可能是 username
          await knex.raw(`
            UPDATE purchase_orders po
            INNER JOIN purchase_requisitions pr ON pr.id = po.requisition_id
            INNER JOIN users u ON BINARY u.username = BINARY pr.created_by
            SET po.created_by = u.id
            WHERE po.created_by IS NULL AND pr.created_by IS NOT NULL AND pr.created_by <> ''
          `);
        });
      }
    }
  } catch (e) {
    console.warn('[20260710000004] backfill purchase_orders.created_by:', e.message);
  }
};

exports.down = async function down(knex) {
  const has = await knex.schema.hasColumn('production_tasks', 'created_by');
  if (has) {
    await knex.schema.alterTable('production_tasks', (t) => {
      t.dropColumn('created_by');
    });
  }
};
