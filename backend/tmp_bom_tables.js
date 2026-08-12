const sql = require('mssql');
(async () => {
  const pool = await sql.connect({
    server: '192.168.1.184\\NG',
    database: 'NG0001',
    user: 'sa',
    password: '12345',
    options: { encrypt: false, trustServerCertificate: true },
  });
  const tables = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND (TABLE_NAME LIKE 'bom%' OR TABLE_NAME LIKE 'item%' OR TABLE_NAME LIKE 'cust%' OR TABLE_NAME LIKE 'vend%' OR TABLE_NAME LIKE 'supp%' OR TABLE_NAME LIKE 'unit%' OR TABLE_NAME LIKE 'ware%' OR TABLE_NAME LIKE 'whl%' OR TABLE_NAME LIKE 'loc%' OR TABLE_NAME LIKE 'dept%' OR TABLE_NAME LIKE 'class%' OR TABLE_NAME LIKE 'type%') ORDER BY TABLE_NAME");
  console.log(tables.recordset.map(r => r.TABLE_NAME).join('\n'));
  for (const t of ['itemdata','msunit','fg_customfile','fg_supplyfile','warehouse','whlocation','itemclass','itemtype','itemsource','bom','bom_det','dept','srm_supplier_info']) {
    try {
      const c = await pool.request().query('SELECT COUNT(*) AS c FROM dbo.[' + t + ']');
      console.log(t, c.recordset[0].c);
    } catch (e) {
      console.log(t, 'ERR', e.message);
    }
  }
  await pool.close();
})().catch(e => { console.error(e); process.exit(1); });
