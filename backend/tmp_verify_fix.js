const materialService = require('./src/services/materialService');
const { mapKeysToCamel } = require('./src/utils/fieldMap');
const mysql = require('mysql2/promise');
(async () => {
  const samples = ['100601001','100104001','3001002002','4017001002','199999001'];
  for (const code of samples) {
    const res = await materialService.getAllMaterials(1, 1, { search: code });
    const row = (res.data || []).find(r => r.code === code) || res.data[0];
    console.log(JSON.stringify(mapKeysToCamel(row), null, 2));
  }
  const conn = await mysql.createConnection({ host:'192.168.1.251', user:'root', password:'mysql_n3cEDY', database:'mes' });
  const [num] = await conn.query("SELECT id, code, name FROM categories WHERE name REGEXP '^[0-9]+$'");
  console.log('numeric left', num.length, num);
  const [pcNull] = await conn.query('SELECT COUNT(*) c FROM materials WHERE product_category_id IS NULL AND deleted_at IS NULL');
  console.log('pc null', pcNull);
  const [bad] = await conn.query(`
    SELECT COUNT(*) c FROM materials m
    JOIN categories c ON c.id=m.category_id
    WHERE c.name REGEXP '^[0-9]+$'
  `);
  console.log('materials numeric cat', bad);
  await conn.end();
  process.exit(0);
})().catch(e=>{console.error(e); process.exit(1)});
