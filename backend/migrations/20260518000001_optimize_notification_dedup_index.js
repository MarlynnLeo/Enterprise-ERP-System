exports.up = async function up(knex) {
  const hasNotifications = await knex.schema.hasTable('notifications');
  if (!hasNotifications) return;

  await knex.raw(`
    DELETE n1
    FROM notifications n1
    JOIN notifications n2
      ON n1.user_id = n2.user_id
     AND n1.type = n2.type
     AND n1.title = n2.title
     AND DATE(n1.created_at) = DATE(n2.created_at)
     AND n1.id < n2.id
    WHERE n1.source_type IS NULL
      AND n1.type IN (
        'business_alert',
        'inventory_alert',
        'batch_expiry',
        'finance_auto',
        'finance_error',
        'purchase_return'
      )
  `);

  const indexes = await knex.raw('SHOW INDEX FROM notifications');
  const rows = Array.isArray(indexes) ? indexes[0] : indexes;
  const exists = rows.some((row) => row.Key_name === 'idx_notifications_source_user_created');

  if (!exists) {
    await knex.schema.alterTable('notifications', (table) => {
      table.index(
        ['source_type', 'source_id', 'user_id', 'created_at'],
        'idx_notifications_source_user_created'
      );
    });
  }
};

exports.down = async function down(knex) {
  const hasNotifications = await knex.schema.hasTable('notifications');
  if (!hasNotifications) return;

  const indexes = await knex.raw('SHOW INDEX FROM notifications');
  const rows = Array.isArray(indexes) ? indexes[0] : indexes;
  const exists = rows.some((row) => row.Key_name === 'idx_notifications_source_user_created');

  if (exists) {
    await knex.schema.alterTable('notifications', (table) => {
      table.dropIndex(
        ['source_type', 'source_id', 'user_id', 'created_at'],
        'idx_notifications_source_user_created'
      );
    });
  }
};
