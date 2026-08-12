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
  const names = ['itemdata','msunit','fg_customfile','fg_vendorfile','vendor','supplier','bom','bom_det','warehouse','store','location','dept','department','compfile','itemtype','itemclass','class','category','process','gx','workcenter'];
  const like = await pool.request().query(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE='BASE TABLE' AND (
      TABLE_NAME LIKE '%item%' OR TABLE_NAME LIKE '%cust%' OR TABLE_NAME LIKE '%vend%' OR TABLE_NAME LIKE '%supp%' OR
      TABLE_NAME LIKE '%bom%' OR TABLE_NAME LIKE '%unit%' OR TABLE_NAME LIKE '%ware%' OR TABLE_NAME LIKE '%store%' OR
      TABLE_NAME LIKE '%loc%' OR TABLE_NAME LIKE '%class%' OR TABLE_NAME LIKE '%type%' OR TABLE_NAME LIKE '%dept%'
    )
    ORDER BY TABLE_NAME
  `);
  console.log('CANDIDATES');
  console.log(like.recordset.map(r => r.TABLE_NAME).join('\n'));
  for (const t of ['itemdata','msunit','fg_customfile','bom','bom_det']) {
    try {
      const c = await pool.request().query(`SELECT COUNT(*) AS c FROM dbo.${t}`);
      console.log(t, c.recordset[0].c);
    } catch (e) {
      console.log(t, 'ERR', e.message);
    }
  }
  await pool.close();
})().catch(e => { console.error(e); process.exit(1); });
