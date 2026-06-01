require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const sql = require('mssql');

const ngConfig = {
  server: process.env.NG_SQL_SERVER || '192.168.1.184\\NG',
  database: process.env.NG_SQL_DATABASE || 'NG0001',
  user: process.env.NG_SQL_USER || 'sa',
  password: process.env.NG_SQL_PASSWORD || '12345',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  connectionTimeout: 10000,
  requestTimeout: 60000,
};

const localConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: false,
};

const SALES_TYPES = ['sales_order', 'sales_outbound', 'sales_return', 'ar_invoice', 'ar_receipt'];

function toDateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
}

function statusFromNg(row) {
  if (row.iscancell) return 'cancelled';
  if (row.ischeck) return 'confirmed';
  return 'pending';
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].count > 0;
}

async function backupTable(conn, table, whereSql = '', params = []) {
  if (!(await tableExists(conn, table))) return [];
  const [rows] = await conn.query(`SELECT * FROM ${table} ${whereSql}`, params);
  return rows;
}

async function writeBackup(conn) {
  const [invoiceRows] = await conn.query(`
    SELECT DISTINCT ai.id
    FROM ar_invoices ai
    LEFT JOIN document_links dl
      ON dl.target_type = 'ar_invoice' AND dl.target_id = ai.id
    WHERE ai.source_type IN ('sales_order', 'sales_outbound')
       OR dl.source_type IN ('sales_order', 'sales_outbound', 'sales_return')
       OR dl.target_type IN ('sales_order', 'sales_outbound', 'sales_return')
  `);
  const invoiceIds = invoiceRows.map(row => row.id);

  const [receiptRows] = invoiceIds.length
    ? await conn.query('SELECT DISTINCT receipt_id AS id FROM ar_receipt_items WHERE invoice_id IN (?)', [invoiceIds])
    : [[]];
  const receiptIds = receiptRows.map(row => row.id);

  const [inventoryOutboundRows] = await conn.query(`
    SELECT id FROM inventory_outbound
    WHERE sales_order_id IS NOT NULL OR reference_type IN ('sales_order', 'sales_outbound', 'sales')
  `).catch(() => [[]]);
  const inventoryOutboundIds = inventoryOutboundRows.map(row => row.id);

  const backup = {
    generated_at: new Date().toISOString(),
    local_database: process.env.DB_NAME,
    source_database: ngConfig.database,
    tables: {
      sales_orders: await backupTable(conn, 'sales_orders'),
      sales_order_items: await backupTable(conn, 'sales_order_items'),
      sales_outbound: await backupTable(conn, 'sales_outbound'),
      sales_outbound_items: await backupTable(conn, 'sales_outbound_items'),
      sales_returns: await backupTable(conn, 'sales_returns'),
      sales_return_items: await backupTable(conn, 'sales_return_items'),
      inventory_reservations: await backupTable(conn, 'inventory_reservations'),
      inventory_outbound: inventoryOutboundIds.length ? await backupTable(conn, 'inventory_outbound', 'WHERE id IN (?)', [inventoryOutboundIds]) : [],
      inventory_outbound_items: inventoryOutboundIds.length ? await backupTable(conn, 'inventory_outbound_items', 'WHERE outbound_id IN (?)', [inventoryOutboundIds]) : [],
      ar_invoices: invoiceIds.length ? await backupTable(conn, 'ar_invoices', 'WHERE id IN (?)', [invoiceIds]) : [],
      ar_invoice_items: invoiceIds.length ? await backupTable(conn, 'ar_invoice_items', 'WHERE invoice_id IN (?)', [invoiceIds]) : [],
      ar_receipts: receiptIds.length ? await backupTable(conn, 'ar_receipts', 'WHERE id IN (?)', [receiptIds]) : [],
      ar_receipt_items: receiptIds.length ? await backupTable(conn, 'ar_receipt_items', 'WHERE receipt_id IN (?)', [receiptIds]) : [],
      document_links: await backupTable(conn, 'document_links', 'WHERE source_type IN (?) OR target_type IN (?)', [SALES_TYPES, SALES_TYPES]),
      gl_entries: await backupTable(conn, 'gl_entries', "WHERE document_type IN ('sales_outbound', '发票', '收款单') OR transaction_type IN ('sales_outbound', 'ar_invoice', 'ar_receipt')"),
    },
  };

  if (await tableExists(conn, 'gl_entry_items')) {
    const entryIds = backup.tables.gl_entries.map(row => row.id);
    backup.tables.gl_entry_items = entryIds.length ? await backupTable(conn, 'gl_entry_items', 'WHERE entry_id IN (?)', [entryIds]) : [];
  }

  const dir = path.join(__dirname, '..', 'logs', 'backups');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `sales-orders-before-ng-import-${Date.now()}.json`);
  await fs.writeFile(file, JSON.stringify(backup, null, 2), 'utf8');
  return { file, invoiceIds, receiptIds, inventoryOutboundIds };
}

