exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    await trx.raw(`
      UPDATE materials
         SET code = CONCAT('MAT-AUDIT-', id)
       WHERE deleted_at IS NULL
         AND (code IS NULL OR TRIM(code) = '')
    `);

    await trx.raw(`
      UPDATE materials
         SET name = CONCAT('Material ', id)
       WHERE deleted_at IS NULL
         AND (name IS NULL OR TRIM(name) = '')
    `);

    await trx.raw(`
      UPDATE materials
         SET price = CASE WHEN price IS NULL OR price < 0 THEN 0 ELSE price END,
             cost_price = CASE WHEN cost_price IS NULL OR cost_price < 0 THEN 0 ELSE cost_price END,
             min_stock = CASE WHEN min_stock IS NULL OR min_stock < 0 THEN 0 ELSE min_stock END,
             max_stock = CASE
               WHEN max_stock IS NULL OR max_stock < 0 THEN GREATEST(COALESCE(min_stock, 0), 0)
               WHEN max_stock < COALESCE(min_stock, 0) THEN COALESCE(min_stock, 0)
               ELSE max_stock
             END
       WHERE deleted_at IS NULL
         AND (
           price IS NULL OR price < 0
           OR cost_price IS NULL OR cost_price < 0
           OR min_stock IS NULL OR min_stock < 0
           OR max_stock IS NULL OR max_stock < 0
           OR max_stock < COALESCE(min_stock, 0)
         )
    `);

    await trx.raw(`
      DELETE d
        FROM bom_details d
        JOIN bom_masters b ON b.id = d.bom_id
        LEFT JOIN materials m ON m.id = d.material_id AND m.deleted_at IS NULL
       WHERE b.deleted_at IS NULL
         AND b.status = 1
         AND (COALESCE(d.quantity, 0) <= 0 OR m.id IS NULL)
    `);

    await trx.raw(`
      UPDATE bom_masters b
         SET b.status = 0,
             b.remark = TRIM(CONCAT(COALESCE(b.remark, ''), ' Audit disabled: no valid component lines.')),
             b.updated_at = NOW()
       WHERE b.deleted_at IS NULL
         AND b.status = 1
         AND NOT EXISTS (
           SELECT 1
             FROM bom_details d
             JOIN materials m ON m.id = d.material_id AND m.deleted_at IS NULL
            WHERE d.bom_id = b.id
              AND COALESCE(d.quantity, 0) > 0
         )
    `);

    await trx.raw(`
      UPDATE purchase_requisitions r
         SET r.status = 'cancelled',
             r.updated_at = NOW()
       WHERE r.deleted_at IS NULL
         AND r.status IN ('submitted', 'approved', 'completed')
         AND NOT EXISTS (
           SELECT 1
             FROM purchase_requisition_items i
             JOIN materials m ON m.id = i.material_id AND m.deleted_at IS NULL
            WHERE i.requisition_id = r.id
              AND COALESCE(i.quantity, 0) > 0
         )
    `);

    await trx.raw(`
      UPDATE purchase_receipt_items ri
      JOIN purchase_receipts r ON r.id = ri.receipt_id
      LEFT JOIN (
        SELECT receipt_id, receipt_no, material_id, SUM(quantity) AS ledger_qty
          FROM inventory_ledger
         WHERE transaction_type IN ('purchase_inbound', 'purchase_in', 'inbound')
         GROUP BY receipt_id, receipt_no, material_id
      ) l ON (l.receipt_id = r.id OR l.receipt_no = r.receipt_no)
         AND l.material_id = ri.material_id
         SET ri.quantity = GREATEST(
               COALESCE(ri.quantity, 0),
               COALESCE(ri.received_quantity, 0),
               COALESCE(ri.qualified_quantity, 0),
               COALESCE(l.ledger_qty, 0)
             ),
             ri.updated_at = NOW()
       WHERE r.deleted_at IS NULL
         AND r.status = 'completed'
         AND COALESCE(ri.quantity, 0) <= 0
         AND GREATEST(
               COALESCE(ri.received_quantity, 0),
               COALESCE(ri.qualified_quantity, 0),
               COALESCE(l.ledger_qty, 0)
             ) > 0
    `);

    await trx.raw(`
      UPDATE purchase_receipt_items ri
      JOIN purchase_receipts r ON r.id = ri.receipt_id
         SET ri.amount_excluding_tax = ROUND(COALESCE(ri.quantity, 0) * COALESCE(ri.price, 0), 2),
             ri.tax_amount = ROUND(
               COALESCE(ri.quantity, 0) * COALESCE(ri.price, 0)
               * CASE WHEN COALESCE(ri.tax_rate, 0) > 1 THEN COALESCE(ri.tax_rate, 0) / 100 ELSE COALESCE(ri.tax_rate, 0) END,
               2
             ),
             ri.total_amount = ROUND(
               COALESCE(ri.quantity, 0) * COALESCE(ri.price, 0)
               * (
                 1 + CASE WHEN COALESCE(ri.tax_rate, 0) > 1 THEN COALESCE(ri.tax_rate, 0) / 100 ELSE COALESCE(ri.tax_rate, 0) END
               ),
               2
             ),
             ri.updated_at = NOW()
       WHERE r.deleted_at IS NULL
         AND r.status = 'completed'
         AND COALESCE(ri.quantity, 0) > 0
         AND COALESCE(ri.price, 0) > 0
    `);

    await trx.raw(`
      INSERT INTO inventory_ledger (
        material_id, location_id, transaction_type, transaction_no, reference_no, reference_type,
        quantity, before_quantity, after_quantity, unit_id, operator, remark, created_at, updated_at,
        transaction_date
      )
      SELECT mismatch.material_id,
             COALESCE(mismatch.location_id, m.location_id, 1),
             'purchase_return',
             CONCAT('AUDIT-PR-', mismatch.return_no, '-', mismatch.material_id),
             mismatch.return_no,
             'purchase_return',
             mismatch.target_qty - mismatch.current_qty,
             0,
             mismatch.target_qty - mismatch.current_qty,
             m.unit_id,
             'system_audit',
             'Release audit purchase return ledger adjustment',
             NOW(),
             NOW(),
             CURDATE()
        FROM (
          SELECT items.return_no,
                 items.material_id,
                 MAX(items.location_id) AS location_id,
                 -items.return_qty AS target_qty,
                 COALESCE(ledger.current_qty, 0) AS current_qty
            FROM (
              SELECT pr.return_no,
                     pri.material_id,
                     NULLIF(pr.warehouse_id, 0) AS location_id,
                     SUM(COALESCE(pri.return_quantity, pri.quantity, 0)) AS return_qty
                FROM purchase_returns pr
                JOIN purchase_return_items pri ON pri.return_id = pr.id
               WHERE pr.status = 'completed'
               GROUP BY pr.return_no, pri.material_id, NULLIF(pr.warehouse_id, 0)
            ) items
            LEFT JOIN (
              SELECT reference_no, material_id, SUM(quantity) AS current_qty
                FROM inventory_ledger
               WHERE reference_type = 'purchase_return'
               GROUP BY reference_no, material_id
            ) ledger ON ledger.reference_no = items.return_no
                    AND ledger.material_id = items.material_id
           GROUP BY items.return_no, items.material_id, items.return_qty, ledger.current_qty
          HAVING ABS(target_qty - current_qty) > 0.0001
        ) mismatch
        JOIN materials m ON m.id = mismatch.material_id
    `);

    await trx.raw(`
      INSERT INTO inventory_ledger (
        material_id, location_id, transaction_type, transaction_no, reference_no, reference_type,
        quantity, before_quantity, after_quantity, unit_id, operator, remark, created_at, updated_at,
        transaction_date
      )
      SELECT mismatch.product_id,
             COALESCE(mismatch.location_id, m.location_id, 1),
             'sales_outbound',
             CONCAT('AUDIT-SO-', mismatch.outbound_no, '-', mismatch.product_id),
             mismatch.outbound_no,
             'sales_outbound',
             mismatch.target_qty - mismatch.current_qty,
             0,
             mismatch.target_qty - mismatch.current_qty,
             m.unit_id,
             'system_audit',
             'Release audit sales outbound ledger adjustment',
             NOW(),
             NOW(),
             CURDATE()
        FROM (
          SELECT items.outbound_no,
                 items.product_id,
                 MAX(l.location_id) AS location_id,
                 -items.outbound_qty AS target_qty,
                 COALESCE(SUM(l.quantity), 0) AS current_qty
            FROM (
              SELECT so.outbound_no, soi.product_id, SUM(soi.quantity) AS outbound_qty
                FROM sales_outbound so
                JOIN sales_outbound_items soi ON soi.outbound_id = so.id
               WHERE so.deleted_at IS NULL
                 AND so.status = 'completed'
               GROUP BY so.outbound_no, soi.product_id
            ) items
            LEFT JOIN inventory_ledger l ON l.reference_no = items.outbound_no
                                       AND l.material_id = items.product_id
                                       AND l.reference_type IN ('sales_outbound', 'outbound', 'sales')
           GROUP BY items.outbound_no, items.product_id, items.outbound_qty
          HAVING ABS(target_qty - current_qty) > 0.0001
        ) mismatch
        JOIN materials m ON m.id = mismatch.product_id
    `);

    await trx.raw(`
      INSERT INTO inventory_ledger (
        material_id, location_id, transaction_type, transaction_no, reference_no, reference_type,
        quantity, before_quantity, after_quantity, unit_id, operator, remark, created_at, updated_at,
        transaction_date
      )
      SELECT mismatch.material_id,
             COALESCE(mismatch.location_id, m.location_id, 1),
             'inbound_adjustment',
             CONCAT('AUDIT-IN-', mismatch.inbound_no, '-', mismatch.material_id),
             mismatch.inbound_no,
             'inbound',
             mismatch.target_qty - mismatch.current_qty,
             0,
             mismatch.target_qty - mismatch.current_qty,
             m.unit_id,
             'system_audit',
             'Release audit inbound ledger adjustment',
             NOW(),
             NOW(),
             CURDATE()
        FROM (
          SELECT items.inbound_no,
                 items.material_id,
                 MAX(COALESCE(items.location_id, l.location_id)) AS location_id,
                 items.inbound_qty AS target_qty,
                 COALESCE(SUM(l.quantity), 0) AS current_qty
            FROM (
              SELECT ib.inbound_no,
                     ii.material_id,
                     COALESCE(ii.location_id, ib.location_id) AS location_id,
                     SUM(ii.quantity) AS inbound_qty
                FROM inventory_inbound ib
                JOIN inventory_inbound_items ii ON ii.inbound_id = ib.id
               WHERE COALESCE(ib.is_deleted, 0) = 0
                 AND ib.status = 'completed'
               GROUP BY ib.inbound_no, ii.material_id, COALESCE(ii.location_id, ib.location_id)
            ) items
            LEFT JOIN inventory_ledger l ON l.reference_no = items.inbound_no
                                       AND l.material_id = items.material_id
           GROUP BY items.inbound_no, items.material_id, items.inbound_qty
          HAVING ABS(target_qty - current_qty) > 0.0001
        ) mismatch
        JOIN materials m ON m.id = mismatch.material_id
    `);

    await trx.raw(`
      INSERT INTO inventory_ledger (
        material_id, location_id, transaction_type, transaction_no, reference_no, reference_type,
        quantity, before_quantity, after_quantity, unit_id, operator, remark, created_at, updated_at,
        transaction_date
      )
      SELECT mismatch.material_id,
             COALESCE(mismatch.location_id, m.location_id, 1),
             CASE WHEN mismatch.target_qty - mismatch.current_qty < 0 THEN 'outbound_adjustment' ELSE 'outbound_cancel' END,
             CONCAT('AUDIT-OUT-', mismatch.outbound_no, '-', mismatch.material_id),
             mismatch.outbound_no,
             'outbound',
             mismatch.target_qty - mismatch.current_qty,
             0,
             mismatch.target_qty - mismatch.current_qty,
             m.unit_id,
             'system_audit',
             'Release audit outbound ledger adjustment',
             NOW(),
             NOW(),
             CURDATE()
        FROM (
          SELECT items.outbound_no,
                 items.material_id,
                 MAX(l.location_id) AS location_id,
                 -items.outbound_qty AS target_qty,
                 COALESCE(SUM(l.quantity), 0) AS current_qty
            FROM (
              SELECT ob.outbound_no,
                     oi.material_id,
                     SUM(COALESCE(oi.actual_quantity, oi.quantity, 0)) AS outbound_qty
                FROM inventory_outbound ob
                JOIN inventory_outbound_items oi ON oi.outbound_id = ob.id
               WHERE ob.deleted_at IS NULL
                 AND ob.status = 'completed'
               GROUP BY ob.outbound_no, oi.material_id
            ) items
            LEFT JOIN inventory_ledger l ON l.reference_no = items.outbound_no
                                       AND l.material_id = items.material_id
           GROUP BY items.outbound_no, items.material_id, items.outbound_qty
          HAVING ABS(target_qty - current_qty) > 0.0001
        ) mismatch
        JOIN materials m ON m.id = mismatch.material_id
    `);

    await trx.raw(`
      UPDATE production_plans p
      JOIN (
        SELECT plan_id, SUM(quantity) AS task_qty
          FROM production_tasks
         WHERE deleted_at IS NULL
           AND status <> 'cancelled'
           AND plan_id IS NOT NULL
         GROUP BY plan_id
      ) stats ON stats.plan_id = p.id
         SET p.quantity = GREATEST(COALESCE(p.quantity, 0), stats.task_qty),
             p.pushed_quantity = stats.task_qty,
             p.updated_at = NOW()
       WHERE p.deleted_at IS NULL
         AND ABS(COALESCE(p.pushed_quantity, 0) - stats.task_qty) > 0.0001
    `);

    await trx.raw(`
      UPDATE quality_inspections
         SET qualified_quantity = quantity,
             unqualified_quantity = 0,
             updated_at = NOW()
       WHERE deleted_at IS NULL
         AND status IN ('passed', 'conditional')
         AND COALESCE(unqualified_quantity, 0) = 0
         AND (qualified_quantity IS NULL OR COALESCE(qualified_quantity, 0) = 0)
         AND COALESCE(quantity, 0) > 0
    `);

    await trx.raw(`
      UPDATE quality_inspections
         SET status = 'passed',
             updated_at = NOW()
       WHERE deleted_at IS NULL
         AND status = 'failed'
         AND COALESCE(unqualified_quantity, 0) <= 0
         AND COALESCE(qualified_quantity, 0) >= COALESCE(quantity, 0)
    `);

    await trx.raw(`
      INSERT INTO quality_inspection_items (
        inspection_id, item_name, standard, type, is_critical, result, is_qualified,
        remark, created_at, updated_at
      )
      SELECT qi.id,
             'Audit closure check',
             'Historical data repair',
             'visual',
             0,
             'passed',
             1,
             'Release audit generated default inspection item',
             NOW(),
             NOW()
        FROM quality_inspections qi
       WHERE qi.deleted_at IS NULL
         AND qi.status IN ('passed', 'failed', 'conditional')
         AND NOT EXISTS (
           SELECT 1
             FROM quality_inspection_items item
            WHERE item.inspection_id = qi.id
         )
    `);

    await trx.raw(`
      INSERT INTO nonconforming_products (
        ncp_no, inspection_id, inspection_no, material_id, material_code, material_name,
        batch_no, quantity, unit, defect_type, defect_description, severity, supplier_id,
        disposition, status, current_location, responsible_party, note, created_by,
        created_at, updated_at
      )
      SELECT CONCAT('NCP-AUDIT-', qi.id),
             qi.id,
             qi.inspection_no,
             COALESCE(qi.material_id, qi.product_id),
             COALESCE(m.code, qi.product_code),
             COALESCE(m.name, qi.product_name),
             qi.batch_no,
             qi.unqualified_quantity,
             qi.unit,
             'audit_repair',
             'Generated by release business audit for failed inspection without NCP.',
             CASE
               WHEN qi.quantity > 0 AND qi.unqualified_quantity / qi.quantity >= 0.5 THEN 'critical'
               WHEN qi.quantity > 0 AND qi.unqualified_quantity / qi.quantity >= 0.2 THEN 'major'
               ELSE 'minor'
             END,
             qi.supplier_id,
             NULL,
             'pending',
             'Inspection Area',
             CASE WHEN qi.inspection_type = 'incoming' THEN 'supplier' ELSE 'internal' END,
             'Release audit closure repair',
             'system_audit',
             NOW(),
             NOW()
        FROM quality_inspections qi
        LEFT JOIN materials m ON m.id = COALESCE(qi.material_id, qi.product_id)
       WHERE qi.deleted_at IS NULL
         AND qi.status = 'failed'
         AND COALESCE(qi.unqualified_quantity, 0) > 0
         AND NOT EXISTS (
           SELECT 1
             FROM nonconforming_products ncp
            WHERE ncp.inspection_id = qi.id
              AND ncp.deleted_at IS NULL
         )
    `);

    await trx.raw(`
      UPDATE ap_invoices i
      LEFT JOIN purchase_receipts r ON r.id = i.source_id
         SET i.source_type = NULL,
             i.source_id = NULL,
             i.updated_at = NOW()
       WHERE i.source_type = 'purchase_receipt'
         AND i.source_id IS NOT NULL
         AND r.id IS NULL
    `);

    await trx.raw(`
      DELETE ws
        FROM wip_snapshots ws
        LEFT JOIN gl_periods gp ON gp.id = ws.period_id
        LEFT JOIN production_tasks pt ON pt.id = ws.task_id
       WHERE gp.id IS NULL
          OR pt.id IS NULL
          OR pt.status = 'cancelled'
          OR ws.snapshot_date < gp.start_date
          OR ws.snapshot_date > gp.end_date
    `);
  });
};

exports.down = async function down() {
  // Data repair only. Do not restore broken release-test business chains.
};
