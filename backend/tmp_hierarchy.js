const mysql = require('mysql2/promise');
const sql = require('mssql');
(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.1.251', user: 'root', password: 'mysql_n3cEDY', database: 'mes'
  });
  // full path for sample materials
  async function pathOf(catId) {
    const path = [];
    let id = catId;
    for (let i=0;i<10 && id;i++) {
      const [rows] = await conn.query('SELECT id, parent_id, code, name, level FROM categories WHERE id=?', [id]);
      if (!rows[0]) break;
      path.unshift(rows[0]);
      id = rows[0].parent_id;
    }
    return path;
  }
  const [mats] = await conn.query("SELECT id, code, name, category_id, product_category_id FROM materials WHERE code IN ('100601001','100104001','3001002002','200301001','4017001','199908001') OR code LIKE '4017%' LIMIT 10");
  for (const m of mats) {
    console.log('MAT', m.code, m.name, 'cat', m.category_id, 'pc', m.product_category_id);
    console.log('PATH', JSON.stringify(await pathOf(m.category_id)));
  }
  // level distribution
  const [levels] = await conn.query('SELECT level, COUNT(*) cnt FROM categories GROUP BY level ORDER BY level');
  console.log('LEVELS', levels);
  // roots
  const [roots] = await conn.query('SELECT id, code, name, level FROM categories WHERE parent_id IS NULL OR parent_id=0 ORDER BY code');
  console.log('ROOTS', JSON.stringify(roots, null, 2));
  // children of roots
  const [l2] = await conn.query(`
    SELECT c.id, c.code, c.name, c.level, p.name parent
    FROM categories c LEFT JOIN categories p ON p.id=c.parent_id
    WHERE c.level=2 OR (p.parent_id IS NULL OR p.parent_id=0)
    ORDER BY c.code LIMIT 50
  `);
  console.log('L2', JSON.stringify(l2, null, 2));
  // how many categories have numeric names among all, and materials under good named cats
  const [good] = await conn.query(`
    SELECT COUNT(*) total,
      SUM(c.name NOT REGEXP '^[0-9]+$') good_name,
      SUM(c.name REGEXP '^[0-9]+$') num_name
    FROM materials m JOIN categories c ON c.id=m.category_id
  `);
  console.log('MAT_CAT_QUALITY', good);

  // For numeric parents, get first non-numeric child names summary
  const [numParents] = await conn.query(`
    SELECT p.id, p.code, p.name,
      (SELECT GROUP_CONCAT(c.name ORDER BY c.code SEPARATOR ' / ')
       FROM categories c WHERE c.parent_id=p.id AND c.name NOT REGEXP '^[0-9]+$' LIMIT 5) child_names,
      (SELECT COUNT(*) FROM categories c WHERE c.parent_id=p.id) child_count,
      (SELECT COUNT(*) FROM materials m WHERE m.category_id=p.id) direct_mats
    FROM categories p
    WHERE p.name REGEXP '^[0-9]+$'
    ORDER BY p.code
  `);
  // MySQL may not allow LIMIT in subquery with GROUP_CONCAT that way - check
  console.log('NUM_PARENT_SUMMARY_COUNT', numParents.length);
  for (const row of numParents.slice(0,10)) console.log(JSON.stringify(row));

  await conn.end();

  // NG: look for better names in em_prdsort / itemclass / fg_pclass
  await sql.connect({
    server: '192.168.1.184\\NG', database: 'NG0001', user: 'sa', password: '12345',
    options: { encrypt: false, trustServerCertificate: true }
  });
  for (const t of ['em_prdsort','itemclass','fg_pclass','prdclass']) {
    const cols = await sql.query`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=${t} ORDER BY ORDINAL_POSITION`;
    console.log('COLS', t, cols.recordset.map(r=>r.COLUMN_NAME).join(','));
  }
  const prdsort = await sql.query`SELECT TOP 20 * FROM em_prdsort`;
  console.log('EM_PRDSORT', JSON.stringify(prdsort.recordset, null, 2));
  const itemclass = await sql.query`SELECT TOP 20 * FROM itemclass`;
  console.log('ITEMCLASS', JSON.stringify(itemclass.recordset, null, 2));
  // any table with names for 3001 plastic etc
  const probe = await sql.query`
    SELECT TOP 5 * FROM prdclass WHERE prdname NOT LIKE '[0-9]%' AND (prdclass LIKE '3%' OR prdclass LIKE '2%' OR prdclass LIKE '4%')
    ORDER BY prdclass
  `;
  console.log('NAMED_PRD', JSON.stringify(probe.recordset.slice(0,15), null, 2));
  await sql.close();
})().catch(e=>{console.error(e); process.exit(1)});
