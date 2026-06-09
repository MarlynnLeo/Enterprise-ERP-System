require('dotenv').config();

const db = require('../src/config/db');
const GLService = require('../src/services/finance/GLService');
const DocumentLinkService = require('../src/services/business/DocumentLinkService');
const TaxAccountingService = require('../src/services/business/TaxAccountingService');
const { accountingConfig } = require('../src/config/accountingConfig');

const DOC_ADJUSTMENT = '\u8c03\u6574\u5355';
const DOC_INVOICE = '\u53d1\u7968';
const STATUS_UNCERTIFIED = '\u672a\u8ba4\u8bc1';
const STATUS_CERTIFIED = '\u5df2\u8ba4\u8bc1';
const TAX_OUTPUT = '\u9500\u9879';
const TAX_INPUT = '\u8fdb\u9879';
const VOUCHER_WORD = '\u8bb0';

function toNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
}

function sameMoney(a, b) {
  return Math.abs(Math.round(toNumber(a) * 100) - Math.round(toNumber(b) * 100)) <= 1;
}

function toDateOnly(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

async function getAccountIdByCode(connection, accountCode) {
  const [rows] = await connection.execute(
    'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = 1 LIMIT 1',
    [accountCode]
  );
  if (rows.length === 0) {
    throw new Error(`Missing active GL account: ${accountCode}`);
  }
  return rows[0].id;
}

async function getAccountIds(connection) {
  await accountingConfig.loadFromDatabase(db);
  return {
    salesCostId: await getAccountIdByCode(
      connection,
      accountingConfig.getAccountCode('SALES_COST')
    ),
    rawMaterialsId: await getAccountIdByCode(
      connection,
      accountingConfig.getAccountCode('RAW_MATERIALS')
    ),
    inventoryId: await getAccountIdByCode(
      connection,
      accountingConfig.getAccountCode('INVENTORY_GOODS')
        || accountingConfig.getAccountCode('INVENTORY')
    ),
  };
}

async function getEntryNumber(connection, entryId) {
  const [rows] = await connection.execute('SELECT entry_number FROM gl_entries WHERE id = ?', [
    entryId,
  ]);
  return rows[0]?.entry_number || null;
}

async function nextReversalDocumentNumber(connection, documentType, documentNumber) {
  const source = documentNumber || 'ENTRY';
  const base = `R-${source}`.slice(0, 50);
  let candidate = base;

  for (let suffix = 2; suffix <= 100; suffix += 1) {
    const [rows] = await connection.execute(
      `SELECT id
       FROM gl_entries
       WHERE document_type <=> ?
         AND document_number = ?
       LIMIT 1
       FOR UPDATE`,
      [documentType || null, candidate]
    );
    if (rows.length === 0) return candidate;

    const suffixText = `-${suffix}`;
    candidate = `${base.slice(0, 50 - suffixText.length)}${suffixText}`;
  }

  throw new Error(`Cannot allocate reversal document number for ${documentNumber}`);
}

async function reverseEntry(connection, entryId, reason, summary) {
  const [entries] = await connection.execute(
    `SELECT id, entry_number, entry_date, posting_date, document_type, document_number,
            period_id, is_posted, is_reversed, voucher_word, transaction_type
       FROM gl_entries
       WHERE id = ?
       FOR UPDATE`,
    [entryId]
  );

  const entry = entries[0];
  if (!entry || Number(entry.is_reversed) === 1) return null;
  if (Number(entry.is_posted) !== 1) {
    throw new Error(`Cannot reverse unposted entry ${entry.entry_number}`);
  }

  const [items] = await connection.execute(
    `SELECT account_id, debit_amount, credit_amount, currency_code, exchange_rate,
            cost_center_id, description
       FROM gl_entry_items
       WHERE entry_id = ?
       ORDER BY line_number, id
       FOR UPDATE`,
    [entryId]
  );
  if (items.length === 0) throw new Error(`Entry ${entry.entry_number} has no items`);

  const reversalDocumentNumber = await nextReversalDocumentNumber(
    connection,
    entry.document_type,
    entry.document_number || entry.entry_number
  );
  const reversalEntryId = await GLService.createEntry(
    {
      entry_date: toDateOnly(entry.entry_date),
      posting_date: toDateOnly(entry.posting_date || entry.entry_date),
      period_id: entry.period_id,
      document_type: entry.document_type,
      document_number: reversalDocumentNumber,
      description: `Automatic repair reversal for ${entry.entry_number}: ${reason}`,
      created_by: 'system',
      voucher_word: entry.voucher_word || VOUCHER_WORD,
      status: 'posted',
      is_posted: 1,
      transaction_type: `${entry.transaction_type || entry.document_type || 'GL'}_REVERSAL`,
    },
    items.map((item) => ({
      account_id: item.account_id,
      debit_amount: item.credit_amount,
      credit_amount: item.debit_amount,
      currency_code: item.currency_code || 'CNY',
      exchange_rate: item.exchange_rate || 1,
      cost_center_id: item.cost_center_id || null,
      description: `Repair reversal: ${item.description || ''}`.slice(0, 500),
    })),
    connection
  );

  await connection.execute(
    "UPDATE gl_entries SET is_reversed = 1, reversal_entry_id = ?, status = 'reversed' WHERE id = ?",
    [reversalEntryId, entryId]
  );

  summary.reversedEntries.push({
    originalEntryId: entryId,
    reversalEntryId,
    originalEntryNumber: entry.entry_number,
    reason,
  });
  return reversalEntryId;
}

async function repairFinishedGoodsCosts(connection, summary) {
  const [tasks] = await connection.execute(
    `SELECT pt.id, pt.code, pt.product_id,
            COALESCE(NULLIF(pt.completed_quantity, 0), NULLIF(ac.quantity, 0), NULLIF(pt.quantity, 0)) AS produced_quantity,
            ac.total_cost
       FROM actual_costs ac
       JOIN production_tasks pt ON pt.id = ac.production_order_id
       WHERE ac.total_cost > 0`
  );

  for (const task of tasks) {
    const producedQuantity = toNumber(task.produced_quantity);
    if (producedQuantity <= 0) continue;
    const unitCost = round(toNumber(task.total_cost) / producedQuantity, 4);
    if (unitCost <= 0) continue;

    await connection.execute('UPDATE materials SET cost_price = ? WHERE id = ?', [
      unitCost,
      task.product_id,
    ]);

    const [ledgerResult] = await connection.execute(
      `UPDATE inventory_ledger il
       LEFT JOIN inventory_inbound_items iii
         ON iii.material_id = il.material_id
        AND iii.batch_number COLLATE utf8mb4_0900_ai_ci =
            il.batch_number COLLATE utf8mb4_0900_ai_ci
       LEFT JOIN inventory_inbound ii
         ON ii.id = iii.inbound_id
       SET il.unit_cost = ?,
           il.total_value = ROUND(ABS(il.quantity) * ?, 2)
       WHERE il.transaction_type = 'production_inbound'
         AND il.material_id = ?
         AND (
           (ii.reference_type = 'production_task' AND ii.reference_id = ?)
           OR iii.batch_number COLLATE utf8mb4_0900_ai_ci LIKE ?
           OR iii.remark COLLATE utf8mb4_0900_ai_ci LIKE ?
         )`,
      [unitCost, unitCost, task.product_id, task.id, `%${task.code}%`, `%${task.code}%`]
    );

    summary.finishedGoodsCostUpdates.push({
      taskId: task.id,
      taskCode: task.code,
      productId: task.product_id,
      unitCost,
      ledgerRows: ledgerResult.affectedRows || 0,
    });
  }
}

async function repairProductionOutboundLedger(connection, summary) {
  const [result] = await connection.execute(
    `UPDATE inventory_ledger il
     JOIN materials m ON m.id = il.material_id
     SET il.unit_cost = COALESCE(NULLIF(m.cost_price, 0), il.unit_cost),
         il.total_value = ROUND(ABS(il.quantity) * COALESCE(NULLIF(m.cost_price, 0), il.unit_cost), 2)
     WHERE il.transaction_type = 'production_outbound'
       AND COALESCE(m.cost_price, 0) > 0`
  );
  summary.productionOutboundLedgerRows = result.affectedRows || 0;
}

async function getPostedAccountNet(connection, accountId) {
  const [rows] = await connection.execute(
    `SELECT COALESCE(SUM(gi.debit_amount - gi.credit_amount), 0) AS net_amount
       FROM gl_entry_items gi
       JOIN gl_entries ge ON ge.id = gi.entry_id
      WHERE ge.is_posted = 1
        AND gi.account_id = ?`,
    [accountId]
  );
  return round(rows[0]?.net_amount || 0, 2);
}

async function repairRawMaterialReclassification(connection, accountIds, summary) {
  const documentType = 'inventory_reclass';
  const documentNumber = 'RAW-MATERIAL-RECLASS-20260606';
  const [existing] = await connection.execute(
    `SELECT id, entry_number
       FROM gl_entries
      WHERE document_type = ?
        AND document_number = ?
        AND COALESCE(is_reversed, 0) = 0
      LIMIT 1
      FOR UPDATE`,
    [documentType, documentNumber]
  );
  if (existing.length > 0) {
    summary.rawMaterialReclassification = {
      skipped: true,
      entryId: existing[0].id,
      entryNumber: existing[0].entry_number,
    };
    return;
  }

  const rawNet = await getPostedAccountNet(connection, accountIds.rawMaterialsId);
  const inventoryNet = await getPostedAccountNet(connection, accountIds.inventoryId);
  const reclassAmount = round(Math.min(Math.abs(Math.min(rawNet, 0)), Math.max(inventoryNet, 0)), 2);
  if (reclassAmount <= 0) {
    summary.rawMaterialReclassification = { skipped: true, rawNet, inventoryNet };
    return;
  }

  const entryDate = '2026-06-06';
  const entryId = await GLService.createEntry(
    {
      entry_date: entryDate,
      posting_date: entryDate,
      document_type: documentType,
      document_number: documentNumber,
      description: 'Reclass purchased production components from inventory goods to raw materials',
      created_by: 'system',
      voucher_word: VOUCHER_WORD,
      status: 'posted',
      is_posted: 1,
      transaction_type: documentType,
    },
    [
      {
        account_id: accountIds.rawMaterialsId,
        debit_amount: reclassAmount,
        credit_amount: 0,
        description: 'Raw materials reclass for production components',
      },
      {
        account_id: accountIds.inventoryId,
        debit_amount: 0,
        credit_amount: reclassAmount,
        description: 'Inventory goods reclass for production components',
      },
    ],
    connection
  );
  summary.rawMaterialReclassification = {
    entryId,
    entryNumber: await getEntryNumber(connection, entryId),
    amount: reclassAmount,
    rawNetBefore: rawNet,
    inventoryNetBefore: inventoryNet,
  };
}

async function reverseWrongProductionIssueAdjustments(connection, accountIds, summary) {
  const [entries] = await connection.execute(
    `SELECT DISTINCT ge.id
       FROM gl_entries ge
       JOIN gl_entry_items gi ON gi.entry_id = ge.id
       JOIN inventory_outbound io
         ON ge.document_number LIKE CONCAT(io.outbound_no, '-M%')
       WHERE ge.document_type = ?
         AND COALESCE(ge.is_reversed, 0) = 0
         AND gi.account_id = ?
         AND (
           io.production_task_id IS NOT NULL
           OR io.reference_type IN ('production_task', 'production_plan', 'batch_production_tasks')
         )
       FOR UPDATE`,
    [DOC_ADJUSTMENT, accountIds.salesCostId]
  );

  for (const entry of entries) {
    await reverseEntry(
      connection,
      entry.id,
      'production issue was incorrectly posted to sales cost',
      summary
    );
  }
}

async function getLatestActualUnitCost(connection, productId) {
  const [rows] = await connection.execute(
    `SELECT total_cost, quantity
       FROM actual_costs
       WHERE product_id = ?
         AND total_cost > 0
         AND quantity > 0
       ORDER BY calculated_at DESC, id DESC
       LIMIT 1`,
    [productId]
  );
  if (rows.length === 0) return 0;
  return toNumber(rows[0].total_cost) / toNumber(rows[0].quantity);
}

async function calculateSalesOutboundCost(connection, outboundId) {
  const [items] = await connection.execute(
    `SELECT soi.product_id, soi.quantity,
            COALESCE(m.cost_price, 0) AS cost_price,
            COALESCE(m.price, 0) AS price
       FROM sales_outbound_items soi
       LEFT JOIN materials m ON m.id = soi.product_id
       WHERE soi.outbound_id = ?`,
    [outboundId]
  );

  let totalCost = 0;
  const itemCosts = [];
  for (const item of items) {
    const quantity = toNumber(item.quantity);
    let unitCost = toNumber(item.cost_price);
    if (unitCost <= 0) unitCost = await getLatestActualUnitCost(connection, item.product_id);
    if (unitCost <= 0) unitCost = toNumber(item.price);
    unitCost = round(unitCost, 4);
    const amount = round(quantity * unitCost, 2);
    totalCost = round(totalCost + amount, 2);
    itemCosts.push({ ...item, quantity, unitCost, amount });
  }

  return { totalCost, itemCosts };
}

async function repairSalesOutboundCosts(connection, accountIds, summary) {
  const [outbounds] = await connection.execute(
    `SELECT id, outbound_no, delivery_date, created_by
       FROM sales_outbound
       WHERE status = 'completed'
         AND deleted_at IS NULL
       ORDER BY id`
  );

  for (const outbound of outbounds) {
    const { totalCost, itemCosts } = await calculateSalesOutboundCost(connection, outbound.id);
    if (totalCost <= 0) continue;

    for (const item of itemCosts) {
      await connection.execute(
        `UPDATE inventory_ledger
         SET unit_cost = ?,
             total_value = ROUND(ABS(quantity) * ?, 2)
         WHERE transaction_type = 'sales_outbound'
           AND reference_no = ?
           AND material_id = ?`,
        [item.unitCost, item.unitCost, outbound.outbound_no, item.product_id]
      );
    }

    const [existingRows] = await connection.execute(
      `SELECT ge.id, ge.entry_number,
              COALESCE(SUM(CASE WHEN gi.account_id = ? THEN gi.debit_amount ELSE 0 END), 0) AS posted_cost
         FROM gl_entries ge
         LEFT JOIN gl_entry_items gi ON gi.entry_id = ge.id
        WHERE ge.document_type = 'sales_outbound'
          AND ge.document_number = ?
          AND COALESCE(ge.is_reversed, 0) = 0
        GROUP BY ge.id, ge.entry_number
        LIMIT 1
        FOR UPDATE`,
      [accountIds.salesCostId, outbound.outbound_no]
    );

    const existing = existingRows[0];
    if (existing && sameMoney(existing.posted_cost, totalCost)) {
      summary.salesCostEntriesChecked += 1;
      continue;
    }

    if (existing) {
      await reverseEntry(
        connection,
        existing.id,
        `sales outbound cost should be ${totalCost.toFixed(2)}`,
        summary
      );
    }

    const entryId = await GLService.createEntry(
      {
        entry_date: toDateOnly(outbound.delivery_date),
        posting_date: toDateOnly(outbound.delivery_date),
        document_type: 'sales_outbound',
        document_number: outbound.outbound_no,
        description: `Sales cost correction - ${outbound.outbound_no}`,
        created_by: outbound.created_by || 'system',
        status: 'posted',
        is_posted: 1,
        transaction_type: 'sales_outbound',
        transaction_id: outbound.id,
      },
      [
        {
          account_id: accountIds.salesCostId,
          debit_amount: totalCost,
          credit_amount: 0,
          description: `Sales cost - ${outbound.outbound_no}`,
        },
        {
          account_id: accountIds.inventoryId,
          debit_amount: 0,
          credit_amount: totalCost,
          description: `Inventory decrease - ${outbound.outbound_no}`,
        },
      ],
      connection
    );
    const entryNumber = await getEntryNumber(connection, entryId);
    await DocumentLinkService.tryAutoLink(
      'sales_outbound',
      outbound.id,
      outbound.outbound_no,
      'finance_voucher',
      entryId,
      entryNumber,
      outbound.created_by || null,
      connection
    );

    summary.salesCostEntriesRebuilt.push({
      outboundId: outbound.id,
      outboundNo: outbound.outbound_no,
      entryId,
      entryNumber,
      totalCost,
    });
  }
}

async function syncOperationalStatuses(connection, summary) {
  const [salesOutboundTotals] = await connection.execute(
    `UPDATE sales_outbound so
     JOIN (
       SELECT outbound_id,
              ROUND(SUM(COALESCE(amount, quantity * COALESCE(price, 0))), 2) AS total_amount
         FROM sales_outbound_items
        GROUP BY outbound_id
     ) x ON x.outbound_id = so.id
     SET so.total_amount = x.total_amount,
         so.updated_at = NOW()
     WHERE COALESCE(so.total_amount, 0) <> x.total_amount`
  );
  summary.salesOutboundTotalsUpdated = salesOutboundTotals.affectedRows || 0;

  const [salesOrders] = await connection.execute(
    `UPDATE sales_orders so
     SET so.invoice_status = 'invoiced',
         so.updated_at = NOW()
     WHERE EXISTS (
       SELECT 1
         FROM ar_invoices ai
        WHERE ai.source_type = 'sales_order'
          AND ai.source_id = so.id
          AND ai.status <> 'void'
     )
       AND COALESCE(so.invoice_status, '') <> 'invoiced'`
  );
  summary.salesOrdersInvoiceStatusUpdated = salesOrders.affectedRows || 0;

  const [purchaseReceipts] = await connection.execute(
    `UPDATE purchase_receipts pr
     SET pr.invoice_status = 'invoiced',
         pr.updated_at = NOW()
     WHERE EXISTS (
       SELECT 1
         FROM ap_invoices ai
        WHERE ai.source_type = 'purchase_receipt'
          AND ai.source_id = pr.id
          AND ai.status <> 'void'
     )
       AND COALESCE(pr.invoice_status, '') <> 'invoiced'`
  );
  summary.purchaseReceiptsInvoiceStatusUpdated = purchaseReceipts.affectedRows || 0;
}

async function certifyGeneratedTaxInvoices(connection, summary) {
  const [invoices] = await connection.execute(
    `SELECT id, invoice_type, invoice_number, invoice_code, invoice_date, supplier_id, customer_id,
            supplier_or_customer_name, supplier_tax_number, amount_excluding_tax, tax_rate,
            tax_amount, total_amount, status, certification_date, deduction_date,
            related_document_type, related_document_id, gl_entry_id, remark, created_by,
            created_at, updated_at
       FROM tax_invoices
      WHERE gl_entry_id IS NULL
        AND status = ?
      ORDER BY id
      FOR UPDATE`,
    [STATUS_UNCERTIFIED]
  );

  for (const invoice of invoices) {
    const certificationDate = toDateOnly(invoice.invoice_date);
    await connection.execute(
      'UPDATE tax_invoices SET status = ?, certification_date = ? WHERE id = ?',
      [STATUS_CERTIFIED, certificationDate, invoice.id]
    );

    const updatedInvoice = {
      ...invoice,
      status: STATUS_CERTIFIED,
      certification_date: certificationDate,
    };

    let entryInfo = null;
    if (invoice.invoice_type === TAX_OUTPUT) {
      entryInfo = await TaxAccountingService.generateOutputTaxEntry(updatedInvoice, 1, connection);
    } else if (invoice.invoice_type === TAX_INPUT) {
      entryInfo = await TaxAccountingService.generateInputTaxEntry(updatedInvoice, 1, connection);
    }

    summary.taxInvoicesCertified.push({
      taxInvoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceType: invoice.invoice_type,
      entryInfo,
    });
  }
}

async function run() {
  const summary = {
    finishedGoodsCostUpdates: [],
    productionOutboundLedgerRows: 0,
    reversedEntries: [],
    salesCostEntriesChecked: 0,
    salesCostEntriesRebuilt: [],
    salesOutboundTotalsUpdated: 0,
    salesOrdersInvoiceStatusUpdated: 0,
    purchaseReceiptsInvoiceStatusUpdated: 0,
    taxInvoicesCertified: [],
  };

  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const accountIds = await getAccountIds(connection);
    await repairFinishedGoodsCosts(connection, summary);
    await repairProductionOutboundLedger(connection, summary);
    await reverseWrongProductionIssueAdjustments(connection, accountIds, summary);
    await repairRawMaterialReclassification(connection, accountIds, summary);
    await repairSalesOutboundCosts(connection, accountIds, summary);
    await syncOperationalStatuses(connection, summary);
    await certifyGeneratedTaxInvoices(connection, summary);

    await connection.commit();
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    await connection.rollback();
    console.error(error);
    process.exitCode = 1;
  } finally {
    connection.release();
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  }
}

run();
