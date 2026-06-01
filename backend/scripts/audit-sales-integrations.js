#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');

const rootDir = path.resolve(__dirname, '..', '..');
const outDir = path.join(rootDir, 'docs');
const jsonPath = path.join(outDir, 'sales-integration-audit.json');
const mdPath = path.join(outDir, 'sales-integration-audit.md');

const rules = [
  {
    id: 'sales.document_numbers_unique',
    severity: 'critical',
    description: 'Active sales document numbers must be unique within each document type.',
    sql: `
      SELECT CAST('sales_quotation' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS document_type,
             quotation_no COLLATE utf8mb4_unicode_ci AS document_no, COUNT(*) AS duplicate_count
      FROM sales_quotations
      WHERE deleted_at IS NULL
      GROUP BY quotation_no
      HAVING COUNT(*) > 1
      UNION ALL
      SELECT CAST('sales_order' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS document_type,
             order_no COLLATE utf8mb4_unicode_ci AS document_no, COUNT(*) AS duplicate_count
      FROM sales_orders
      WHERE deleted_at IS NULL
      GROUP BY order_no
      HAVING COUNT(*) > 1
      UNION ALL
      SELECT CAST('sales_outbound' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS document_type,
             outbound_no COLLATE utf8mb4_unicode_ci AS document_no, COUNT(*) AS duplicate_count
      FROM sales_outbound
      WHERE deleted_at IS NULL
      GROUP BY outbound_no
      HAVING COUNT(*) > 1
      UNION ALL
      SELECT CAST('sales_return' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS document_type,
             return_no COLLATE utf8mb4_unicode_ci AS document_no, COUNT(*) AS duplicate_count
      FROM sales_returns
      WHERE deleted_at IS NULL
      GROUP BY return_no
      HAVING COUNT(*) > 1
      UNION ALL
      SELECT CAST('sales_exchange' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS document_type,
             exchange_no COLLATE utf8mb4_unicode_ci AS document_no, COUNT(*) AS duplicate_count
      FROM sales_exchanges
      WHERE deleted_at IS NULL
      GROUP BY exchange_no
      HAVING COUNT(*) > 1
    `,
  },
  {
    id: 'sales.headers_reference_existing_customers',
    severity: 'critical',
    description: 'Sales quotations, orders, and exchanges must reference active customers when customer ids are present.',
    sql: `
      SELECT CAST('quotation' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS document_type,
             sq.id, sq.quotation_no COLLATE utf8mb4_unicode_ci AS document_no, sq.customer_id
      FROM sales_quotations sq
      LEFT JOIN customers c ON c.id = sq.customer_id AND c.deleted_at IS NULL
      WHERE sq.deleted_at IS NULL AND c.id IS NULL
      UNION ALL
      SELECT CAST('order' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS document_type,
             so.id, so.order_no COLLATE utf8mb4_unicode_ci AS document_no, so.customer_id
      FROM sales_orders so
      LEFT JOIN customers c ON c.id = so.customer_id AND c.deleted_at IS NULL
      WHERE so.deleted_at IS NULL AND c.id IS NULL
      UNION ALL
      SELECT CAST('exchange' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS document_type,
             se.id, se.exchange_no COLLATE utf8mb4_unicode_ci AS document_no, se.customer_id
      FROM sales_exchanges se
      LEFT JOIN customers c ON c.id = se.customer_id AND c.deleted_at IS NULL
      WHERE se.deleted_at IS NULL AND se.customer_id IS NOT NULL AND c.id IS NULL
    `,
  },
  {
    id: 'sales.quotation_items_valid',
    severity: 'critical',
    description: 'Quotation items must reference active materials and reconcile line amounts.',
    sql: `
      SELECT 'missing_material' AS issue, sqi.id, sqi.quotation_id, sqi.product_id,
             sqi.quantity, sqi.unit_price, sqi.total_price
      FROM sales_quotation_items sqi
      JOIN sales_quotations sq ON sq.id = sqi.quotation_id AND sq.deleted_at IS NULL
      LEFT JOIN materials m ON m.id = sqi.product_id AND m.deleted_at IS NULL
      WHERE m.id IS NULL
      UNION ALL
      SELECT 'amount_mismatch' AS issue, sqi.id, sqi.quotation_id, sqi.product_id,
             sqi.quantity, sqi.unit_price, sqi.total_price
      FROM sales_quotation_items sqi
      JOIN sales_quotations sq ON sq.id = sqi.quotation_id AND sq.deleted_at IS NULL
      WHERE ABS(COALESCE(sqi.total_price, 0) - ROUND(COALESCE(sqi.quantity, 0) * COALESCE(sqi.unit_price, 0), 2)) > 0.05
    `,
  },
  {
    id: 'sales.quotation_headers_match_items',
    severity: 'high',
    description: 'Quotation totals must match quotation item totals.',
    sql: `
      SELECT *
      FROM (
        SELECT sq.id, sq.quotation_no, sq.total_amount,
               ROUND(COALESCE(SUM(sqi.total_price), 0), 2) AS item_total
        FROM sales_quotations sq
        LEFT JOIN sales_quotation_items sqi ON sqi.quotation_id = sq.id
        WHERE sq.deleted_at IS NULL
        GROUP BY sq.id, sq.quotation_no, sq.total_amount
      ) x
      WHERE ABS(COALESCE(total_amount, 0) - item_total) > 0.05
    `,
  },
  {
    id: 'sales.orders_reference_valid_quotations',
    severity: 'high',
    description: 'Sales orders linked to quotations must reference active quotations from the same customer.',
    sql: `
      SELECT so.id, so.order_no, so.customer_id, so.quotation_id
      FROM sales_orders so
      LEFT JOIN sales_quotations sq ON sq.id = so.quotation_id AND sq.deleted_at IS NULL
      WHERE so.deleted_at IS NULL
        AND so.quotation_id IS NOT NULL
        AND (sq.id IS NULL OR sq.customer_id <> so.customer_id)
    `,
  },
  {
    id: 'sales.orders_have_valid_items_and_amounts',
    severity: 'critical',
    description: 'Non-cancelled sales orders must have valid material lines and reconciled line amounts.',
    sql: `
      SELECT 'missing_items' AS issue, so.id, so.order_no, NULL AS item_id, NULL AS material_id,
             NULL AS quantity, NULL AS unit_price, NULL AS amount
      FROM sales_orders so
      WHERE so.deleted_at IS NULL
        AND so.status <> 'cancelled'
        AND NOT EXISTS (SELECT 1 FROM sales_order_items soi WHERE soi.order_id = so.id)
      UNION ALL
      SELECT 'missing_material' AS issue, so.id, so.order_no, soi.id AS item_id, soi.material_id,
             soi.quantity, soi.unit_price, soi.amount
      FROM sales_order_items soi
      JOIN sales_orders so ON so.id = soi.order_id AND so.deleted_at IS NULL
      LEFT JOIN materials m ON m.id = soi.material_id AND m.deleted_at IS NULL
      WHERE m.id IS NULL
      UNION ALL
      SELECT 'amount_mismatch' AS issue, so.id, so.order_no, soi.id AS item_id, soi.material_id,
             soi.quantity, soi.unit_price, soi.amount
      FROM sales_order_items soi
      JOIN sales_orders so ON so.id = soi.order_id AND so.deleted_at IS NULL
      WHERE ABS(COALESCE(soi.amount, 0) - ROUND(COALESCE(soi.quantity, 0) * COALESCE(soi.unit_price, 0), 2)) > 0.05
    `,
  },
  {
    id: 'sales.order_headers_match_items',
    severity: 'critical',
    description: 'Sales order subtotal, tax, and total must match active order item sums.',
    sql: `
      SELECT *
      FROM (
        SELECT so.id, so.order_no, so.subtotal, so.tax_amount, so.total_amount,
               ROUND(COALESCE(SUM(soi.amount), 0), 2) AS item_subtotal,
               ROUND(COALESCE(SUM(ROUND(soi.amount * CASE WHEN COALESCE(soi.tax_percent, 0) > 1 THEN soi.tax_percent / 100 ELSE COALESCE(soi.tax_percent, 0) END, 2)), 0), 2) AS item_tax
        FROM sales_orders so
        LEFT JOIN sales_order_items soi ON soi.order_id = so.id
        WHERE so.deleted_at IS NULL
        GROUP BY so.id, so.order_no, so.subtotal, so.tax_amount, so.total_amount
      ) x
      WHERE ABS(COALESCE(subtotal, 0) - item_subtotal) > 0.05
         OR ABS(COALESCE(tax_amount, 0) - item_tax) > 0.05
         OR ABS(COALESCE(total_amount, 0) - ROUND(item_subtotal + item_tax, 2)) > 0.05
    `,
  },
  {
    id: 'sales.outbound_references_valid_orders',
    severity: 'critical',
    description: 'Sales outbound headers and lines must reference active source orders.',
    sql: `
      SELECT 'header_order_missing' AS issue, so.id, so.outbound_no, so.order_id AS order_id, NULL AS item_id
      FROM sales_outbound so
      LEFT JOIN sales_orders ord ON ord.id = so.order_id AND ord.deleted_at IS NULL
      WHERE so.deleted_at IS NULL
        AND COALESCE(so.is_multi_order, 0) = 0
        AND so.order_id IS NOT NULL
        AND ord.id IS NULL
      UNION ALL
      SELECT 'line_order_missing' AS issue, so.id, so.outbound_no, soi.source_order_id AS order_id, soi.id AS item_id
      FROM sales_outbound_items soi
      JOIN sales_outbound so ON so.id = soi.outbound_id AND so.deleted_at IS NULL
      LEFT JOIN sales_orders ord ON ord.id = COALESCE(soi.source_order_id, so.order_id) AND ord.deleted_at IS NULL
      WHERE so.status <> 'cancelled'
        AND COALESCE(soi.source_order_id, so.order_id) IS NOT NULL
        AND ord.id IS NULL
      UNION ALL
      SELECT 'line_without_source_order' AS issue, so.id, so.outbound_no, NULL AS order_id, soi.id AS item_id
      FROM sales_outbound_items soi
      JOIN sales_outbound so ON so.id = soi.outbound_id AND so.deleted_at IS NULL
      WHERE so.status IN ('processing', 'completed')
        AND COALESCE(soi.source_order_id, so.order_id) IS NULL
    `,
  },
  {
    id: 'sales.outbound_items_valid_and_within_order',
    severity: 'critical',
    description: 'Sales outbound items must reference active materials, source order lines, and not over-ship ordered quantities.',
    sql: `
      SELECT 'missing_material' AS issue, so.id, so.outbound_no, soi.id AS item_id,
             COALESCE(soi.source_order_id, so.order_id) AS order_id, soi.product_id, soi.quantity, NULL AS ordered_quantity
      FROM sales_outbound_items soi
      JOIN sales_outbound so ON so.id = soi.outbound_id AND so.deleted_at IS NULL
      LEFT JOIN materials m ON m.id = soi.product_id AND m.deleted_at IS NULL
      WHERE so.status <> 'cancelled' AND m.id IS NULL
      UNION ALL
      SELECT 'missing_order_line' AS issue, so.id, so.outbound_no, soi.id AS item_id,
             COALESCE(soi.source_order_id, so.order_id) AS order_id, soi.product_id, soi.quantity, NULL AS ordered_quantity
      FROM sales_outbound_items soi
      JOIN sales_outbound so ON so.id = soi.outbound_id AND so.deleted_at IS NULL
      LEFT JOIN sales_order_items order_item
        ON order_item.order_id = COALESCE(soi.source_order_id, so.order_id)
       AND order_item.material_id = soi.product_id
      WHERE so.status IN ('processing', 'completed')
        AND COALESCE(soi.source_order_id, so.order_id) IS NOT NULL
        AND order_item.id IS NULL
      UNION ALL
      SELECT 'over_shipped' AS issue, NULL AS id, NULL AS outbound_no, NULL AS item_id,
             shipped.order_id, shipped.product_id, shipped.shipped_quantity AS quantity, order_item.quantity AS ordered_quantity
      FROM (
        SELECT COALESCE(soi.source_order_id, so.order_id) AS order_id, soi.product_id,
               SUM(COALESCE(soi.quantity, 0)) AS shipped_quantity
        FROM sales_outbound_items soi
        JOIN sales_outbound so ON so.id = soi.outbound_id
        WHERE so.deleted_at IS NULL
          AND so.status IN ('processing', 'completed')
          AND COALESCE(soi.source_order_id, so.order_id) IS NOT NULL
        GROUP BY COALESCE(soi.source_order_id, so.order_id), soi.product_id
      ) shipped
      JOIN sales_order_items order_item
        ON order_item.order_id = shipped.order_id
       AND order_item.material_id = shipped.product_id
      WHERE shipped.shipped_quantity - COALESCE(order_item.quantity, 0) > 0.01
    `,
  },
  {
    id: 'sales.outbound_headers_match_items',
    severity: 'critical',
    description: 'Sales outbound totals must match outbound item amounts.',
    sql: `
      SELECT *
      FROM (
        SELECT so.id, so.outbound_no, so.total_amount,
               ROUND(COALESCE(SUM(COALESCE(soi.amount, ROUND(COALESCE(soi.quantity, 0) * COALESCE(soi.price, 0), 2))), 0), 2) AS item_total
        FROM sales_outbound so
        LEFT JOIN sales_outbound_items soi ON soi.outbound_id = so.id
        WHERE so.deleted_at IS NULL
        GROUP BY so.id, so.outbound_no, so.total_amount
      ) x
      WHERE ABS(COALESCE(total_amount, 0) - item_total) > 0.05
    `,
  },
  {
    id: 'sales.completed_outbound_has_inventory_ledger',
    severity: 'critical',
    description: 'Completed sales outbound quantities must be reflected by negative inventory ledger rows.',
    sql: `
      SELECT x.outbound_id, x.outbound_no, x.product_id, x.outbound_quantity, x.ledger_quantity
      FROM (
        SELECT so.id AS outbound_id, so.outbound_no, soi.product_id,
               ROUND(SUM(COALESCE(soi.quantity, 0)), 2) AS outbound_quantity,
               ROUND(ABS(COALESCE((
                 SELECT SUM(il.quantity)
                 FROM inventory_ledger il
                 WHERE il.reference_type = 'sales_outbound'
                   AND il.reference_no = so.outbound_no
                   AND il.material_id = soi.product_id
                   AND il.transaction_type = 'sales_outbound'
               ), 0)), 2) AS ledger_quantity
        FROM sales_outbound so
        JOIN sales_outbound_items soi ON soi.outbound_id = so.id
        WHERE so.deleted_at IS NULL
          AND so.status = 'completed'
        GROUP BY so.id, so.outbound_no, soi.product_id
      ) x
      WHERE ABS(outbound_quantity - ledger_quantity) > 0.01
    `,
  },
  {
    id: 'sales.order_status_matches_shipping',
    severity: 'high',
    description: 'Sales order statuses should agree with net shipped quantities.',
    sql: `
      SELECT *
      FROM (
        SELECT so.id, so.order_no, so.status,
               ROUND(COALESCE(SUM(soi.quantity), 0), 2) AS ordered_quantity,
               ROUND(COALESCE(SUM(GREATEST(COALESCE(ship.shipped_quantity, 0) - COALESCE(ret.returned_quantity, 0), 0)), 0), 2) AS shipped_quantity,
               CASE
                 WHEN COALESCE(SUM(GREATEST(COALESCE(ship.shipped_quantity, 0) - COALESCE(ret.returned_quantity, 0), 0)), 0) <= 0 THEN 'unshipped'
                 WHEN COALESCE(SUM(GREATEST(COALESCE(ship.shipped_quantity, 0) - COALESCE(ret.returned_quantity, 0), 0)), 0) + 0.01 >= COALESCE(SUM(soi.quantity), 0) THEN 'shipped'
                 ELSE 'partial_shipped'
               END AS expected_shipping_state
        FROM sales_orders so
        JOIN sales_order_items soi ON soi.order_id = so.id
        LEFT JOIN (
          SELECT COALESCE(sobi.source_order_id, sob.order_id) AS order_id, sobi.product_id,
                 SUM(COALESCE(sobi.quantity, 0)) AS shipped_quantity
          FROM sales_outbound_items sobi
          JOIN sales_outbound sob ON sob.id = sobi.outbound_id
          WHERE sob.deleted_at IS NULL
            AND sob.status IN ('processing', 'completed')
            AND COALESCE(sobi.source_order_id, sob.order_id) IS NOT NULL
          GROUP BY COALESCE(sobi.source_order_id, sob.order_id), sobi.product_id
        ) ship ON ship.order_id = so.id AND ship.product_id = soi.material_id
        LEFT JOIN (
          SELECT sr.order_id, sri.product_id,
                 SUM(COALESCE(sri.quantity, 0)) AS returned_quantity
          FROM sales_return_items sri
          JOIN sales_returns sr ON sr.id = sri.return_id
          WHERE sr.deleted_at IS NULL
            AND sr.status NOT IN ('rejected', 'cancelled', 'draft')
          GROUP BY sr.order_id, sri.product_id
        ) ret ON ret.order_id = so.id AND ret.product_id = soi.material_id
        WHERE so.deleted_at IS NULL
          AND so.status NOT IN ('draft', 'pending', 'confirmed', 'in_production', 'in_procurement', 'shortage', 'ready_to_ship', 'cancelled', 'completed')
        GROUP BY so.id, so.order_no, so.status
      ) x
      WHERE (expected_shipping_state = 'unshipped' AND status IN ('partial_shipped', 'shipped', 'delivered'))
         OR (expected_shipping_state = 'partial_shipped' AND status NOT IN ('partial_shipped'))
         OR (expected_shipping_state = 'shipped' AND status NOT IN ('shipped', 'delivered'))
    `,
  },
  {
    id: 'sales.returns_valid_and_within_shipped',
    severity: 'critical',
    description: 'Sales returns must reference active orders/materials and not exceed shipped quantities.',
    sql: `
      SELECT 'missing_order' AS issue, sr.id, sr.return_no, sr.order_id, NULL AS item_id, NULL AS product_id,
             NULL AS return_quantity, NULL AS shipped_quantity
      FROM sales_returns sr
      LEFT JOIN sales_orders so ON so.id = sr.order_id AND so.deleted_at IS NULL
      WHERE sr.deleted_at IS NULL AND so.id IS NULL
      UNION ALL
      SELECT 'missing_material' AS issue, sr.id, sr.return_no, sr.order_id, sri.id AS item_id, sri.product_id,
             sri.quantity AS return_quantity, NULL AS shipped_quantity
      FROM sales_return_items sri
      JOIN sales_returns sr ON sr.id = sri.return_id AND sr.deleted_at IS NULL
      LEFT JOIN materials m ON m.id = sri.product_id AND m.deleted_at IS NULL
      WHERE sr.status NOT IN ('rejected', 'cancelled') AND m.id IS NULL
      UNION ALL
      SELECT 'not_in_order' AS issue, sr.id, sr.return_no, sr.order_id, sri.id AS item_id, sri.product_id,
             sri.quantity AS return_quantity, NULL AS shipped_quantity
      FROM sales_return_items sri
      JOIN sales_returns sr ON sr.id = sri.return_id AND sr.deleted_at IS NULL
      LEFT JOIN sales_order_items soi ON soi.order_id = sr.order_id AND soi.material_id = sri.product_id
      WHERE sr.status NOT IN ('rejected', 'cancelled') AND soi.id IS NULL
      UNION ALL
      SELECT 'over_returned' AS issue, NULL AS id, NULL AS return_no, returned.order_id, NULL AS item_id,
             returned.product_id, returned.return_quantity, COALESCE(shipped.shipped_quantity, 0) AS shipped_quantity
      FROM (
        SELECT sr.order_id, sri.product_id, SUM(COALESCE(sri.quantity, 0)) AS return_quantity
        FROM sales_return_items sri
        JOIN sales_returns sr ON sr.id = sri.return_id
        WHERE sr.deleted_at IS NULL
          AND sr.status NOT IN ('rejected', 'cancelled', 'draft')
        GROUP BY sr.order_id, sri.product_id
      ) returned
      LEFT JOIN (
        SELECT COALESCE(sobi.source_order_id, sob.order_id) AS order_id, sobi.product_id,
               SUM(COALESCE(sobi.quantity, 0)) AS shipped_quantity
        FROM sales_outbound_items sobi
        JOIN sales_outbound sob ON sob.id = sobi.outbound_id
        WHERE sob.deleted_at IS NULL
          AND sob.status IN ('processing', 'completed')
          AND COALESCE(sobi.source_order_id, sob.order_id) IS NOT NULL
        GROUP BY COALESCE(sobi.source_order_id, sob.order_id), sobi.product_id
      ) shipped ON shipped.order_id = returned.order_id AND shipped.product_id = returned.product_id
      WHERE returned.return_quantity - COALESCE(shipped.shipped_quantity, 0) > 0.01
    `,
  },
  {
    id: 'sales.completed_returns_have_inventory_ledger',
    severity: 'critical',
    description: 'Completed sales returns must be reflected by positive sales_return inventory ledger rows.',
    sql: `
      SELECT x.return_id, x.return_no, x.product_id, x.return_quantity, x.ledger_quantity
      FROM (
        SELECT sr.id AS return_id, sr.return_no, sri.product_id,
               ROUND(SUM(COALESCE(sri.quantity, 0)), 2) AS return_quantity,
               ROUND(COALESCE((
                 SELECT SUM(il.quantity)
                 FROM inventory_ledger il
                 WHERE il.reference_type = 'sales_return'
                   AND il.reference_no = sr.return_no
                   AND il.material_id = sri.product_id
                   AND il.transaction_type = 'sales_return'
               ), 0), 2) AS ledger_quantity
        FROM sales_returns sr
        JOIN sales_return_items sri ON sri.return_id = sr.id
        WHERE sr.deleted_at IS NULL
          AND sr.status = 'completed'
        GROUP BY sr.id, sr.return_no, sri.product_id
      ) x
      WHERE ABS(return_quantity - ledger_quantity) > 0.01
    `,
  },
  {
    id: 'sales.exchanges_valid_and_balanced',
    severity: 'high',
    description: 'Sales exchanges must have valid orders/materials and balanced header amounts.',
    sql: `
      SELECT 'missing_order' AS issue, se.id, se.exchange_no, se.order_id, se.order_no, NULL AS item_id
      FROM sales_exchanges se
      LEFT JOIN sales_orders so
        ON (so.id = se.order_id OR so.order_no COLLATE utf8mb4_unicode_ci = se.order_no COLLATE utf8mb4_unicode_ci)
       AND so.deleted_at IS NULL
      WHERE se.deleted_at IS NULL
        AND (se.order_id IS NOT NULL OR se.order_no IS NOT NULL)
        AND so.id IS NULL
      UNION ALL
      SELECT 'missing_material' AS issue, se.id, se.exchange_no, se.order_id, se.order_no, sei.id AS item_id
      FROM sales_exchange_items sei
      JOIN sales_exchanges se ON se.id = sei.exchange_id AND se.deleted_at IS NULL
      LEFT JOIN materials m ON m.code COLLATE utf8mb4_unicode_ci = sei.product_code COLLATE utf8mb4_unicode_ci AND m.deleted_at IS NULL
      WHERE m.id IS NULL
      UNION ALL
      SELECT 'amount_mismatch' AS issue, se.id, se.exchange_no, se.order_id, se.order_no, sei.id AS item_id
      FROM sales_exchange_items sei
      JOIN sales_exchanges se ON se.id = sei.exchange_id AND se.deleted_at IS NULL
      WHERE ABS(COALESCE(sei.amount, 0) - ROUND(COALESCE(sei.quantity, 0) * COALESCE(sei.unit_price, 0), 2)) > 0.05
      UNION ALL
      SELECT 'header_amount_mismatch' AS issue, x.id, x.exchange_no, x.order_id, x.order_no, NULL AS item_id
      FROM (
        SELECT se.id, se.exchange_no, se.order_id, se.order_no, se.return_amount, se.new_amount, se.difference_amount,
               ROUND(COALESCE(SUM(CASE WHEN sei.item_type = 'return' THEN sei.amount ELSE 0 END), 0), 2) AS item_return_amount,
               ROUND(COALESCE(SUM(CASE WHEN sei.item_type = 'new' THEN sei.amount ELSE 0 END), 0), 2) AS item_new_amount
        FROM sales_exchanges se
        LEFT JOIN sales_exchange_items sei ON sei.exchange_id = se.id
        WHERE se.deleted_at IS NULL
        GROUP BY se.id, se.exchange_no, se.order_id, se.order_no, se.return_amount, se.new_amount, se.difference_amount
      ) x
      WHERE ABS(COALESCE(return_amount, 0) - item_return_amount) > 0.05
         OR ABS(COALESCE(new_amount, 0) - item_new_amount) > 0.05
         OR ABS(COALESCE(difference_amount, 0) - ROUND(item_new_amount - item_return_amount, 2)) > 0.05
    `,
  },
  {
    id: 'sales.completed_exchanges_have_inventory_ledger',
    severity: 'critical',
    description: 'Completed sales exchanges must have inventory ledger evidence for returned and new items.',
    sql: `
      SELECT x.exchange_id, x.exchange_no, x.item_type, x.material_id, x.item_quantity, x.ledger_quantity
      FROM (
        SELECT se.id AS exchange_id, se.exchange_no, sei.item_type, m.id AS material_id,
               ROUND(SUM(COALESCE(sei.quantity, 0)), 2) AS item_quantity,
               ROUND(COALESCE((
                 SELECT SUM(CASE WHEN sei.item_type = 'return' THEN il.quantity ELSE ABS(il.quantity) END)
                 FROM inventory_ledger il
                 WHERE il.reference_type = 'sales_exchange'
                   AND il.reference_no COLLATE utf8mb4_unicode_ci = se.exchange_no COLLATE utf8mb4_unicode_ci
                   AND il.material_id = m.id
                   AND il.transaction_type = CASE WHEN sei.item_type = 'return' THEN 'sales_exchange_return' ELSE 'sales_exchange_out' END
               ), 0), 2) AS ledger_quantity
        FROM sales_exchanges se
        JOIN sales_exchange_items sei ON sei.exchange_id = se.id
        LEFT JOIN materials m ON m.code COLLATE utf8mb4_unicode_ci = sei.product_code COLLATE utf8mb4_unicode_ci AND m.deleted_at IS NULL
        WHERE se.deleted_at IS NULL
          AND se.status IN ('completed', '已完成')
        GROUP BY se.id, se.exchange_no, sei.item_type, m.id
      ) x
      WHERE material_id IS NOT NULL
        AND ABS(item_quantity - ledger_quantity) > 0.01
    `,
  },
  {
    id: 'sales.ar_documents_consistent',
    severity: 'critical',
    description: 'Sales AR invoices and receipts must point to valid sales documents and reconcile paid/balance amounts.',
    sql: `
      SELECT 'invoice_source_missing' AS issue, ai.id, ai.invoice_number AS document_no, ai.source_type, ai.source_id
      FROM ar_invoices ai
      LEFT JOIN sales_orders so ON ai.source_type = 'sales_order' AND so.id = ai.source_id AND so.deleted_at IS NULL
      LEFT JOIN sales_returns sr ON ai.source_type = 'sales_return' AND sr.id = ai.source_id AND sr.deleted_at IS NULL
      WHERE ai.source_type IN ('sales_order', 'sales_return')
        AND ((ai.source_type = 'sales_order' AND so.id IS NULL)
          OR (ai.source_type = 'sales_return' AND sr.id IS NULL))
      UNION ALL
      SELECT 'invoice_paid_balance_mismatch' AS issue, ai.id, ai.invoice_number AS document_no, ai.source_type, ai.source_id
      FROM ar_invoices ai
      WHERE ai.status <> '已取消'
        AND ABS(COALESCE(ai.total_amount, 0) - COALESCE(ai.paid_amount, 0) - COALESCE(ai.balance_amount, 0)) > 0.05
      UNION ALL
      SELECT 'receipt_item_invoice_missing' AS issue, r.id, r.receipt_number AS document_no, 'ar_invoice' AS source_type, ri.invoice_id AS source_id
      FROM ar_receipt_items ri
      JOIN ar_receipts r ON r.id = ri.receipt_id
      LEFT JOIN ar_invoices ai ON ai.id = ri.invoice_id
      WHERE r.status <> 'void' AND ai.id IS NULL
    `,
  },
  {
    id: 'sales.document_links_resolve',
    severity: 'high',
    description: 'Sales document links must resolve to existing sales, inventory, and finance documents.',
    sql: `
      SELECT dl.id, dl.source_type, dl.source_id, dl.source_code, dl.target_type, dl.target_id, dl.target_code
      FROM document_links dl
      WHERE dl.source_type IN ('sales_quotation', 'sales_order', 'sales_outbound', 'sales_return', 'sales_exchange', 'ar_invoice', 'ar_receipt')
        AND (
          (dl.source_type = 'sales_quotation' AND NOT EXISTS (SELECT 1 FROM sales_quotations sq WHERE sq.id = dl.source_id AND sq.deleted_at IS NULL))
          OR (dl.source_type = 'sales_order' AND NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.id = dl.source_id AND so.deleted_at IS NULL))
          OR (dl.source_type = 'sales_outbound' AND NOT EXISTS (SELECT 1 FROM sales_outbound so WHERE so.id = dl.source_id AND so.deleted_at IS NULL))
          OR (dl.source_type = 'sales_return' AND NOT EXISTS (SELECT 1 FROM sales_returns sr WHERE sr.id = dl.source_id AND sr.deleted_at IS NULL))
          OR (dl.source_type = 'sales_exchange' AND NOT EXISTS (SELECT 1 FROM sales_exchanges se WHERE se.id = dl.source_id AND se.deleted_at IS NULL))
          OR (dl.source_type = 'ar_invoice' AND NOT EXISTS (SELECT 1 FROM ar_invoices ai WHERE ai.id = dl.source_id))
          OR (dl.source_type = 'ar_receipt' AND NOT EXISTS (SELECT 1 FROM ar_receipts ar WHERE ar.id = dl.source_id))
          OR (dl.target_type = 'sales_quotation' AND NOT EXISTS (SELECT 1 FROM sales_quotations sq WHERE sq.id = dl.target_id AND sq.deleted_at IS NULL))
          OR (dl.target_type = 'sales_order' AND NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.id = dl.target_id AND so.deleted_at IS NULL))
          OR (dl.target_type = 'sales_outbound' AND NOT EXISTS (SELECT 1 FROM sales_outbound so WHERE so.id = dl.target_id AND so.deleted_at IS NULL))
          OR (dl.target_type = 'sales_return' AND NOT EXISTS (SELECT 1 FROM sales_returns sr WHERE sr.id = dl.target_id AND sr.deleted_at IS NULL))
          OR (dl.target_type = 'sales_exchange' AND NOT EXISTS (SELECT 1 FROM sales_exchanges se WHERE se.id = dl.target_id AND se.deleted_at IS NULL))
          OR (dl.target_type = 'inventory_outbound' AND NOT EXISTS (SELECT 1 FROM inventory_outbound io WHERE io.id = dl.target_id AND io.deleted_at IS NULL))
          OR (dl.target_type = 'inventory_inbound' AND NOT EXISTS (SELECT 1 FROM inventory_inbound ii WHERE ii.id = dl.target_id AND ii.is_deleted = 0))
          OR (dl.target_type = 'ar_invoice' AND NOT EXISTS (SELECT 1 FROM ar_invoices ai WHERE ai.id = dl.target_id))
          OR (dl.target_type = 'ar_receipt' AND NOT EXISTS (SELECT 1 FROM ar_receipts ar WHERE ar.id = dl.target_id))
          OR (dl.target_type = 'finance_voucher' AND NOT EXISTS (SELECT 1 FROM gl_entries ge WHERE ge.id = dl.target_id))
          OR (dl.target_type = 'tax_invoice' AND NOT EXISTS (SELECT 1 FROM tax_invoices ti WHERE ti.id = dl.target_id))
        )
    `,
  },
];

