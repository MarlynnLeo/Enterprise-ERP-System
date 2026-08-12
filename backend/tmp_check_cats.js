const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.1.251',
    user: 'root',
    password: 'mysql_n3cEDY',
    database: 'mes'
  });
  const [cols] = await conn.query('DESCRIBE categories');
  console.log('COLS', cols.map(c => c.Field).join(','));
  const [numCats] = await conn.query("SELECT id, code, name, parent_id, level FROM categories WHERE name REGEXP '^[0-9]+$' ORDER BY code");
  console.log('NUMERIC_CATS', numCats.length);
  console.log(JSON.stringify(numCats, null, 2));
  const [samples] = await conn.query(`
    SELECT m.code, m.name, c.code AS cat_code, c.name AS cat_name, p.name AS parent_name
    FROM materials m
    LEFT JOIN categories c ON c.id = m.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    WHERE m.code IN ('100601001','100104001','3001002002')
    ORDER BY m.code
  `);
  console.log('SAMPLES', JSON.stringify(samples, null, 2));
  const [stats] = await conn.query(`
    SELECT
      COUNT(*) AS total_materials,
      SUM(CASE WHEN m.category_id IS NULL THEN 1 ELSE 0 END) AS no_category,
      SUM(CASE WHEN c.name REGEXP '^[0-9]+$' THEN 1 ELSE 0 END) AS materials_with_numeric_cat
    FROM materials m
    LEFT JOIN categories c ON c.id = m.category_id
  `);
  console.log('STATS', JSON.stringify(stats, null, 2));
  const [matOnNum] = await conn.query(`
    SELECT c.code, c.name, COUNT(m.id) AS mat_count
    FROM categories c
    LEFT JOIN materials m ON m.category_id = c.id
    WHERE c.name REGEXP '^[0-9]+$'
    GROUP BY c.id
    ORDER BY mat_count DESC, c.code
  `);
  console.log('MAT_ON_NUM', JSON.stringify(matOnNum, null, 2));
  await conn.end();
})().catch(e => { console.error(e); process.exit(1); });
