const sql = require('mssql');
(async () => {
  const config = {
    server: '192.168.1.184\\NG',
    database: 'NG0001',
    user: 'sa',
    password: '12345',
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
  };
  const pool = await sql.connect(config);
  for (const t of ['itemdata','msunit','fg_customfile','fg_supplyfile','warehouse','whlocation','itemclass','itemtype','bom','bom_det','itemsource','dept','srm_supplier_info']) {
    try {
      const cols = await pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t}' ORDER BY ORDINAL_POSITION`);
      const c = await pool.request().query(`SELECT COUNT(*) AS c FROM dbo.[${t}]`);
      console.log('====', t, c.recordset[0].c, '====');
      console.log(cols.recordset.map(x => x.COLUMN_NAME + ':' + x.DATA_TYPE).join(', '));
    } catch (e) {
      console.log('====', t, 'ERR', e.message);
    }
  }
  await pool.close();
})().catch(e => { console.error(e); process.exit(1); });
