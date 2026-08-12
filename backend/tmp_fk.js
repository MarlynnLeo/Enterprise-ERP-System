const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({ host:'192.168.1.251', port:3306, user:'root', password:'mysql_n3cEDY', database:'mes', multipleStatements:true });
  const [fks] = await c.query(`
    SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA='mes' AND REFERENCED_TABLE_NAME IS NOT NULL
      AND (
        REFERENCED_TABLE_NAME IN ('materials','customers','suppliers','units','locations','categories','bom_masters','bom_details','material_sources')
        OR TABLE_NAME IN ('materials','customers','suppliers','units','locations','categories','bom_masters','bom_details','material_sources')
      )
    ORDER BY TABLE_NAME, COLUMN_NAME
  `);
  console.log(JSON.stringify(fks, null, 2));
  const keep = ['users','roles','permissions','role_permissions','menus','role_menus','user_roles','user_permissions','knex_migrations','knex_migrations_lock','system_settings','coding_rules','coding_sequences','workflow_templates','workflow_template_nodes','workflow_node_approvers','business_types','gl_accounts','gl_account_mappings','notification_rules','print_templates','cost_settings','tax_account_config','expense_categories','asset_categories','exchange_rates','hr_attendance_rules','quality_aql_standards','pricing_strategy_fields','product_pricing_strategies','production_calendar','production_calendar_overrides','inspection_methods','inspection_items','inspection_templates','template_item_mappings','process_templates','process_template_details','departments','metal_prices','metal_price_history','cost_centers','overhead_allocation_config','first_article_rules','process_inspection_rules'];
  const [tables] = await c.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='mes' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  console.log('KEEP_EXIST', keep.filter(t => tables.some(x => x.TABLE_NAME === t)));
  console.log('MISSING_KEEP', keep.filter(t => !tables.some(x => x.TABLE_NAME === t)));
  const [pc] = await c.query("SHOW TABLES LIKE 'product_categories'");
  console.log('product_categories', pc);
  if (pc.length) {
    const [cols] = await c.query('SHOW COLUMNS FROM product_categories');
    const [[cnt]] = await c.query('SELECT COUNT(*) c FROM product_categories');
    console.log('pc cols', cols.map(x=>x.Field), 'count', cnt.c);
  }
  await c.end();
})().catch(e=>{console.error(e); process.exit(1);});
