const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({ host:'192.168.1.251', port:3306, user:'root', password:'mysql_n3cEDY', database:'mes' });
  const [col] = await c.query("SHOW COLUMNS FROM categories");
  console.log(col.map(x => x.Field));
  const [cat] = await c.query('SELECT * FROM categories LIMIT 5');
  console.log(cat);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
