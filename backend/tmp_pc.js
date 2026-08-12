const mysql = require('mysql2/promise');
const fs = require('fs');
(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.1.251', user: 'root', password: 'mysql_n3cEDY', database: 'mes'
  });
  const [tables] = await conn.query("SHOW TABLES LIKE '%product%'");
  console.log('PRODUCT_TABLES', tables);
  const [t2] = await conn.query("SHOW TABLES LIKE '%categor%'");
  console.log('CAT_TABLES', t2);
  // check if product_categories exists
  try {
    const [pc] = await conn.query('SELECT COUNT(*) cnt FROM product_categories');
    console.log('PRODUCT_CATEGORIES_COUNT', pc);
    const [pcs] = await conn.query('SELECT * FROM product_categories ORDER BY id LIMIT 20');
    console.log('PC_SAMPLE', JSON.stringify(pcs, null, 2));
  } catch(e) { console.log('NO_PRODUCT_CATEGORIES', e.message); }
  // materials product_category_id null count
  const [nullPc] = await conn.query(`
    SELECT SUM(product_category_id IS NULL) null_pc, SUM(product_category_id IS NOT NULL) has_pc, COUNT(*) total
    FROM materials WHERE deleted_at IS NULL
  `);
  console.log('PC_STATS', nullPc);
  // category name samples that look numeric in material list join
  const [apiLike] = await conn.query(`
    SELECT m.code, m.name, m.category_id, c.code cat_code, c.name category_name,
           m.product_category_id
    FROM materials m
    LEFT JOIN categories c ON m.category_id = c.id
    WHERE m.code LIKE '100601%'
    LIMIT 5
  `);
  console.log('API_LIKE', JSON.stringify(apiLike, null, 2));
  await conn.end();
})().catch(e=>{console.error(e); process.exit(1)});
