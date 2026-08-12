const sql = require('mssql');
(async () => {
  const pool = await sql.connect({
    server: '192.168.1.184\\NG',
    database: 'NG0001',
    user: 'sa',
    password: '12345',
    options: { encrypt: false, trustServerCertificate: true },
  });
  const q = async (sqlText) => (await pool.request().query(sqlText)).recordset;
  console.log('BOM sample by parent');
  console.log(await q("SELECT TOP 20 f_itemno, COUNT(*) c, MIN(itemno) min_item, MAX(itemno) max_item FROM bom GROUP BY f_itemno ORDER BY COUNT(*) DESC"));
  console.log('BOM real parent sample');
  console.log(await q("SELECT TOP 20 * FROM bom WHERE f_itemno <> '0000' AND f_itemno IS NOT NULL ORDER BY f_itemno, lineid"));
  console.log('BOM parents with children');
  console.log(await q("SELECT COUNT(DISTINCT f_itemno) parents, COUNT(*) lines FROM bom WHERE f_itemno IS NOT NULL AND f_itemno <> '' AND f_itemno <> '0000'"));
  console.log('BOM 0000 count');
  console.log(await q("SELECT COUNT(*) c FROM bom WHERE f_itemno = '0000' OR f_itemno IS NULL OR f_itemno = ''"));
  console.log('bom_det sample');
  console.log(await q('SELECT TOP 20 * FROM bom_det ORDER BY id'));
  console.log('itemdata itemtype dist');
  console.log(await q('SELECT itemtype, COUNT(*) c FROM itemdata GROUP BY itemtype ORDER BY COUNT(*) DESC'));
  console.log('itemsource dist');
  console.log(await q('SELECT itemsource, COUNT(*) c FROM itemdata GROUP BY itemsource ORDER BY COUNT(*) DESC'));
  console.log('prdclass top');
  console.log(await q('SELECT TOP 20 prdclass, COUNT(*) c FROM itemdata GROUP BY prdclass ORDER BY COUNT(*) DESC'));
  await pool.close();
})().catch(e => { console.error(e); process.exit(1); });
