const mysql = require('mysql2/promise');
const sql = require('mssql');
(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.1.251', user: 'root', password: 'mysql_n3cEDY', database: 'mes'
  });
  const [sampleMat] = await conn.query(`
    SELECT m.id, m.code, m.name, m.category_id, m.product_category_id, m.material_type, m.material_source_id, m.unit_id
    FROM materials m WHERE m.code IN ('100601001','100104001','3001002002')
  `);
  console.log('SAMPLE_MAT', JSON.stringify(sampleMat, null, 2));
  const [c100601] = await conn.query(`SELECT * FROM categories WHERE code='100601' OR name LIKE '%100601%'`);
  console.log('CAT100601', JSON.stringify(c100601, null, 2));
  const [pcats] = await conn.query(`SHOW TABLES LIKE '%product_categor%'`);
  console.log('PCAT_TABLES', JSON.stringify(pcats));
  const [allTables] = await conn.query(`SHOW TABLES`);
  console.log('TABLES_CAT', allTables.map(r => Object.values(r)[0]).filter(t => /cat|class|type|material/i.test(t)).join(','));
  // materials with numeric category sample
  const [badMats] = await conn.query(`
    SELECT m.code, m.name, c.code cat_code, c.name cat_name, m.material_type, m.product_category_id
    FROM materials m JOIN categories c ON c.id=m.category_id
    WHERE c.name REGEXP '^[0-9]+$'
    ORDER BY c.code, m.code LIMIT 20
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
  // material_type distribution
  const [mt] = await conn.query(`SELECT material_type, COUNT(*) cnt FROM materials GROUP BY material_type ORDER BY cnt DESC LIMIT 20`);
  console.log('MATERIAL_TYPE_DIST', JSON.stringify(mt, null, 2));
  await conn.end();

  await sql.connect({
    server: '192.168.1.184\\NG',
    database: 'NG0001',
    user: 'sa',
    password: '12345',
    options: { encrypt: false, trustServerCertificate: true }
  });
  const ng = await sql.query`
    SELECT prdclass, RTRIM(prdname) prdname, itemtype
    FROM prdclass
    WHERE prdclass IN ('100601','2001','2002','2003','3001','3002','4001','4017','199901','199908','199911','2003011')
    ORDER BY prdclass
  `;
  console.log('NG_SPECIFIC', JSON.stringify(ng.recordset, null, 2));
  const ng2 = await sql.query`
    SELECT TOP 10 itemno, RTRIM(itemname) itemname, RTRIM(prdclass) prdclass FROM itemdata WHERE itemno LIKE '100601%' OR prdclass='100601'
  `;
  console.log('NG_ITEMS_100601', JSON.stringify(ng2.recordset, null, 2));
  const ng3 = await sql.query`SELECT * FROM itemtype`;
  console.log('NG_ITEMTYPE', JSON.stringify(ng3.recordset, null, 2));
  // look for related naming tables
  const tables = await sql.query`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'
    AND (TABLE_NAME LIKE '%class%' OR TABLE_NAME LIKE '%type%' OR TABLE_NAME LIKE '%prd%' OR TABLE_NAME LIKE '%item%')
    ORDER BY TABLE_NAME
  `;
  console.log('NG_TABLES', tables.recordset.map(r => r.TABLE_NAME).join(','));
  // children names under numeric parents for inference
  const kids = await sql.query`
    SELECT parent.prdclass parent_code, RTRIM(parent.prdname) parent_name,
           child.prdclass child_code, RTRIM(child.prdname) child_name
    FROM prdclass parent
    LEFT JOIN prdclass child ON child.prdclass LIKE parent.prdclass + '%' AND child.prdclass <> parent.prdclass
    WHERE parent.prdclass IN ('2001','2002','2003','3001','3002','3003','4001','4017','199901','199908')
    ORDER BY parent.prdclass, child.prdclass
  `;
  console.log('NG_KIDS', JSON.stringify(kids.recordset.slice(0,80), null, 2));
  console.log('NG_KIDS_COUNT', kids.recordset.length);
  await sql.close();
})().catch(e => { console.error(e); process.exit(1); });
