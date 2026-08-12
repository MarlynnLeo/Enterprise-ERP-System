const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.1.251', user: 'root', password: 'mysql_n3cEDY', database: 'mes'
  });
  // children summary for all numeric cats
  const [rows] = await conn.query(`
    SELECT p.code parent_code, p.name parent_name,
           c.code child_code, c.name child_name,
           (SELECT COUNT(*) FROM materials m WHERE m.category_id = c.id) mat_cnt
    FROM categories p
    LEFT JOIN categories c ON c.parent_id = p.id
    WHERE p.name REGEXP '^[0-9]+$'
    ORDER BY p.code, c.code
  `);
  const by = {};
  for (const r of rows) {
    if (!by[r.parent_code]) by[r.parent_code] = { name: r.parent_name, children: [], mats: 0 };
    if (r.child_code) by[r.parent_code].children.push({ code: r.child_code, name: r.child_name, mats: r.mat_cnt });
  }
  // also direct materials names for leaf numeric
  const [dm] = await conn.query(`
    SELECT c.code, m.name, COUNT(*) cnt
    FROM categories c
    JOIN materials m ON m.category_id = c.id
    WHERE c.name REGEXP '^[0-9]+$'
    GROUP BY c.code, m.name
    ORDER BY c.code, cnt DESC
  `);
  const direct = {};
  for (const r of dm) {
    if (!direct[r.code]) direct[r.code] = [];
    if (direct[r.code].length < 5) direct[r.code].push({ name: r.name, cnt: r.cnt });
  }
  console.log(JSON.stringify({ by, direct }, null, 2));
  await conn.end();
})().catch(e=>{console.error(e); process.exit(1)});
