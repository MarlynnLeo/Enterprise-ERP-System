const mysql = require('mysql2/promise');
const sql = require('mssql');
(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.1.251', user: 'root', password: 'mysql_n3cEDY', database: 'mes'
  });
  const [mcols] = await conn.query('DESCRIBE materials');
  console.log('MAT_COLS', mcols.map(c => c.Field).join(','));
  const [sampleMat] = await conn.query(`
    SELECT m.id, m.code, m.name, m.category_id, m.material_type, m.type, m.source_id, m.unit_id
    FROM materials m WHERE m.code IN ('100601001','100104001','3001002002','199908001','4017001') LIMIT 20
  `);
  console.log('SAMPLE_MAT', JSON.stringify(sampleMat, null, 2));
  // any materials whose category code/name looks like 100601 specifically
  const [c100601] = await conn.query(`SELECT * FROM categories WHERE code='100601' OR name='100601'`);
  console.log('CAT100601', JSON.stringify(c100601, null, 2));
  const [mats100601] = await conn.query(`
    SELECT m.code, m.name, c.code cat_code, c.name cat_name
    FROM materials m JOIN categories c ON c.id=m.category_id
    WHERE c.code='100601' OR c.name='100601' LIMIT 10
  `);
  console.log('MATS_ON_100601', JSON.stringify(mats100601, null, 2));
  // materials with numeric category, sample
  const [badMats] = await conn.query(`
    SELECT m.code, m.name, c.code cat_code, c.name cat_name
    FROM materials m JOIN categories c ON c.id=m.category_id
    WHERE c.name REGEXP '^[0-9]+$'
    ORDER BY c.code, m.code LIMIT 30
  `);
  console.log('BAD_MATS', JSON.stringify(badMats, null, 2));
  // parent names of numeric cats
  const [parents] = await conn.query(`
    SELECT c.code, c.name, p.code parent_code, p.name parent_name, gp.name grand_name
    FROM categories c
    LEFT JOIN categories p ON p.id=c.parent_id
    LEFT JOIN categories gp ON gp.id=p.parent_id
    WHERE c.name REGEXP '^[0-9]+$'
    ORDER BY c.code
  `);
  console.log('PARENTS', JSON.stringify(parents, null, 2));
  await conn.end();

  // NG side
  await sql.connect({
    server: '192.168.1.184\\NG',
    database: 'NG0001',
    user: 'sa',
    password: '12345',
    options: { encrypt: false, trustServerCertificate: true }
  });
  const ng = await sql.query`
    SELECT TOP 50 prdclass, prdname, itemtype
    FROM prdclass
    WHERE prdclass IN ('100601','2001','2002','2003','3001','3002','4001','4017','199901','199908','199911','2003011')
       OR prdclass LIKE '3001%' OR prdclass LIKE '2003%' OR prdclass LIKE '1999%'
    ORDER BY prdclass
  `;
  console.log('NG_PRDCLASS', JSON.stringify(ng.recordset, null, 2));
  const ng2 = await sql.query`
    SELECT TOP 5 itemno, itemname, prdclass FROM itemdata WHERE prdclass='100601' OR itemno LIKE '100601%'
  `;
  console.log('NG_ITEMS_100601', JSON.stringify(ng2.recordset, null, 2));
  // check if prdclass has name for intermediate nodes
  const ng3 = await sql.query`
    SELECT prdclass, RTRIM(prdname) prdname, itemtype
    FROM prdclass
    WHERE prdclass IN ('2001','2002','2003','3001','3002','3003','4001','4017','199901','199908','199911')
  `;
  console.log('NG_MISSING', JSON.stringify(ng3.recordset, null, 2));
  // itemtype names
  const ng4 = await sql.query`SELECT * FROM itemtype`;
  console.log('NG_ITEMTYPE', JSON.stringify(ng4.recordset, null, 2));
  await sql.close();
})().catch(e => { console.error(e); process.exit(1); });