async function fetchNgOrders() {
  const pool = await sql.connect(ngConfig);
  try {
    const result = await pool.request().query(`
      SELECT
        om.sysno,
        om.pinsideno,
        om.contractno,
        om.carddt,
        om.checkdt,
        om.senddt,
        om.plan_dt,
        om.compno,
        om.goodsto,
        om.billto,
        om.locsum AS order_locsum,
        om.amount AS order_amount,
        om.fc_amount AS order_fc_amount,
        om.remarks AS order_remarks,
        om.isclose,
        om.ischeck,
        om.iscancell,
        om.issend,
        od.lineid,
        od.itemno,
        od.msunit,
        od.qty,
        od.prc,
        od.locsum,
        od.untaxprc,
        od.untaxlocsum,
        od.tax,
        od.taxsum,
        od.remarks AS line_remarks,
        it.itemname,
        it.descript,
        it.sizeno,
        it.itemtype,
        mu.msname,
        fc.compname,
        fc.simplename,
        fc.address
      FROM dbo.ordermst om
      JOIN dbo.orderdet od ON od.sysno = om.sysno
      LEFT JOIN dbo.itemdata it ON it.itemno = od.itemno
      LEFT JOIN dbo.msunit mu ON mu.msunit = od.msunit AND (mu.itemno = od.itemno OR mu.itemno IS NULL OR mu.itemno = '')
      LEFT JOIN dbo.fg_customfile fc ON fc.compno = om.compno
      WHERE om.carddt >= '20260101' AND om.carddt < '20270101'
      ORDER BY om.carddt, om.sysno, od.lineid;
    `);
    return result.recordset;
  } finally {
    await pool.close();
  }
}

function groupOrders(rows) {
  const orders = new Map();
  for (const row of rows) {
    if (!orders.has(row.sysno)) {
      orders.set(row.sysno, {
        header: row,
        lines: [],
      });
    }
    orders.get(row.sysno).lines.push(row);
  }
  return [...orders.values()];
}

async function getOrCreateCustomer(conn, row) {
  const code = String(row.compno || 'NG_UNKNOWN').trim();
  const name = String(row.compname || row.simplename || code).trim();
  const [existing] = await conn.query('SELECT id FROM customers WHERE code = ? LIMIT 1', [code]);
  if (existing.length) {
    await conn.query(
      `UPDATE customers
       SET name = CASE WHEN name IS NULL OR name = '' THEN ? ELSE name END,
           address = CASE WHEN address IS NULL OR address = '' THEN ? ELSE address END,
           status = 'active',
           updated_at = NOW()
       WHERE id = ?`,
      [name, row.address || null, existing[0].id]
    );
    return existing[0].id;
  }

  const [result] = await conn.query(
    `INSERT INTO customers (code, name, address, status, remark)
     VALUES (?, ?, ?, 'active', ?)`,
    [code, name, row.address || null, `NG0001导入客户 ${code}`]
  );
  return result.insertId;
}

async function getOrCreateUnit(conn, row) {
  const code = String(row.msunit || '').trim();
  if (!code) return null;
  const name = String(row.msname || code).trim();
  const [existing] = await conn.query('SELECT id FROM units WHERE code = ? LIMIT 1', [code]);
  if (existing.length) return existing[0].id;
  const [result] = await conn.query('INSERT INTO units (code, name, status, remark) VALUES (?, ?, 1, ?)', [
    code,
    name,
    `NG0001导入单位 ${code}`,
  ]);
  return result.insertId;
}

