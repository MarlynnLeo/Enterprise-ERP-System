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
  const tables = await pool.request().query("SELECT TOP 200 TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME");
  console.log('TABLE_COUNT', tables.recordset.length);
  console.log(tables.recordset.map(r => r.TABLE_SCHEMA + '.' + r.TABLE_NAME).join('\n'));
  await pool.close();
})().catch(e => { console.error('CONNECT_FAIL', e.message); process.exit(1); });
