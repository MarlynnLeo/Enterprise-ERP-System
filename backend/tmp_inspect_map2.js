const sql = require('mssql');
(async () => {
  const pool = await sql.connect({
    server: '192.168.1.184\\NG',
    database: 'NG0001',
    user: 'sa',
    password: '12345',
    options: { encrypt: false, trustServerCertificate: true },
  });
  const samples = {};
  samples.itemdata = (await pool.request().query('SELECT TOP 5 itemno,itemname,descript,sizeno,msunit,itemtype,itemsource,prdclass,defwhouse,defwhloc,prc,costprc,qty_min,qty_max,qty_secure,vendor,defsupply,issale,ischecked FROM itemdata ORDER BY itemno')).recordset;
  samples.msunit = (await pool.request().query('SELECT * FROM msunit')).recordset;
  samples.custom = (await pool.request().query('SELECT TOP 10 compno,compname,simplename,address,person,mail,phoneuid,custclass,creditdays,ctaxrate,accstop FROM fg_customfile ORDER BY compno')).recordset;
  samples.supply = (await pool.request().query('SELECT TOP 10 compno,compname,remarks,payway,creditdays,accstop,vendor_type FROM fg_supplyfile ORDER BY compno')).recordset;
  samples.wh = (await pool.request().query('SELECT * FROM warehouse')).recordset;
  samples.whl = (await pool.request().query('SELECT * FROM whlocation')).recordset;
  samples.itemtype = (await pool.request().query('SELECT * FROM itemtype')).recordset;
  samples.itemsource = (await pool.request().query('SELECT * FROM itemsource')).recordset;
  samples.bom = (await pool.request().query('SELECT TOP 10 id,itemno,msunit,qty,f_itemno,f_msunit,f_qty,lineid,version,is_basic,begindt,enddt FROM bom ORDER BY itemno, lineid')).recordset;
  samples.customCount = (await pool.request().query('SELECT COUNT(*) c FROM fg_customfile')).recordset[0].c;
  samples.supplyCount = (await pool.request().query('SELECT COUNT(*) c FROM fg_supplyfile')).recordset[0].c;
  samples.itemtypeCount = (await pool.request().query('SELECT COUNT(*) c FROM itemtype')).recordset[0].c;
  console.log(JSON.stringify(samples, null, 2));
  await pool.close();
})().catch(e => { console.error(e); process.exit(1); });
