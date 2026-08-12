const mysql = require('mysql2/promise');
const materialService = require('./src/services/materialService');
const { mapKeysToCamel } = require('./src/utils/fieldMap');

(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.1.251',
    user: 'root',
    password: 'mysql_n3cEDY',
    database: 'mes'
  });

  const [cols] = await conn.query('DESCRIBE materials');
  console.log('=== COLUMNS ===');
  console.log(cols.map(c => ({
    Field: c.Field,
    Type: c.Type,
    Null: c.Null,
    Key: c.Key,
    Default: c.Default
  })));

  const [totals] = await conn.query(`
    SELECT
      COUNT(*) AS total,
      SUM(deleted_at IS NULL) AS active,
      SUM(deleted_at IS NOT NULL) AS soft_deleted
    FROM materials
  `);
  console.log('=== TOTALS ===');
  console.log(totals[0]);

  // Null/empty completeness for key fields on active materials
  const [completeness] = await conn.query(`
    SELECT
      COUNT(*) AS total,
      SUM(code IS NULL OR code = '') AS missing_code,
      SUM(name IS NULL OR name = '') AS missing_name,
      SUM(category_id IS NULL) AS missing_category_id,
      SUM(product_category_id IS NULL) AS missing_product_category_id,
      SUM(unit_id IS NULL) AS missing_unit_id,
      SUM(material_source_id IS NULL) AS missing_material_source_id,
      SUM(location_id IS NULL) AS missing_location_id,
      SUM(status IS NULL) AS missing_status,
      SUM(material_type IS NULL OR material_type = '') AS missing_material_type,
      SUM(specs IS NULL OR specs = '') AS missing_specs,
      SUM(inspection_method_id IS NULL) AS missing_inspection_method_id,
      SUM(supplier_id IS NULL) AS missing_supplier_id,
      SUM(production_group_id IS NULL) AS missing_production_group_id,
      SUM(manager_id IS NULL) AS missing_manager_id,
      SUM(price IS NULL) AS missing_price,
      SUM(cost_price IS NULL) AS missing_cost_price,
      SUM(min_stock IS NULL) AS missing_min_stock,
      SUM(max_stock IS NULL) AS missing_max_stock,
      SUM(tax_rate IS NULL) AS missing_tax_rate,
      SUM(drawing_no IS NULL OR drawing_no = '') AS missing_drawing_no,
      SUM(color_code IS NULL OR color_code = '') AS missing_color_code,
      SUM(remark IS NULL OR remark = '') AS missing_remark
    FROM materials
    WHERE deleted_at IS NULL
  `);
  console.log('=== COMPLETENESS ===');
  console.log(completeness[0]);

  // Orphan / invalid FK checks
  const [fk] = await conn.query(`
    SELECT
      SUM(c.id IS NULL) AS bad_category,
      SUM(pc.id IS NULL) AS bad_product_category,
      SUM(u.id IS NULL) AS bad_unit,
      SUM(ms.id IS NULL) AS bad_material_source,
      SUM(l.id IS NULL AND m.location_id IS NOT NULL) AS bad_location,
      SUM(im.id IS NULL AND m.inspection_method_id IS NOT NULL) AS bad_inspection_method,
      SUM(s.id IS NULL AND m.supplier_id IS NOT NULL) AS bad_supplier,
      SUM(pg.id IS NULL AND m.production_group_id IS NOT NULL) AS bad_production_group,
      SUM(mgr.id IS NULL AND m.manager_id IS NOT NULL) AS bad_manager,
      SUM(c.name REGEXP '^[0-9]+$') AS numeric_category_name,
      SUM(pc.name REGEXP '^[0-9]+$') AS numeric_product_category_name
    FROM materials m
    LEFT JOIN categories c ON c.id = m.category_id
    LEFT JOIN categories pc ON pc.id = m.product_category_id
    LEFT JOIN units u ON u.id = m.unit_id
    LEFT JOIN material_sources ms ON ms.id = m.material_source_id
    LEFT JOIN locations l ON l.id = m.location_id
    LEFT JOIN inspection_methods im ON im.id = m.inspection_method_id
    LEFT JOIN suppliers s ON s.id = m.supplier_id
    LEFT JOIN departments pg ON pg.id = m.production_group_id
    LEFT JOIN users mgr ON mgr.id = m.manager_id
    WHERE m.deleted_at IS NULL
  `);
  console.log('=== FK / NAME QUALITY ===');
  console.log(fk[0]);

  // Status / type distributions
  const [statusDist] = await conn.query(`
    SELECT status, COUNT(*) cnt
    FROM materials WHERE deleted_at IS NULL
    GROUP BY status ORDER BY cnt DESC
  `);
  const [typeDist] = await conn.query(`
    SELECT material_type, COUNT(*) cnt
    FROM materials WHERE deleted_at IS NULL
    GROUP BY material_type ORDER BY cnt DESC
  `);
  const [srcDist] = await conn.query(`
    SELECT COALESCE(ms.name, '(null)') source_name, COUNT(*) cnt
    FROM materials m
    LEFT JOIN material_sources ms ON ms.id = m.material_source_id
    WHERE m.deleted_at IS NULL
    GROUP BY COALESCE(ms.name, '(null)')
    ORDER BY cnt DESC
  `);
  const [unitDist] = await conn.query(`
    SELECT COALESCE(u.name, '(null)') unit_name, COUNT(*) cnt
    FROM materials m
    LEFT JOIN units u ON u.id = m.unit_id
    WHERE m.deleted_at IS NULL
    GROUP BY COALESCE(u.name, '(null)')
    ORDER BY cnt DESC
    LIMIT 15
  `);
  const [locDist] = await conn.query(`
    SELECT COALESCE(l.name, '(null)') location_name, COUNT(*) cnt
    FROM materials m
    LEFT JOIN locations l ON l.id = m.location_id
    WHERE m.deleted_at IS NULL
    GROUP BY COALESCE(l.name, '(null)')
    ORDER BY cnt DESC
  `);
  console.log('=== DIST status ===', statusDist);
  console.log('=== DIST material_type ===', typeDist);
  console.log('=== DIST source ===', srcDist);
  console.log('=== DIST unit top ===', unitDist);
  console.log('=== DIST location ===', locDist);

  // Duplicate codes
  const [dupCodes] = await conn.query(`
    SELECT code, COUNT(*) cnt
    FROM materials
    WHERE deleted_at IS NULL
    GROUP BY code
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 10
  `);
  console.log('=== DUP CODES ===', dupCodes);

  // Sample records via service (what frontend sees)
  const sampleCodes = ['100601001','100104001','3001002002','4017001002','199999001','200301001'];
  const samples = [];
  for (const code of sampleCodes) {
    const res = await materialService.getAllMaterials(1, 5, { search: code });
    const row = (res.data || []).find(r => r.code === code) || null;
    if (row) samples.push(mapKeysToCamel(row));
  }
  console.log('=== API SAMPLES ===');
  console.log(JSON.stringify(samples, null, 2));

  // Field fill rate summary as percentages
  const t = Number(completeness[0].total) || 1;
  const rate = (n) => Number(((1 - Number(n||0)/t) * 100).toFixed(2));
  const summary = {
    total: t,
    code: rate(completeness[0].missing_code),
    name: rate(completeness[0].missing_name),
    category_id: rate(completeness[0].missing_category_id),
    product_category_id: rate(completeness[0].missing_product_category_id),
    unit_id: rate(completeness[0].missing_unit_id),
    material_source_id: rate(completeness[0].missing_material_source_id),
    location_id: rate(completeness[0].missing_location_id),
    status: rate(completeness[0].missing_status),
    material_type: rate(completeness[0].missing_material_type),
    specs: rate(completeness[0].missing_specs),
    inspection_method_id: rate(completeness[0].missing_inspection_method_id),
    supplier_id: rate(completeness[0].missing_supplier_id),
    production_group_id: rate(completeness[0].missing_production_group_id),
    manager_id: rate(completeness[0].missing_manager_id),
    price: rate(completeness[0].missing_price),
    cost_price: rate(completeness[0].missing_cost_price),
    min_stock: rate(completeness[0].missing_min_stock),
    max_stock: rate(completeness[0].missing_max_stock),
    tax_rate: rate(completeness[0].missing_tax_rate),
    drawing_no: rate(completeness[0].missing_drawing_no),
    color_code: rate(completeness[0].missing_color_code),
    remark: rate(completeness[0].missing_remark)
  };
  console.log('=== FILL RATES % ===');
  console.log(summary);

  await conn.end();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