async function runRules(connection) {
  const results = [];
  for (const rule of rules) {
    try {
      const [rows] = await connection.query(rule.sql);
      results.push({ ...rule, count: rows.length, rows, passed: rows.length === 0 });
    } catch (error) {
      results.push({ ...rule, count: null, rows: [], error: error.message, passed: false });
    }
  }
  return results;
}

function renderMarkdown(report) {
  const lines = [
    '# ERP Sales Integration Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Overall result: ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    '| Area | Result | Count |',
    '| --- | --- | --- |',
    `| Sales integration rules | ${report.failedRules.length === 0 ? 'PASS' : 'FAIL'} | ${report.failedRules.length} failed |`,
    '',
    '## Rules',
    '',
    '| Rule | Severity | Result | Count |',
    '| --- | --- | --- | --- |',
  ];

  for (const result of report.results) {
    const status = result.error ? 'ERROR' : result.passed ? 'PASS' : 'FAIL';
    lines.push(`| \`${result.id}\` | ${result.severity} | ${status} | ${result.count ?? 'n/a'} |`);
  }

  if (report.failedRules.length > 0) {
    lines.push('', '## Failed Rule Samples', '', '```json');
    lines.push(JSON.stringify(
      report.failedRules.map((rule) => ({
        id: rule.id,
        severity: rule.severity,
        description: rule.description,
        error: rule.error,
        rows: rule.rows.slice(0, 30),
      })),
      null,
      2
    ));
    lines.push('```');
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const connection = await mysql.createConnection(getPoolConfig());
  try {
    const results = await runRules(connection);
    const failedRules = results.filter((result) => !result.passed);
    const report = {
      passed: failedRules.length === 0,
      summary: {
        ruleCount: results.length,
        failedRuleCount: failedRules.length,
      },
      results,
      failedRules,
    };

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));

    console.log(`Sales integration audit complete: ${report.passed ? 'PASS' : 'FAIL'}`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`Markdown: ${mdPath}`);
    process.exit(report.passed ? 0 : 2);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Sales integration audit failed to run:', error.message);
  process.exit(1);
});