async function getOrCreateMaterial(conn, row, unitId) {
  const code = String(row.itemno || '').trim();
  if (!code) return null;
  const name = String(row.itemname || row.descript || code).trim();
  const specs = String(row.descript || row.sizeno || '').trim() || null;
  const price = round(row.prc || 0, 2);
  const [existing] = await conn.query('SELECT id FROM materials WHERE code = ? LIMIT 1', [code]);
  if (existing.length) {
    await conn.query(
      `UPDATE materials
       SET name = CASE WHEN name IS NULL OR name = '' THEN ? ELSE name END,
           specs = CASE WHEN specs IS NULL OR specs = '' THEN ? ELSE specs END,
           unit_id = COALESCE(unit_id, ?),
           price = CASE WHEN (price IS NULL OR price = 0) AND ? > 0 THEN ? ELSE price END,
           status = 1,
           updated_at = NOW()
       WHERE id = ?`,
      [name, specs, unitId, price, price, existing[0].id]
    );
    return existing[0].id;
  }

  const [result] = await conn.query(
    `INSERT INTO materials (code, name, specs, unit_id, material_type, price, tax_rate, status, remark)
     VALUES (?, ?, ?, ?, 'finished_goods', ?, ?, 1, ?)`,
    [code, name, specs, unitId, price, round(row.tax || 0.13, 4), `NG0001导入物料 ${code}`]
  );
  return result.insertId;
}

async function clearOldSalesData(conn, ids) {
  const entryWhere = "document_type IN ('sales_outbound', '发票', '收款单') OR transaction_type IN ('sales_outbound', 'ar_invoice', 'ar_receipt')";
  const [entryRows] = await conn.query(`SELECT id FROM gl_entries WHERE ${entryWhere}`).catch(() => [[]]);
  const entryIds = entryRows.map(row => row.id);

  if (entryIds.length && (await tableExists(conn, 'gl_entry_items'))) {
    await conn.query('DELETE FROM gl_entry_items WHERE entry_id IN (?)', [entryIds]);
  }
  if (entryIds.length) {
    await conn.query('DELETE FROM gl_entries WHERE id IN (?)', [entryIds]);
  }

  if (ids.receiptIds.length) {
    await conn.query('DELETE FROM ar_receipt_items WHERE receipt_id IN (?)', [ids.receiptIds]);
    await conn.query('DELETE FROM ar_receipts WHERE id IN (?)', [ids.receiptIds]);
  }
  if (ids.invoiceIds.length) {
    await conn.query('DELETE FROM ar_invoice_items WHERE invoice_id IN (?)', [ids.invoiceIds]);
    await conn.query('DELETE FROM ar_invoices WHERE id IN (?)', [ids.invoiceIds]);
  }

  await conn.query('DELETE FROM document_links WHERE source_type IN (?) OR target_type IN (?)', [SALES_TYPES, SALES_TYPES]);

  if (ids.inventoryOutboundIds.length) {
    if (await tableExists(conn, 'archive_20260522_material_supply_records')) {
      await conn.query('UPDATE archive_20260522_material_supply_records SET outbound_id = NULL WHERE outbound_id IN (?)', [
        ids.inventoryOutboundIds,
      ]).catch(() => {});
    }
    await conn.query('DELETE FROM inventory_outbound_items WHERE outbound_id IN (?)', [ids.inventoryOutboundIds]);
    await conn.query('DELETE FROM inventory_outbound WHERE id IN (?)', [ids.inventoryOutboundIds]);
  }

  await conn.query('DELETE sri FROM sales_return_items sri JOIN sales_returns sr ON sr.id = sri.return_id');
  await conn.query('DELETE FROM sales_returns');
  await conn.query('DELETE FROM sales_outbound_items');
  await conn.query('DELETE FROM sales_outbound');
  await conn.query('DELETE FROM inventory_reservations');
  await conn.query('DELETE FROM sales_order_items');
  await conn.query('DELETE FROM sales_orders');
}

