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
  console.log('COLUMNS', cols.map(c => ({
    field: c.Field,
    type: c.Type,
    null: c.Null,
    key: c.Key,
    default: c.Default
  })));

  const [overview] = await conn.query(`
    SELECT
      COUNT(*) AS total,
      SUM(deleted_at IS NULL) AS active_total,
      SUM(deleted_at IS NOT NULL) AS soft_deleted,
      SUM(code IS NULL OR code = '') AS missing_code,
      SUM(name IS NULL OR name = '') AS missing_name,
      SUM(category_id IS NULL) AS missing_category_id,
      SUM(product_category_id IS NULL) AS missing_product_category_id,
      SUM(unit_id IS NULL) AS missing_unit_id,
      SUM(material_source_id IS NULL) AS missing_material_source_id,
      SUM(location_id IS NULL) AS missing_location_id,
      SUM(inspection_method_id IS NULL) AS missing_inspection_method_id,
      SUM(supplier_id IS NULL) AS missing_supplier_id,
      SUM(production_group_id IS NULL) AS missing_production_group_id,
      SUM(manager_id IS NULL) AS missing_manager_id,
      SUM(status IS NULL) AS missing_status,
      SUM(material_type IS NULL OR material_type = '') AS missing_material_type,
      SUM(specs IS NULL OR specs = '') AS missing_specs,
      SUM(price IS NULL) AS missing_price,
      SUM(cost_price IS NULL) AS missing_cost_price,
      SUM(min_stock IS NULL) AS missing_min_stock,
      SUM(max_stock IS NULL) AS missing_max_stock,
      SUM(safety_stock IS NULL) AS missing_safety_stock,
      SUM(tax_rate IS NULL) AS missing_tax_rate
    FROM materials
    WHERE deleted_at IS NULL
  `);
  console.log('OVERVIEW', JSON.stringify(overview[0], null, 2));

  const [joinHealth] = await conn.query(`
    SELECT
      SUM(c.id IS NULL) AS broken_category_fk,
      SUM(pc.id IS NULL) AS broken_product_category_fk,
      SUM(u.id IS NULL) AS broken_unit_fk,
      SUM(ms.id IS NULL) AS broken_material_source_fk,
      SUM(l.id IS NULL) AS broken_location_fk,
      SUM(c.name REGEXP '^[0-9]+$') AS numeric_category_name,
      SUM(pc.name REGEXP '^[0-9]+$') AS numeric_product_category_name,
      SUM(c.name IS NULL OR c.name = '') AS empty_category_name,
      SUM(pc.name IS NULL OR pc.name = '') AS empty_product_category_name,
      SUM(u.name IS NULL OR u.name = '') AS empty_unit_name,
      SUM(ms.name IS NULL OR ms.name = '') AS empty_material_source_name
    FROM materials m
    LEFT JOIN categories c ON c.id = m.category_id AND c.deleted_at IS NULL
    LEFT JOIN categories pc ON pc.id = m.product_category_id AND pc.deleted_at IS NULL
    LEFT JOIN units u ON u.id = m.unit_id
    LEFT JOIN material_sources ms ON ms.id = m.material_source_id
    LEFT JOIN locations l ON l.id = m.location_id
    WHERE m.deleted_at IS NULL
  `);
  console.log('JOIN_HEALTH', JSON.stringify(joinHealth[0], null, 2));

  const [typeDist] = await conn.query(`
    SELECT material_type, COUNT(*) cnt
    FROM materials
    WHERE deleted_at IS NULL
    GROUP BY material_type
    ORDER BY cnt DESC
  `);
  console.log('MATERIAL_TYPE_DIST', JSON.stringify(typeDist, null, 2));

  const [statusDist] = await conn.query(`
    SELECT status, COUNT(*) cnt
    FROM materials
    WHERE deleted_at IS NULL
    GROUP BY status
    ORDER BY status
  `);
  console.log('STATUS_DIST', JSON.stringify(statusDist, null, 2));

  const [sourceDist] = await conn.query(`
    SELECT ms.id, ms.name, COUNT(*) cnt
    FROM materials m
    LEFT JOIN material_sources ms ON ms.id = m.material_source_id
    WHERE m.deleted_at IS NULL
    GROUP BY ms.id, ms.name
    ORDER BY cnt DESC
  `);
  console.log('SOURCE_DIST', JSON.stringify(sourceDist, null, 2));

  const [unitDist] = await conn.query(`
    SELECT u.id, u.code, u.name, COUNT(*) cnt
    FROM materials m
    LEFT JOIN units u ON u.id = m.unit_id
    WHERE m.deleted_at IS NULL
    GROUP BY u.id, u.code, u.name
    ORDER BY cnt DESC
  `);
  console.log('UNIT_DIST', JSON.stringify(unitDist, null, 2));

  const [locDist] = await conn.query(`
    SELECT l.id, l.name, COUNT(*) cnt
    FROM materials m
    LEFT JOIN locations l ON l.id = m.location_id
    WHERE m.deleted_at IS NULL
    GROUP BY l.id, l.name
    ORDER BY cnt DESC
  `);
  console.log('LOCATION_DIST', JSON.stringify(locDist, null, 2));

  const [dupCodes] = await conn.query(`
    SELECT code, COUNT(*) cnt
    FROM materials
    WHERE deleted_at IS NULL
    GROUP BY code
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC, code
    LIMIT 20
  `);
  console.log('DUP_CODES', JSON.stringify(dupCodes, null, 2));

  const [sampleMissing] = await conn.query(`
    SELECT m.code, m.name,
      m.category_id, c.name AS category_name,
      m.product_category_id, pc.name AS product_category_name,
      m.unit_id, u.name AS unit_name,
      m.material_source_id, ms.name AS material_source_name,
      m.location_id, l.name AS location_name,
      m.material_type, m.status, m.specs
    FROM materials m
    LEFT JOIN categories c ON c.id = m.category_id
    LEFT JOIN categories pc ON pc.id = m.product_category_id
    LEFT JOIN units u ON u.id = m.unit_id
    LEFT JOIN material_sources ms ON ms.id = m.material_source_id
    LEFT JOIN locations l ON l.id = m.location_id
    WHERE m.deleted_at IS NULL
      AND (
        m.category_id IS NULL OR m.product_category_id IS NULL OR m.unit_id IS NULL
        OR m.material_source_id IS NULL OR m.location_id IS NULL
        OR c.id IS NULL OR pc.id IS NULL OR u.id IS NULL OR ms.id IS NULL OR l.id IS NULL
        OR c.name REGEXP '^[0-9]+$' OR pc.name REGEXP '^[0-9]+$'
      )
    ORDER BY m.code
    LIMIT 30
  `);
  console.log('PROBLEM_SAMPLES', JSON.stringify(sampleMissing, null, 2));

  const [goodSamples] = await conn.query(`
    SELECT m.code, m.name,
      c.code AS cat_code, c.name AS category_name,
      pc.code AS pc_code, pc.name AS product_category_name,
      u.name AS unit_name, ms.name AS material_source_name, l.name AS location_name,
      m.material_type, m.status
    FROM materials m
    LEFT JOIN categories c ON c.id = m.category_id
    LEFT JOIN categories pc ON pc.id = m.product_category_id
    LEFT JOIN units u ON u.id = m.unit_id
    LEFT JOIN material_sources ms ON ms.id = m.material_source_id
    LEFT JOIN locations l ON l.id = m.location_id
    WHERE m.code IN ('100601001','100104001','3001002002','4017001002','199999001','200301001')
    ORDER BY m.code
  `);
  console.log('GOOD_SAMPLES', JSON.stringify(goodSamples, null, 2));

  // API layer sample
  const api = await materialService.getAllMaterials(1, 5, {});
  console.log('API_SAMPLE', JSON.stringify(mapKeysToCamel(api.data), null, 2));

  // Required-ish completeness score for list display fields
  const [displayReady] = await conn.query(`
    SELECT
      SUM(
        m.code IS NOT NULL AND m.code <> ''
        AND m.name IS NOT NULL AND m.name <> ''
        AND m.category_id IS NOT NULL
        AND c.name IS NOT NULL AND c.name <> '' AND c.name NOT REGEXP '^[0-9]+$'
        AND m.product_category_id IS NOT NULL
        AND pc.name IS NOT NULL AND pc.name <> '' AND pc.name NOT REGEXP '^[0-9]+$'
        AND m.unit_id IS NOT NULL AND u.name IS NOT NULL AND u.name <> ''
        AND m.material_source_id IS NOT NULL AND ms.name IS NOT NULL AND ms.name <> ''
      ) AS display_ready_count,
      COUNT(*) AS total
    FROM materials m
    LEFT JOIN categories c ON c.id = m.category_id
    LEFT JOIN categories pc ON pc.id = m.product_category_id
    LEFT JOIN units u ON u.id = m.unit_id
    LEFT JOIN material_sources ms ON ms.id = m.material_source_id
    WHERE m.deleted_at IS NULL
  `);
  console.log('DISPLAY_READY', JSON.stringify(displayReady[0], null, 2));

  await conn.end();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
