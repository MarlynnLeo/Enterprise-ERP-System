#!/usr/bin/env node

const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');
const SAMPLE_LIMIT = Number(
  (process.argv.find(arg => arg.startsWith('--sample=')) || '').split('=')[1] || 10
);

const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  decimalNumbers: true,
  dateStrings: true,
  multipleStatements: false,
};

const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

const inboundTransactionType = (inboundType) => {
  const map = {
    purchase: 'purchase_inbound',
    production: 'production_inbound',
    production_return: 'production_return',
    outsourced: 'outsourced_inbound',
    sales_return: 'sales_return',
    defective_return: 'defective_return',
    other: 'inbound',
  };
  return map[inboundType] || 'inbound';
};

class RepairRunner {
  constructor(connection) {
    this.connection = connection;
    this.columns = new Map();
    this.summary = {
      salesReservations: { candidates: 0, repaired: 0, shortage: 0, manual: [] },
      documentLinks: { production: 0, purchase: 0 },
      inboundLedger: { candidates: 0, repaired: 0, manual: [] },
      purchaseReceiptLedger: { candidates: 0, repaired: 0, manual: [] },
      productionManualReview: [],
    };
  }

  async tableExists(table) {
    const [rows] = await this.connection.execute(
      `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table]
    );
    return Number(rows[0].count) > 0;
  }

  async getColumns(table) {
    if (this.columns.has(table)) return this.columns.get(table);
    const [rows] = await this.connection.execute(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table]
    );
    const set = new Set(rows.map(row => row.COLUMN_NAME));
    this.columns.set(table, set);
    return set;
  }

  async hasColumn(table, column) {
    const columns = await this.getColumns(table);
    return columns.has(column);
  }

  async softDeleteCondition(alias, table) {
    return (await this.hasColumn(table, 'deleted_at')) ? ` AND ${alias}.deleted_at IS NULL` : '';
  }

  async repairReadyToShipReservations() {
    if (!(await this.tableExists('sales_orders')) || !(await this.tableExists('inventory_reservations'))) {
      return;
    }

    const salesSoftDelete = await this.softDeleteCondition('so', 'sales_orders');
    const itemQtyExpression = await this.salesOrderItemQuantityExpression('soi');
    const [orders] = await this.connection.execute(
      `SELECT
         so.id,
         so.order_no,
         so.created_by,
         COUNT(*) AS short_line_count,
         GROUP_CONCAT(CONCAT(COALESCE(m.code, x.material_id), ': need ', x.required_quantity,
           ', reserved ', x.reserved_quantity) SEPARATOR '; ') AS shortage_summary
       FROM (
         SELECT
           soi.order_id,
           soi.material_id,
           SUM(${itemQtyExpression}) AS required_quantity,
           COALESCE((
             SELECT SUM(ir.reserved_quantity)
             FROM inventory_reservations ir
             WHERE ir.order_id = soi.order_id
               AND ir.material_id = soi.material_id
               AND ir.status = 'active'
           ), 0) AS reserved_quantity
         FROM sales_order_items soi
         GROUP BY soi.order_id, soi.material_id
       ) x
       JOIN sales_orders so ON so.id = x.order_id
       LEFT JOIN materials m ON m.id = x.material_id
       WHERE so.status = 'ready_to_ship'
         ${salesSoftDelete}
         AND x.reserved_quantity + 0.000001 < x.required_quantity
       GROUP BY so.id, so.order_no, so.created_by
       ORDER BY so.id`
    );

    this.summary.salesReservations.candidates = orders.length;

    for (const order of orders) {
      if (!APPLY) continue;
      const result = await this.reserveSalesOrder(order);
      if (result.fullSuccess) {
        this.summary.salesReservations.repaired += 1;
      } else if (result.manual) {
        this.summary.salesReservations.manual.push(result.manual);
      } else {
        this.summary.salesReservations.shortage += 1;
      }
    }
  }

  async reserveSalesOrder(order) {
    const conn = this.connection;
    await conn.beginTransaction();

    try {
      const itemQtyExpression = await this.salesOrderItemQuantityExpression();
      const [items] = await conn.execute(
        `SELECT material_id, SUM(${itemQtyExpression}) AS quantity
         FROM sales_order_items
         WHERE order_id = ?
         GROUP BY material_id`,
        [order.id]
      );

      const insufficientItems = [];
      const manualIssues = [];

      for (const item of items) {
        const [materials] = await conn.execute(
          'SELECT id, code, name, location_id FROM materials WHERE id = ?',
          [item.material_id]
        );
        const material = materials[0];

        if (!material || !material.location_id) {
          manualIssues.push({
            order_no: order.order_no,
            material_id: item.material_id,
            reason: 'material_missing_default_location',
          });
          continue;
        }

        const requiredQuantity = Number(item.quantity || 0);
        const [stockRows] = await conn.execute(
          `SELECT COALESCE(SUM(quantity), 0) AS current_stock
           FROM inventory_ledger
           WHERE material_id = ? AND location_id = ?
           FOR UPDATE`,
          [item.material_id, material.location_id]
        );
        const currentStock = Number(stockRows[0].current_stock || 0);

        const [existingRows] = await conn.execute(
          `SELECT COALESCE(SUM(reserved_quantity), 0) AS reserved_quantity
           FROM inventory_reservations
           WHERE order_id = ? AND material_id = ? AND location_id = ? AND status = 'active'`,
          [order.id, item.material_id, material.location_id]
        );
        const alreadyReserved = Number(existingRows[0].reserved_quantity || 0);

        const [otherRows] = await conn.execute(
          `SELECT COALESCE(SUM(reserved_quantity), 0) AS reserved_quantity
           FROM inventory_reservations
           WHERE material_id = ? AND location_id = ? AND status = 'active' AND order_id <> ?`,
          [item.material_id, material.location_id, order.id]
        );
        const reservedByOtherOrders = Number(otherRows[0].reserved_quantity || 0);
        const availableForOrder = Math.max(0, currentStock - reservedByOtherOrders);
        const remainingQuantity = Math.max(0, requiredQuantity - alreadyReserved);
        const reservableQuantity = Math.min(
          Math.max(0, availableForOrder - alreadyReserved),
          remainingQuantity
        );

        if (reservableQuantity > 0) {
          await this.createReservation({
            order,
            material,
            quantity: reservableQuantity,
          });
        }

        const totalReserved = alreadyReserved + reservableQuantity;
        if (totalReserved + 0.000001 < requiredQuantity) {
          insufficientItems.push({
            order_no: order.order_no,
            material_id: item.material_id,
            material_code: material.code,
            required: requiredQuantity,
            reserved: totalReserved,
            shortage: requiredQuantity - totalReserved,
          });
        }
      }

      if (manualIssues.length > 0 || insufficientItems.length > 0) {
        await this.updateSalesOrderStatus(order, 'shortage', false);
      } else {
        await this.updateSalesOrderStatus(order, 'ready_to_ship', true);
      }

      await conn.commit();

      if (manualIssues.length > 0) {
        return { fullSuccess: false, manual: manualIssues[0] };
      }
      return { fullSuccess: insufficientItems.length === 0 };
    } catch (error) {
      await conn.rollback();
      this.summary.salesReservations.manual.push({
        order_no: order.order_no,
        reason: error.message,
      });
      return { fullSuccess: false, manual: { order_no: order.order_no, reason: error.message } };
    }
  }

  async createReservation({ order, material, quantity }) {
    const columns = await this.getColumns('inventory_reservations');
    const insertColumns = [];
    const placeholders = [];
    const values = [];

    const addValue = (column, value) => {
      if (!columns.has(column)) return;
      insertColumns.push(column);
      placeholders.push('?');
      values.push(value);
    };
    const addRaw = (column, expression) => {
      if (!columns.has(column)) return;
      insertColumns.push(column);
      placeholders.push(expression);
    };

    addValue('order_id', order.id);
    addValue('order_no', order.order_no);
    addValue('material_id', material.id);
    addValue('material_code', material.code || String(material.id));
    addValue('material_name', material.name || material.code || String(material.id));
    addValue('location_id', material.location_id);
    addValue('reserved_quantity', quantity);
    addValue('status', 'active');
    addValue('created_by', order.created_by || null);
    addValue('remarks', `Historical repair reservation for order ${order.order_no}`);
    addRaw('reserved_at', 'NOW()');
    addRaw('created_at', 'NOW()');
    addRaw('updated_at', 'NOW()');

    await this.connection.execute(
      `INSERT INTO inventory_reservations (${insertColumns.join(', ')})
       VALUES (${placeholders.join(', ')})`,
      values
    );
  }

  async salesOrderItemQuantityExpression(alias) {
    const columns = await this.getColumns('sales_order_items');
    const prefix = alias ? `${alias}.` : '';
    const candidates = ['quantity', 'ordered_quantity']
      .filter(column => columns.has(column))
      .map(column => `${prefix}${column}`);
    return `COALESCE(${candidates.join(', ') || '0'}, 0)`;
  }

  async updateSalesOrderStatus(order, status, locked) {
    const columns = await this.getColumns('sales_orders');
    const sets = ['status = ?'];
    const values = [status];

    if (columns.has('is_locked')) {
      sets.push('is_locked = ?');
      values.push(locked ? 1 : 0);
    }
    if (columns.has('locked_at')) {
      sets.push(locked ? 'locked_at = NOW()' : 'locked_at = NULL');
    }
    if (columns.has('locked_by')) {
      sets.push('locked_by = ?');
      values.push(locked ? order.created_by || null : null);
    }
    if (columns.has('lock_reason')) {
      sets.push('lock_reason = ?');
      values.push(
        locked
          ? 'Historical repair reserved inventory for fulfillment flow'
          : 'Historical repair found insufficient reservation coverage'
      );
    }
    if (columns.has('updated_at')) {
      sets.push('updated_at = NOW()');
    }

    values.push(order.id);
    await this.connection.execute(
      `UPDATE sales_orders SET ${sets.join(', ')} WHERE id = ?`,
      values
    );
  }

  async repairDocumentLinks() {
    if (!(await this.tableExists('document_links')) || !(await this.tableExists('sales_orders'))) {
      return;
    }

    await this.repairProductionPlanLinks();
    await this.repairPurchaseRequisitionLinks();
  }

  async repairProductionPlanLinks() {
    if (!(await this.tableExists('production_plans'))) return;
    const remarkColumn = await this.pickColumn('production_plans', ['remarks', 'remark']);
    if (!remarkColumn || !(await this.hasColumn('production_plans', 'code'))) return;

    const salesSoftDelete = await this.softDeleteCondition('so', 'sales_orders');
    const planSoftDelete = await this.softDeleteCondition('pp', 'production_plans');
    const [links] = await this.connection.execute(
      `SELECT so.id AS source_id, so.order_no AS source_code,
              pp.id AS target_id, pp.code AS target_code, so.created_by
       FROM sales_orders so
       JOIN production_plans pp ON pp.${remarkColumn} LIKE CONCAT('%', so.order_no, '%')
       LEFT JOIN document_links dl
         ON dl.source_type = 'sales_order'
        AND dl.source_id = so.id
        AND dl.target_type = 'production_plan'
        AND dl.target_id = pp.id
       WHERE dl.id IS NULL
         AND so.status IN ('in_production', 'shortage', 'ready_to_ship')
         ${salesSoftDelete}
         ${planSoftDelete}
       ORDER BY so.id, pp.id`
    );

    this.summary.documentLinks.production = links.length;
    if (!APPLY) return;

    for (const link of links) {
      await this.createDocumentLink({
        ...link,
        target_type: 'production_plan',
        remark: 'Historical repair linked generated production plan',
      });
    }
  }

  async repairPurchaseRequisitionLinks() {
    if (!(await this.tableExists('purchase_requisitions'))) return;
    const remarkColumn = await this.pickColumn('purchase_requisitions', ['remarks', 'remark']);
    if (!remarkColumn || !(await this.hasColumn('purchase_requisitions', 'requisition_number'))) return;

    const salesSoftDelete = await this.softDeleteCondition('so', 'sales_orders');
    const reqSoftDelete = await this.softDeleteCondition('pr', 'purchase_requisitions');
    const [links] = await this.connection.execute(
      `SELECT so.id AS source_id, so.order_no AS source_code,
              pr.id AS target_id, pr.requisition_number AS target_code, so.created_by
       FROM sales_orders so
       JOIN purchase_requisitions pr ON pr.${remarkColumn} LIKE CONCAT('%', so.order_no, '%')
       LEFT JOIN document_links dl
         ON dl.source_type = 'sales_order'
        AND dl.source_id = so.id
        AND dl.target_type = 'purchase_requisition'
        AND dl.target_id = pr.id
       WHERE dl.id IS NULL
         AND so.status IN ('in_procurement', 'shortage', 'ready_to_ship')
         ${salesSoftDelete}
         ${reqSoftDelete}
       ORDER BY so.id, pr.id`
    );

    this.summary.documentLinks.purchase = links.length;
    if (!APPLY) return;

    for (const link of links) {
      await this.createDocumentLink({
        ...link,
        target_type: 'purchase_requisition',
        remark: 'Historical repair linked generated purchase requisition',
      });
    }
  }

  async pickColumn(table, candidates) {
    const columns = await this.getColumns(table);
    return candidates.find(column => columns.has(column)) || null;
  }

  async createDocumentLink(link) {
    await this.connection.execute(
      `INSERT IGNORE INTO document_links
       (source_type, source_id, source_code, target_type, target_id, target_code,
        link_type, remark, created_by)
       VALUES ('sales_order', ?, ?, ?, ?, ?, 'generate', ?, ?)`,
      [
        link.source_id,
        link.source_code,
        link.target_type,
        link.target_id,
        link.target_code,
        link.remark,
        link.created_by || null,
      ]
    );
  }

  async repairInventoryInboundLedger() {
    if (!(await this.tableExists('inventory_inbound')) || !(await this.tableExists('inventory_inbound_items'))) {
      return;
    }

    const [inbounds] = await this.connection.execute(
      `SELECT
         i.id,
         i.inbound_no,
         i.inbound_type,
         i.location_id,
         i.operator,
         i.remark,
         i.created_at,
         i.updated_at,
         COUNT(ii.id) AS item_count,
         SUM(CASE WHEN ii.batch_number IS NULL OR TRIM(ii.batch_number) = '' THEN 1 ELSE 0 END)
           AS missing_batch_count
       FROM inventory_inbound i
       JOIN inventory_inbound_items ii ON ii.inbound_id = i.id
       WHERE i.status = 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM inventory_ledger il WHERE il.reference_no = i.inbound_no
         )
       GROUP BY i.id, i.inbound_no, i.inbound_type, i.location_id, i.operator,
                i.remark, i.created_at, i.updated_at
       ORDER BY i.id`
    );

    this.summary.inboundLedger.candidates = inbounds.length;

    for (const inbound of inbounds) {
      if (Number(inbound.missing_batch_count || 0) > 0) {
        this.summary.inboundLedger.manual.push({
          inbound_no: inbound.inbound_no,
          reason: 'missing_batch_number',
          missing_batch_count: Number(inbound.missing_batch_count),
        });
        continue;
      }

      if (!APPLY) continue;
      const repaired = await this.repairSingleInventoryInbound(inbound);
      if (repaired) this.summary.inboundLedger.repaired += 1;
    }
  }

  async repairSingleInventoryInbound(inbound) {
    await this.connection.beginTransaction();
    try {
      const [items] = await this.connection.execute(
        `SELECT ii.*, m.unit_id AS material_unit_id
         FROM inventory_inbound_items ii
         LEFT JOIN materials m ON m.id = ii.material_id
         WHERE ii.inbound_id = ?
         ORDER BY ii.id`,
        [inbound.id]
      );

      for (const item of items) {
        const locationId = item.location_id || inbound.location_id;
        if (!item.material_id || !locationId || !item.batch_number) {
          throw new Error(`inbound item ${item.id} lacks material, location, or batch`);
        }

        await this.insertLedger({
          material_id: item.material_id,
          location_id: locationId,
          quantity: Number(item.quantity || 0),
          unit_id: item.unit_id || item.material_unit_id || null,
          batch_number: item.batch_number,
          transaction_type: inboundTransactionType(inbound.inbound_type || 'other'),
          reference_no: inbound.inbound_no,
          reference_type: 'inbound',
          operator: inbound.operator || 'system',
          remark: inbound.remark || `Historical repair for inbound ${inbound.inbound_no}`,
          created_at: inbound.updated_at || inbound.created_at || null,
        });
      }

      await this.connection.commit();
      return true;
    } catch (error) {
      await this.connection.rollback();
      this.summary.inboundLedger.manual.push({
        inbound_no: inbound.inbound_no,
        reason: error.message,
      });
      return false;
    }
  }

  async repairPurchaseReceiptLedger() {
    if (!(await this.tableExists('purchase_receipts')) || !(await this.tableExists('purchase_receipt_items'))) {
      return;
    }

    const qtyExpression = await this.purchaseReceiptQuantityExpression();
    const [receipts] = await this.connection.execute(
      `SELECT
         r.id,
         r.receipt_no,
         r.order_id,
         r.order_no,
         r.supplier_id,
         r.supplier_name,
         r.warehouse_id,
         r.warehouse_name,
         r.receipt_date,
         r.operator,
         r.remarks,
         r.created_at,
         r.updated_at,
         COUNT(ri.id) AS item_count,
         SUM(CASE WHEN ri.batch_number IS NULL OR TRIM(ri.batch_number) = '' THEN 1 ELSE 0 END)
           AS missing_batch_count,
         SUM(CASE WHEN ${qtyExpression} <= 0 THEN 1 ELSE 0 END) AS invalid_quantity_count
       FROM purchase_receipts r
       JOIN purchase_receipt_items ri ON ri.receipt_id = r.id
       WHERE r.status = 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM inventory_ledger il WHERE il.reference_no = r.receipt_no
         )
       GROUP BY r.id, r.receipt_no, r.order_id, r.order_no, r.supplier_id, r.supplier_name,
                r.warehouse_id, r.warehouse_name, r.receipt_date, r.operator, r.remarks,
                r.created_at, r.updated_at
       ORDER BY r.id`
    );

    this.summary.purchaseReceiptLedger.candidates = receipts.length;

    for (const receipt of receipts) {
      const manualReason = this.purchaseReceiptManualReason(receipt);
      if (manualReason) {
        this.summary.purchaseReceiptLedger.manual.push({
          receipt_no: receipt.receipt_no,
          reason: manualReason,
        });
        continue;
      }

      if (!APPLY) continue;
      const repaired = await this.repairSinglePurchaseReceipt(receipt);
      if (repaired) this.summary.purchaseReceiptLedger.repaired += 1;
    }
  }

  async purchaseReceiptQuantityExpression() {
    const columns = await this.getColumns('purchase_receipt_items');
    const candidates = ['qualified_quantity', 'received_quantity', 'actual_quantity', 'quantity']
      .filter(column => columns.has(column))
      .map(column => `ri.${column}`);
    return `COALESCE(${candidates.join(', ') || '0'}, 0)`;
  }

  purchaseReceiptManualReason(receipt) {
    if (!receipt.warehouse_id) return 'missing_warehouse_id';
    if (Number(receipt.missing_batch_count || 0) > 0) return 'missing_batch_number';
    if (Number(receipt.invalid_quantity_count || 0) > 0) return 'invalid_quantity';
    return null;
  }

  async repairSinglePurchaseReceipt(receipt) {
    await this.connection.beginTransaction();
    try {
      const qtyExpression = await this.purchaseReceiptItemQuantityExpression();
      const [items] = await this.connection.execute(
        `SELECT
           ri.*,
           ${qtyExpression} AS repair_quantity,
           m.code AS material_code,
           m.name AS material_name,
           m.unit_id AS material_unit_id,
           u.name AS unit_name
         FROM purchase_receipt_items ri
         LEFT JOIN materials m ON m.id = ri.material_id
         LEFT JOIN units u ON u.id = COALESCE(ri.unit_id, m.unit_id)
         WHERE ri.receipt_id = ?
         ORDER BY ri.id`,
        [receipt.id]
      );

      for (const item of items) {
        if (!item.material_id || !item.batch_number || Number(item.repair_quantity || 0) <= 0) {
          throw new Error(`purchase receipt item ${item.id} lacks material, batch, or quantity`);
        }

        const unitCost = Number(item.price || item.order_price || 0);
        await this.insertLedger({
          material_id: item.material_id,
          location_id: receipt.warehouse_id,
          quantity: Number(item.repair_quantity),
          unit_id: item.unit_id || item.material_unit_id || null,
          batch_number: item.batch_number,
          transaction_type: 'purchase_inbound',
          reference_no: receipt.receipt_no,
          reference_type: 'batch_create',
          operator: receipt.operator || 'system',
          remark: `Historical repair for purchase receipt ${receipt.receipt_no}`,
          supplier_id: receipt.supplier_id || null,
          supplier_name: receipt.supplier_name || null,
          warehouse_name: receipt.warehouse_name || null,
          unit_cost: unitCost,
          purchase_order_id: receipt.order_id || null,
          purchase_order_no: receipt.order_no || null,
          receipt_id: receipt.id,
          receipt_no: receipt.receipt_no,
          created_at: receipt.updated_at || receipt.created_at || receipt.receipt_date || null,
        });
      }

      await this.connection.commit();
      return true;
    } catch (error) {
      await this.connection.rollback();
      this.summary.purchaseReceiptLedger.manual.push({
        receipt_no: receipt.receipt_no,
        reason: error.message,
      });
      return false;
    }
  }

  async purchaseReceiptItemQuantityExpression() {
    const columns = await this.getColumns('purchase_receipt_items');
    const candidates = ['qualified_quantity', 'received_quantity', 'actual_quantity', 'quantity']
      .filter(column => columns.has(column))
      .map(column => `ri.${column}`);
    return `COALESCE(${candidates.join(', ') || '0'}, 0)`;
  }

  async insertLedger(data) {
    const columns = await this.getColumns('inventory_ledger');
    const [stockRows] = await this.connection.execute(
      `SELECT COALESCE(SUM(quantity), 0) AS current_stock
       FROM inventory_ledger
       WHERE material_id = ? AND location_id = ?
       FOR UPDATE`,
      [data.material_id, data.location_id]
    );

    const beforeQuantity = Number(stockRows[0].current_stock || 0);
    const quantity = Number(data.quantity || 0);
    const afterQuantity = beforeQuantity + quantity;
    const unitCost = Number(data.unit_cost || 0);

    const insertColumns = [];
    const placeholders = [];
    const values = [];
    const add = (column, value) => {
      if (!columns.has(column)) return;
      insertColumns.push(column);
      placeholders.push('?');
      values.push(value);
    };

    add('material_id', data.material_id);
    add('location_id', data.location_id);
    add('transaction_type', data.transaction_type);
    add('transaction_no', data.reference_no);
    add('reference_no', data.reference_no);
    add('reference_type', data.reference_type);
    add('quantity', quantity);
    add('before_quantity', beforeQuantity);
    add('after_quantity', afterQuantity);
    add('unit_id', data.unit_id || null);
    add('batch_number', data.batch_number);
    add('supplier_id', data.supplier_id || null);
    add('supplier_name', data.supplier_name || null);
    add('warehouse_name', data.warehouse_name || null);
    add('operator', data.operator || 'system');
    add('remark', data.remark || null);
    add('unit_cost', unitCost);
    add('total_value', unitCost * Math.abs(quantity));
    add('purchase_order_id', data.purchase_order_id || null);
    add('purchase_order_no', data.purchase_order_no || null);
    add('receipt_id', data.receipt_id || null);
    add('receipt_no', data.receipt_no || null);
    add('created_at', data.created_at || new Date());

    await this.connection.execute(
      `INSERT INTO inventory_ledger (${insertColumns.join(', ')})
       VALUES (${placeholders.join(', ')})`,
      values
    );
  }

  async collectProductionManualReview() {
    if (!(await this.tableExists('production_tasks'))) return;
    const codeColumn = await this.pickColumn('production_tasks', ['code', 'task_no']);
    if (!codeColumn) return;
    const ledgerColumns = await this.getColumns('inventory_ledger');
    const referenceChecks = [`il.reference_no = pt.${codeColumn}`];
    if (ledgerColumns.has('reference_id')) {
      referenceChecks.push(`(il.reference_type = 'production_task' AND il.reference_id = pt.id)`);
    }
    if (await this.tableExists('inventory_inbound')) {
      referenceChecks.push(
        `EXISTS (
          SELECT 1
          FROM inventory_inbound i
          WHERE i.reference_type = 'production_task'
            AND i.reference_id = pt.id
            AND il.reference_no = i.inbound_no
        )`
      );
    }

    const [rows] = await this.connection.execute(
      `SELECT pt.id, pt.${codeColumn} AS task_code, pt.plan_id, pt.quantity, pt.status
       FROM production_tasks pt
       WHERE pt.status = 'completed'
         AND NOT EXISTS (
           SELECT 1
           FROM inventory_ledger il
           WHERE il.quantity > 0
             AND (${referenceChecks.join(' OR ')})
         )
       ORDER BY pt.id
       LIMIT ${Math.max(1, SAMPLE_LIMIT)}`
    );

    this.summary.productionManualReview = rows;
  }

  printSummary() {
    const mode = APPLY ? 'APPLY' : 'DRY RUN';
    console.log(`\nAutomation closure repair (${mode})`);
    console.log('================================');
    console.log(`Sales ready_to_ship without full active reservations: ${this.summary.salesReservations.candidates}`);
    if (APPLY) {
      console.log(`  repaired as ready_to_ship: ${this.summary.salesReservations.repaired}`);
      console.log(`  moved to shortage: ${this.summary.salesReservations.shortage}`);
    }

    console.log(`Production document links to restore: ${this.summary.documentLinks.production}`);
    console.log(`Purchase requisition links to restore: ${this.summary.documentLinks.purchase}`);

    console.log(`Completed inventory inbound docs without ledger: ${this.summary.inboundLedger.candidates}`);
    if (APPLY) console.log(`  ledger repaired: ${this.summary.inboundLedger.repaired}`);
    this.printSamples('  inbound manual review', this.summary.inboundLedger.manual);

    console.log(`Completed purchase receipts without ledger: ${this.summary.purchaseReceiptLedger.candidates}`);
    if (APPLY) console.log(`  ledger repaired: ${this.summary.purchaseReceiptLedger.repaired}`);
    this.printSamples('  purchase receipt manual review', this.summary.purchaseReceiptLedger.manual);

    this.printSamples('Completed production tasks still needing manual review', this.summary.productionManualReview);

    if (!APPLY) {
      console.log('\nNo data was changed. Run with --apply to execute deterministic repairs.');
    }
  }

  printSamples(title, rows) {
    if (!rows || rows.length === 0) return;
    console.log(`${title}:`);
    for (const row of rows.slice(0, SAMPLE_LIMIT)) {
      console.log(`  - ${JSON.stringify(row)}`);
    }
    if (rows.length > SAMPLE_LIMIT) {
      console.log(`  ... ${rows.length - SAMPLE_LIMIT} more`);
    }
  }

  async run() {
    await this.repairReadyToShipReservations();
    await this.repairDocumentLinks();
    await this.repairInventoryInboundLedger();
    await this.repairPurchaseReceiptLedger();
    await this.collectProductionManualReview();
    this.printSummary();
  }
}

async function main() {
  const missing = REQUIRED_ENV.filter(name => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }

  const connection = await mysql.createConnection(dbConfig);
  try {
    const runner = new RepairRunner(connection);
    await runner.run();
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
