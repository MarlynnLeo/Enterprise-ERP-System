const mysql = require('mysql2/promise');
const sql = require('mssql');
(async () => {
  await sql.connect({
    server: '192.168.1.184\\NG', database: 'NG0001', user: 'sa', password: '12345',
    options: { encrypt: false, trustServerCertificate: true }
  });
  // sample items under numeric classes and their prdclass
  const items = await sql.query`
    SELECT RTRIM(itemno) itemno, RTRIM(itemname) itemname, RTRIM(prdclass) prdclass
    FROM itemdata
    WHERE prdclass IN ('199901','199908','199911','2003','4017','3001','4001')
       OR itemno LIKE '4017%' OR itemno LIKE '1999%' OR itemno LIKE '2003%'
    ORDER BY prdclass, itemno
  `;
  console.log('ITEMS', items.recordset.length);
  console.log(JSON.stringify(items.recordset.slice(0,40), null, 2));
  // group by prdclass with sample names
  const grp = await sql.query`
    SELECT RTRIM(prdclass) prdclass, COUNT(*) cnt,
      MIN(RTRIM(itemname)) sample1, MAX(RTRIM(itemname)) sample2
    FROM itemdata
    WHERE prdclass IN ('199901','199908','199911','2001','2002','2003','2003011','3001','3002','3003','3004','3005','3006','3007','3008','3009','3010','3011','3012','3013','3014','3015','3016','3017','3018','4001','4002','4003','4004','4005','4006','4007','4008','4009','4012','4016','4017','4018')
    GROUP BY RTRIM(prdclass)
    ORDER BY prdclass
  `;
  console.log('GRP', JSON.stringify(grp.recordset, null, 2));
  // child names for all numeric parents via local style - get first '其它' child if any
  const kids = await sql.query`
    SELECT RTRIM(prdclass) prdclass, RTRIM(prdname) prdname
    FROM prdclass
    WHERE prdname LIKE N'其它%' OR prdname LIKE N'其他%'
    ORDER BY prdclass
  `;
  console.log('OTHER_KIDS', JSON.stringify(kids.recordset, null, 2));
  // packaging children
  const pkg = await sql.query`
    SELECT RTRIM(prdclass) prdclass, RTRIM(prdname) prdname
    FROM prdclass
    WHERE prdclass LIKE '4%' AND LEN(RTRIM(prdclass)) >= 4
    ORDER BY prdclass
  `;
  console.log('PKG', JSON.stringify(pkg.recordset, null, 2));
  // 300x first level children names - get representative
  const p3 = await sql.query`
    SELECT RTRIM(prdclass) prdclass, RTRIM(prdname) prdname
    FROM prdclass
    WHERE prdclass LIKE '30%' AND LEN(RTRIM(prdclass))=4
    ORDER BY prdclass
  `;
  console.log('P3', JSON.stringify(p3.recordset, null, 2));
  // all level-ish by length
  const byLen = await sql.query`
    SELECT LEN(RTRIM(prdclass)) len, COUNT(*) cnt,
      SUM(CASE WHEN RTRIM(prdname) = RTRIM(prdclass) THEN 1 ELSE 0 END) same_name
    FROM prdclass GROUP BY LEN(RTRIM(prdclass)) ORDER BY len
  `;
  console.log('BYLEN', JSON.stringify(byLen.recordset, null, 2));
  await sql.close();
})().catch(e=>{console.error(e); process.exit(1)});