async function importOrders(conn, groupedOrders) {
  let orderCount = 0;
  let itemCount = 0;

  for (const order of groupedOrders) {
    const header = order.header;
    const customerId = await getOrCreateCustomer(conn, header);
    const normalizedLines = order.lines.map(line => ({
      ...line,
      importedQuantity: Math.round(toNumber(line.qty)),
      importedUnitPrice: round(line.untaxprc, 4),
      importedTaxRate: round(line.tax, 4),
    }));
    for (const line of normalizedLines) {
      line.importedAmount = round(line.importedQuantity * line.importedUnitPrice, 2);
      line.importedTaxAmount = round(line.importedAmount * line.importedTaxRate, 2);
    }
    const subtotal = round(normalizedLines.reduce((sum, line) => sum + line.importedAmount, 0), 2);
    const taxAmount = round(normalizedLines.reduce((sum, line) => sum + line.importedTaxAmount, 0), 2);
    const totalAmount = round(subtotal + taxAmount, 2);
    const taxRate = order.lines.length ? round(toNumber(order.lines[0].tax, 0.13), 4) : 0.13;
    const remarks = [
      header.order_remarks,
      `NG0001销售订单:${header.sysno}`,
      header.pinsideno ? `客户单号:${header.pinsideno}` : null,
    ].filter(Boolean).join('；');

    const [result] = await conn.query(
      `INSERT INTO sales_orders
        (order_no, customer_id, quotation_id, contract_code, total_amount, tax_rate, tax_amount, subtotal,
         payment_terms, delivery_date, status, remarks, created_by, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 1, ?, NOW())`,
      [
        header.sysno,
        customerId,
        header.contractno || header.pinsideno || null,
        totalAmount || round(header.order_locsum || header.order_amount || 0, 2),
        taxRate,
        taxAmount,
        subtotal,
        toDateOnly(header.senddt || header.plan_dt),
        statusFromNg(header),
        remarks,
        header.carddt || new Date(),
      ]
    );

    const orderId = result.insertId;
    orderCount += 1;

    for (const line of normalizedLines) {
      const unitId = await getOrCreateUnit(conn, line);
      const materialId = await getOrCreateMaterial(conn, line, unitId);
      await conn.query(
        `INSERT INTO sales_order_items
          (order_id, material_id, quantity, unit_price, amount, tax_percent, remark, product_code, product_specs)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          materialId,
          line.importedQuantity,
          line.importedUnitPrice,
          line.importedAmount,
          line.importedTaxRate,
          line.line_remarks || '',
          line.itemno,
          line.descript || line.sizeno || null,
        ]
      );
      itemCount += 1;
    }
  }

  return { orderCount, itemCount };
}

async function validate(conn) {
  const [[orderCount]] = await conn.query('SELECT COUNT(*) AS count FROM sales_orders');
  const [[itemCount]] = await conn.query('SELECT COUNT(*) AS count FROM sales_order_items');
  const [[emptyOrders]] = await conn.query(`
    SELECT COUNT(*) AS count
    FROM sales_orders so
    LEFT JOIN sales_order_items soi ON soi.order_id = so.id
    WHERE soi.id IS NULL
  `);
  const [[amountDiffs]] = await conn.query(`
    SELECT COUNT(*) AS count
    FROM sales_orders so
    JOIN (
      SELECT order_id,
             ROUND(SUM(amount), 2) AS line_subtotal,
             ROUND(SUM(ROUND(amount * CASE WHEN COALESCE(tax_percent, 0) > 1 THEN tax_percent / 100 ELSE COALESCE(tax_percent, 0) END, 2)), 2) AS line_tax
      FROM sales_order_items
      GROUP BY order_id
    ) x ON x.order_id = so.id
    WHERE ABS(ROUND(so.subtotal, 2) - x.line_subtotal) > 0.01
       OR ABS(ROUND(so.tax_amount, 2) - x.line_tax) > 0.01
       OR ABS(ROUND(so.total_amount, 2) - ROUND(x.line_subtotal + x.line_tax, 2)) > 0.01
  `);
  return {
    sales_orders: orderCount.count,
    sales_order_items: itemCount.count,
    empty_orders: emptyOrders.count,
    amount_mismatches: amountDiffs.count,
  };
}

async function main() {
  console.log('Reading NG0001 sales orders with SELECT only...');
  const rows = await fetchNgOrders();
  const groupedOrders = groupOrders(rows);
  console.log(`NG0001 rows: orders=${groupedOrders.length}, items=${rows.length}`);

  const conn = await mysql.createConnection(localConfig);
  try {
    await conn.beginTransaction();
    const backup = await writeBackup(conn);
    console.log(`Backup written: ${backup.file}`);
    await clearOldSalesData(conn, backup);
    const imported = await importOrders(conn, groupedOrders);
    const result = await validate(conn);
    await conn.commit();
    console.log('Import committed.');
    console.log(JSON.stringify({ imported, validation: result }, null, 2));
  } catch (error) {
    await conn.rollback();
    console.error('Import rolled back.');
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
