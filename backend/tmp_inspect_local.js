const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({ host:'192.168.1.251', port:3306, user:'root', password:'mysql_n3cEDY', database:'mes' });
  const [tables] = await c.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='mes' ORDER BY TABLE_NAME");
  console.log('TABLE_COUNT', tables.length);
  const businessLike = tables.map(t => t.TABLE_NAME).filter(n => !['knex_migrations','knex_migrations_lock','users','roles','permissions','role_permissions','menus','role_menus','user_roles','system_configs','system_config','coding_rules','workflow_templates','workflow_nodes','workflow_transitions','notifications','notification_rules','audit_logs'].includes(n));
  for (const name of businessLike) {
    const [[cnt]] = await c.query('SELECT COUNT(*) AS c FROM `' + name + '`');
    if (cnt.c > 0) console.log(name, cnt.c);
  }
  // sample key basedata rows
  const [sampleCust] = await c.query('SELECT id,code,name FROM customers LIMIT 5');
  const [sampleMat] = await c.query('SELECT id,code,name,specs,unit_id FROM materials LIMIT 5');
  const [sampleSup] = await c.query('SELECT id,code,name FROM suppliers LIMIT 5');
  const [sampleUnit] = await c.query('SELECT id,code,name FROM units');
  const [sampleLoc] = await c.query('SELECT id,code,name,type FROM locations');
  console.log('CUST', sampleCust);
  console.log('MAT', sampleMat);
  console.log('SUP', sampleSup);
  console.log('UNIT', sampleUnit);
  console.log('LOC', sampleLoc);
  // check boms table existence alternate names
  const [bomTables] = await c.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='mes' AND TABLE_NAME LIKE '%bom%'");
  console.log('BOM TABLES', bomTables);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
