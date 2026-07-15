function q(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function tableExists(knex, tableName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?`,
    [tableName]
  );
  return Number(rows[0].cnt) > 0;
}

exports.up = async function up(knex) {
  if (
    !(await tableExists(knex, 'inventory_stock_balances')) ||
    !(await tableExists(knex, 'inventory_ledger'))
  ) {
    return;
  }

  await knex.raw(`
    INSERT INTO inventory_stock_balances (
      material_id, location_id, batch_number, quantity, unit_cost, total_value,
      version, last_ledger_id, created_at, updated_at
    )
    SELECT
      material_id,
      location_id,
      batch_key AS batch_number,
      SUM(COALESCE(quantity, 0)) AS quantity,
      CASE
        WHEN ABS(SUM(COALESCE(quantity, 0))) > 0.000001
          THEN ABS(SUM(signed_total_value) / SUM(COALESCE(quantity, 0)))
        ELSE NULL
      END AS unit_cost,
      SUM(signed_total_value) AS total_value,
      1 AS version,
      MAX(id) AS last_ledger_id,
      NOW(),
      NOW()
    FROM (
      SELECT id,
             material_id,
             location_id,
             COALESCE(NULLIF(batch_number, ''), '') COLLATE utf8mb4_unicode_ci AS batch_key,
             quantity,
             CASE
               WHEN COALESCE(quantity, 0) < 0 THEN -ABS(COALESCE(total_value, 0))
               ELSE ABS(COALESCE(total_value, 0))
             END AS signed_total_value
        FROM inventory_ledger
       WHERE material_id IS NOT NULL
         AND location_id IS NOT NULL
    ) ledger_source
    GROUP BY material_id, location_id, batch_key
    ON DUPLICATE KEY UPDATE
      quantity = VALUES(quantity),
      unit_cost = VALUES(unit_cost),
      total_value = VALUES(total_value),
      version = version + 1,
      last_ledger_id = VALUES(last_ledger_id),
      updated_at = NOW()
  `);

  await knex.raw(`
    UPDATE ${q('inventory_stock_balances')} b
    LEFT JOIN (
      SELECT material_id,
             location_id,
             batch_key
      FROM (
        SELECT material_id,
               location_id,
               COALESCE(NULLIF(batch_number, ''), '') COLLATE utf8mb4_unicode_ci AS batch_key
          FROM ${q('inventory_ledger')}
         WHERE material_id IS NOT NULL
           AND location_id IS NOT NULL
      ) ledger_source
      GROUP BY material_id, location_id, batch_key
    ) l
      ON l.material_id = b.material_id
     AND l.location_id = b.location_id
     AND l.batch_key = b.batch_number COLLATE utf8mb4_unicode_ci
       SET b.quantity = 0,
           b.unit_cost = NULL,
           b.total_value = 0,
           b.version = b.version + 1,
           b.last_ledger_id = NULL,
           b.updated_at = NOW()
     WHERE l.material_id IS NULL
       AND (
         ABS(COALESCE(b.quantity, 0)) > 0.000001
         OR ABS(COALESCE(b.total_value, 0)) > 0.05
         OR b.unit_cost IS NOT NULL
         OR b.last_ledger_id IS NOT NULL
       )
  `);
};

exports.down = async function down() {
  // Data repair migration; historical balances cannot be reconstructed safely.
};
