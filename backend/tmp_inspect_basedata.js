const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || '192.168.1.251',
    port: 3306,
    user: 'root',
    password: 'mysql_n3cEDY',
    database: 'mes',
  });
  const [tables] = await c.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='mes' AND TABLE_NAME IN ('materials','customers','suppliers','units','boms','bom_items','locations','warehouses','product_categories','categories','process_templates','material_sources','inspection_methods') ORDER BY TABLE_NAME");
  console.log('tables', tables.map(t => t.TABLE_NAME));
  for (const t of tables) {
    const [[cnt]] = await c.query('SELECT COUNT(*) AS c FROM `' + t.TABLE_NAME + '`');
    console.log(t.TABLE_NAME, cnt.c);
  }
  const [cols] = await c.query("SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='mes' AND TABLE_NAME IN ('materials','customers','suppliers','units','boms','locations','product_categories') ORDER BY TABLE_NAME, ORDINAL_POSITION");
  console.log(JSON.stringify(cols, null, 2));
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
