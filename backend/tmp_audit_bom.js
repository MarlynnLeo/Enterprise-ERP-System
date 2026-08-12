const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.1.251',
    user: 'root',
    password: 'mysql_n3cEDY',
    database: 'mes'
  });

  const [masterCols] = await conn.query('DESCRIBE bom_masters');
  const [detailCols] = await conn.query('DESCRIBE bom_details');
  console.log('MASTER_COLS', masterCols.map(c => ({ field: c.Field, type: c.Type, null: c.Null, key: c.Key, default: c.Default })));
  console.log('DETAIL_COLS', detailCols.map(c => ({ field: c.Field, type: c.Type, null: c.Null, key: c.Key, default: c.Default })));

  const [counts] = await conn.query(`
    SELECT
      (SELECT COUNT(*) FROM bom_masters) AS masters_all,
      (SELECT COUNT(*) FROM bom_masters WHERE deleted_at IS NULL) AS masters_active,
      (SELECT COUNT(*) FROM bom_masters WHERE deleted_at IS NOT NULL) AS masters_deleted,
      (SELECT COUNT(*) FROM bom_details) AS details_all,
      (SELECT COUNT(*) FROM bom_details WHERE deleted_at IS NULL) AS details_active,
      (SELECT COUNT(*) FROM bom_details WHERE deleted_at IS NOT NULL) AS details_deleted
  `);
  console.log('COUNTS', JSON.stringify(counts[0], null, 2));

  const [masterOverview] = await conn.query(`
    SELECT
      COUNT(*) AS total,
      SUM(product_id IS NULL) AS missing_product_id,
      SUM(version IS NULL OR version = '') AS missing_version,
      SUM(status IS NULL) AS missing_status,
      SUM(effective_date IS NULL) AS missing_effective_date,
      SUM(expiry_date IS NULL) AS missing_expiry_date,
      SUM(remark IS NULL OR remark = '') AS missing_remark
    FROM bom_masters
    WHERE deleted_at IS NULL
  `);
  console.log('MASTER_OVERVIEW', JSON.stringify(masterOverview[0], null, 2));

  const [detailOverview] = await conn.query(`
    SELECT
      COUNT(*) AS total,
      SUM(bom_id IS NULL) AS missing_bom_id,
      SUM(material_id IS NULL) AS missing_material_id,
      SUM(quantity IS NULL) AS missing_quantity,
      SUM(quantity <= 0) AS non_positive_quantity,
      SUM(unit_id IS NULL) AS missing_unit_id,
      SUM(sequence IS NULL) AS missing_sequence,
      SUM(remark IS NULL OR remark = '') AS missing_remark
    FROM bom_details
    WHERE deleted_at IS NULL
  `);
  console.log('DETAIL_OVERVIEW', JSON.stringify(detailOverview[0], null, 2));

  // status distribution
  const [statusDist] = await conn.query(`
    SELECT status, COUNT(*) cnt
    FROM bom_masters
    WHERE deleted_at IS NULL
    GROUP BY status
    ORDER BY status
  `);
  console.log('STATUS_DIST', JSON.stringify(statusDist, null, 2));

  // join integrity
  const [masterJoin] = await conn.query(`
    SELECT
      SUM(p.id IS NULL) AS broken_product_fk,
      SUM(p.deleted_at IS NOT NULL) AS product_soft_deleted,
      SUM(p.code IS NULL OR p.code = '') AS product_missing_code,
      SUM(p.name IS NULL OR p.name = '') AS product_missing_name
    FROM bom_masters bm
    LEFT JOIN materials p ON p.id = bm.product_id
    WHERE bm.deleted_at IS NULL
  `);
  console.log('MASTER_JOIN', JSON.stringify(masterJoin[0], null, 2));

  const [detailJoin] = await conn.query(`
    SELECT
      SUM(bm.id IS NULL) AS broken_bom_fk,
      SUM(bm.deleted_at IS NOT NULL) AS bom_soft_deleted,
      SUM(m.id IS NULL) AS broken_material_fk,
      SUM(m.deleted_at IS NOT NULL) AS material_soft_deleted,
      SUM(u.id IS NULL) AS broken_unit_fk,
      SUM(u.name IS NULL OR u.name = '') AS empty_unit_name
    FROM bom_details bd
    LEFT JOIN bom_masters bm ON bm.id = bd.bom_id
    LEFT JOIN materials m ON m.id = bd.material_id
    LEFT JOIN units u ON u.id = bd.unit_id
    WHERE bd.deleted_at IS NULL
  `);
  console.log('DETAIL_JOIN', JSON.stringify(detailJoin[0], null, 2));

  // masters without details / details without masters already covered
  const [emptyBoms] = await conn.query(`
    SELECT COUNT(*) cnt
    FROM bom_masters bm
    LEFT JOIN bom_details bd ON bd.bom_id = bm.id AND bd.deleted_at IS NULL
    WHERE bm.deleted_at IS NULL
    GROUP BY bm.id
    HAVING COUNT(bd.id) = 0
  `);
  // above returns rows of empty boms; recount properly
  const [emptyBomCount] = await conn.query(`
    SELECT COUNT(*) AS empty_bom_count FROM (
      SELECT bm.id
      FROM bom_masters bm
      LEFT JOIN bom_details bd ON bd.bom_id = bm.id AND bd.deleted_at IS NULL
      WHERE bm.deleted_at IS NULL
      GROUP BY bm.id
      HAVING COUNT(bd.id) = 0
    ) t
  `);
  console.log('EMPTY_BOMS', JSON.stringify(emptyBomCount[0], null, 2));

  // duplicate product+version
  const [dupProductVersion] = await conn.query(`
    SELECT product_id, version, COUNT(*) cnt
    FROM bom_masters
    WHERE deleted_at IS NULL
    GROUP BY product_id, version
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log('DUP_PRODUCT_VERSION', JSON.stringify(dupProductVersion, null, 2));

  // materials with multiple active boms
  const [multiActive] = await conn.query(`
    SELECT product_id, COUNT(*) cnt
    FROM bom_masters
    WHERE deleted_at IS NULL AND status = 1
    GROUP BY product_id
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log('MULTI_ACTIVE_BOM', JSON.stringify(multiActive, null, 2));

  // self-reference in details
  const [selfRef] = await conn.query(`
    SELECT COUNT(*) cnt
    FROM bom_details bd
    JOIN bom_masters bm ON bm.id = bd.bom_id
    WHERE bd.deleted_at IS NULL AND bm.deleted_at IS NULL
      AND bd.material_id = bm.product_id
  `);
  console.log('SELF_REF', JSON.stringify(selfRef[0], null, 2));

  // duplicate material lines in same bom
  const [dupLines] = await conn.query(`
    SELECT bom_id, material_id, COUNT(*) cnt
    FROM bom_details
    WHERE deleted_at IS NULL
    GROUP BY bom_id, material_id
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log('DUP_LINES', JSON.stringify(dupLines, null, 2));

  // quantity stats
  const [qtyStats] = await conn.query(`
    SELECT
      MIN(quantity) AS min_qty,
      MAX(quantity) AS max_qty,
      AVG(quantity) AS avg_qty,
      SUM(quantity IS NULL) AS null_qty,
      SUM(quantity = 0) AS zero_qty,
      SUM(quantity < 0) AS negative_qty
    FROM bom_details
    WHERE deleted_at IS NULL
  `);
  console.log('QTY_STATS', JSON.stringify(qtyStats[0], null, 2));

  // detail count distribution
  const [detailDist] = await conn.query(`
    SELECT
      CASE
        WHEN cnt = 0 THEN '0'
        WHEN cnt BETWEEN 1 AND 5 THEN '1-5'
        WHEN cnt BETWEEN 6 AND 20 THEN '6-20'
        WHEN cnt BETWEEN 21 AND 50 THEN '21-50'
        WHEN cnt BETWEEN 51 AND 100 THEN '51-100'
        ELSE '100+'
      END AS bucket,
      COUNT(*) AS bom_count
    FROM (
      SELECT bm.id, COUNT(bd.id) AS cnt
      FROM bom_masters bm
      LEFT JOIN bom_details bd ON bd.bom_id = bm.id AND bd.deleted_at IS NULL
      WHERE bm.deleted_at IS NULL
      GROUP BY bm.id
    ) t
    GROUP BY bucket
    ORDER BY MIN(cnt)
  `);
  console.log('DETAIL_DIST', JSON.stringify(detailDist, null, 2));

  // top boms by detail count
  const [topBoms] = await conn.query(`
    SELECT bm.id, p.code AS product_code, p.name AS product_name, bm.version, bm.status, COUNT(bd.id) AS detail_count
    FROM bom_masters bm
    LEFT JOIN materials p ON p.id = bm.product_id
    LEFT JOIN bom_details bd ON bd.bom_id = bm.id AND bd.deleted_at IS NULL
    WHERE bm.deleted_at IS NULL
    GROUP BY bm.id, p.code, p.name, bm.version, bm.status
    ORDER BY detail_count DESC
    LIMIT 10
  `);
  console.log('TOP_BOMS', JSON.stringify(topBoms, null, 2));

  // materials marked has_bom vs actual
  const [hasBomConsistency] = await conn.query(`
    SELECT
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM bom_masters bm WHERE bm.product_id = m.id AND bm.deleted_at IS NULL AND bm.status = 1
      ) THEN 1 ELSE 0 END) AS materials_with_active_bom,
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM bom_masters bm WHERE bm.product_id = m.id AND bm.deleted_at IS NULL
      ) THEN 1 ELSE 0 END) AS materials_with_any_bom,
      COUNT(*) AS total_materials
    FROM materials m
    WHERE m.deleted_at IS NULL
  `);
  console.log('HAS_BOM_CONSISTENCY', JSON.stringify(hasBomConsistency[0], null, 2));

  // orphan details / problem samples
  const [problemMasters] = await conn.query(`
    SELECT bm.id, bm.product_id, p.code, p.name, bm.version, bm.status
    FROM bom_masters bm
    LEFT JOIN materials p ON p.id = bm.product_id
    WHERE bm.deleted_at IS NULL
      AND (bm.product_id IS NULL OR p.id IS NULL OR p.deleted_at IS NOT NULL)
    ORDER BY bm.id
    LIMIT 20
  `);
  console.log('PROBLEM_MASTERS', JSON.stringify(problemMasters, null, 2));

  const [problemDetails] = await conn.query(`
    SELECT bd.id, bd.bom_id, bd.material_id, m.code AS material_code, m.name AS material_name,
           bd.quantity, bd.unit_id, u.name AS unit_name, bm.product_id, p.code AS product_code
    FROM bom_details bd
    LEFT JOIN bom_masters bm ON bm.id = bd.bom_id
    LEFT JOIN materials m ON m.id = bd.material_id
    LEFT JOIN materials p ON p.id = bm.product_id
    LEFT JOIN units u ON u.id = bd.unit_id
    WHERE bd.deleted_at IS NULL
      AND (
        bd.bom_id IS NULL OR bm.id IS NULL OR bm.deleted_at IS NOT NULL
        OR bd.material_id IS NULL OR m.id IS NULL OR m.deleted_at IS NOT NULL
        OR bd.unit_id IS NULL OR u.id IS NULL
        OR bd.quantity IS NULL OR bd.quantity <= 0
      )
    ORDER BY bd.id
    LIMIT 30
  `);
  console.log('PROBLEM_DETAILS', JSON.stringify(problemDetails, null, 2));

  // good samples
  const [goodSamples] = await conn.query(`
    SELECT bm.id AS bom_id, p.code AS product_code, p.name AS product_name, bm.version, bm.status,
           COUNT(bd.id) AS detail_count,
           SUM(bd.unit_id IS NULL) AS missing_units,
           SUM(bd.quantity IS NULL OR bd.quantity <= 0) AS bad_qty
    FROM bom_masters bm
    JOIN materials p ON p.id = bm.product_id
    LEFT JOIN bom_details bd ON bd.bom_id = bm.id AND bd.deleted_at IS NULL
    WHERE bm.deleted_at IS NULL
      AND p.code IN ('100601001','100104001','3001002002','100601003')
    GROUP BY bm.id, p.code, p.name, bm.version, bm.status
    ORDER BY p.code, bm.id
  `);
  console.log('GOOD_SAMPLES', JSON.stringify(goodSamples, null, 2));

  // sample detail lines for one product
  const [sampleLines] = await conn.query(`
    SELECT p.code AS product_code, p.name AS product_name,
           m.code AS component_code, m.name AS component_name,
           bd.quantity, u.name AS unit_name, bd.sequence
    FROM bom_masters bm
    JOIN materials p ON p.id = bm.product_id
    JOIN bom_details bd ON bd.bom_id = bm.id AND bd.deleted_at IS NULL
    JOIN materials m ON m.id = bd.material_id
    LEFT JOIN units u ON u.id = bd.unit_id
    WHERE bm.deleted_at IS NULL AND p.code = '100601001'
    ORDER BY bd.sequence, bd.id
    LIMIT 15
  `);
  console.log('SAMPLE_LINES_100601001', JSON.stringify(sampleLines, null, 2));

  // unit mismatch: detail unit vs material unit
  const [unitMismatch] = await conn.query(`
    SELECT COUNT(*) cnt
    FROM bom_details bd
    JOIN materials m ON m.id = bd.material_id
    WHERE bd.deleted_at IS NULL
      AND bd.unit_id IS NOT NULL
      AND m.unit_id IS NOT NULL
      AND bd.unit_id <> m.unit_id
  `);
  console.log('UNIT_MISMATCH_VS_MATERIAL', JSON.stringify(unitMismatch[0], null, 2));

  // readiness score for usable bom
  const [ready] = await conn.query(`
    SELECT
      SUM(
        bm.product_id IS NOT NULL
        AND p.id IS NOT NULL AND p.deleted_at IS NULL
        AND bm.status = 1
        AND EXISTS (
          SELECT 1 FROM bom_details bd
          WHERE bd.bom_id = bm.id AND bd.deleted_at IS NULL
            AND bd.material_id IS NOT NULL
            AND bd.quantity IS NOT NULL AND bd.quantity > 0
            AND bd.unit_id IS NOT NULL
        )
      ) AS ready_bom_count,
      COUNT(*) AS total_active_bom
    FROM bom_masters bm
    LEFT JOIN materials p ON p.id = bm.product_id
    WHERE bm.deleted_at IS NULL
  `);
  console.log('READY', JSON.stringify(ready[0], null, 2));

  // detail line readiness
  const [detailReady] = await conn.query(`
    SELECT
      SUM(
        bd.bom_id IS NOT NULL AND bm.id IS NOT NULL AND bm.deleted_at IS NULL
        AND bd.material_id IS NOT NULL AND m.id IS NOT NULL AND m.deleted_at IS NULL
        AND bd.quantity IS NOT NULL AND bd.quantity > 0
        AND bd.unit_id IS NOT NULL AND u.id IS NOT NULL
      ) AS ready_detail_count,
      COUNT(*) AS total_active_detail
    FROM bom_details bd
    LEFT JOIN bom_masters bm ON bm.id = bd.bom_id
    LEFT JOIN materials m ON m.id = bd.material_id
    LEFT JOIN units u ON u.id = bd.unit_id
    WHERE bd.deleted_at IS NULL
  `);
  console.log('DETAIL_READY', JSON.stringify(detailReady[0], null, 2));

  await conn.end();
})().catch(e => { console.error(e); process.exit(1); });
