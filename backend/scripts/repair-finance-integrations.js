#!/usr/bin/env node

const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');
const financeModel = require('../src/models/finance');
const FinanceIntegrationService = require('../src/services/external/FinanceIntegrationService');
const DocumentLinkService = require('../src/services/business/DocumentLinkService');
const { accountingConfig } = require('../src/config/accountingConfig');

const DOCUMENT_TYPES = {
  invoice: '发票',
  arReceipt: '收款单',
  apPayment: '付款单',
};

async function accountId(connection, code) {
  const [rows] = await connection.execute(
    'SELECT id FROM gl_accounts WHERE account_code = ? LIMIT 1',
    [code]
  );
  if (rows.length === 0) {
    throw new Error(`Missing GL account ${code}`);
  }
  return rows[0].id;
}

async function ensureAccount(connection, account) {
  const [existing] = await connection.execute(
    'SELECT id FROM gl_accounts WHERE account_code = ? LIMIT 1',
    [account.account_code]
  );
  if (existing.length > 0) return existing[0].id;

  const [result] = await connection.execute(
    `INSERT INTO gl_accounts
      (account_code, account_name, account_type, type, is_debit, is_active, currency_code, description)
     VALUES (?, ?, ?, ?, ?, 1, 'CNY', ?)`,
    [
      account.account_code,
      account.account_name,
      account.account_type,
      account.type,
      account.is_debit,
      account.description || null,
    ]
  );
  return result.insertId;
}

async function openPeriodId(connection, entryDate) {
  const [byDate] = await connection.execute(
    `SELECT id, start_date FROM gl_periods
     WHERE is_closed = 0 AND start_date <= ? AND end_date >= ?
     ORDER BY start_date DESC LIMIT 1`,
    [entryDate, entryDate]
  );
  if (byDate.length > 0) {
    return { id: byDate[0].id, entryDate };
  }

  const [fallback] = await connection.execute(
    `SELECT id, start_date FROM gl_periods
     WHERE is_closed = 0
     ORDER BY start_date ASC LIMIT 1`
  );
  if (fallback.length === 0) {
    throw new Error(`No open accounting period for ${entryDate}`);
  }
  return {
    id: fallback[0].id,
    entryDate: fallback[0].start_date,
  };
}

async function activeEntryByDocument(connection, documentNumber) {
  const [rows] = await connection.execute(
    `SELECT id, entry_number
     FROM gl_entries
     WHERE document_number = ?
       AND COALESCE(is_reversed, 0) = 0
     ORDER BY id DESC LIMIT 1`,
    [documentNumber]
  );
  return rows[0] || null;
}

async function ensureVoucherLink(connection, sourceType, sourceId, sourceCode, entryId, entryNumber, createdBy) {
  await DocumentLinkService.tryAutoLink(
    sourceType,
    sourceId,
    sourceCode,
    'finance_voucher',
    entryId,
    entryNumber,
    createdBy || null,
    connection
  );
}

async function createArInvoiceVoucher(connection, invoice, accounts) {
  const amount = Math.abs(Number(invoice.total_amount || 0));
  if (amount <= 0) return null;
  const isCredit = Number(invoice.total_amount || 0) < 0;
  const period = await openPeriodId(connection, invoice.invoice_date);
  const entryId = await financeModel.createEntry(
    {
      entry_date: period.entryDate,
      posting_date: period.entryDate,
      document_type: DOCUMENT_TYPES.invoice,
      document_number: invoice.invoice_number,
      period_id: period.id,
      description: `AR invoice ${invoice.invoice_number}`,
      created_by: invoice.created_by || 1,
      status: 'posted',
      is_posted: 1,
    },
    [
      {
        account_id: accounts.ar,
        debit_amount: isCredit ? 0 : amount,
        credit_amount: isCredit ? amount : 0,
        description: `AR invoice ${invoice.invoice_number}`,
      },
      {
        account_id: accounts.revenue,
        debit_amount: isCredit ? amount : 0,
        credit_amount: isCredit ? 0 : amount,
        description: `Sales revenue ${invoice.invoice_number}`,
      },
    ],
    connection
  );
  return entryId;
}

async function createApInvoiceVoucher(connection, invoice, accounts) {
  const amount = Math.abs(Number(invoice.total_amount || 0));
  if (amount <= 0) return null;
  const isCredit = Number(invoice.total_amount || 0) < 0;
  const period = await openPeriodId(connection, invoice.invoice_date);
  const entryId = await financeModel.createEntry(
    {
      entry_date: period.entryDate,
      posting_date: period.entryDate,
      document_type: DOCUMENT_TYPES.invoice,
      document_number: invoice.invoice_number,
      period_id: period.id,
      description: `AP invoice ${invoice.invoice_number}`,
      created_by: invoice.created_by || 1,
      status: 'posted',
      is_posted: 1,
    },
    [
      {
        account_id: accounts.grIr,
        debit_amount: isCredit ? 0 : amount,
        credit_amount: isCredit ? amount : 0,
        description: `Purchase receipt accrual ${invoice.invoice_number}`,
      },
      {
        account_id: accounts.ap,
        debit_amount: isCredit ? amount : 0,
        credit_amount: isCredit ? 0 : amount,
        description: `AP invoice ${invoice.invoice_number}`,
      },
    ],
    connection
  );
  return entryId;
}

async function createArReceiptVoucher(connection, receipt, accounts) {
  const amount = Number(receipt.total_amount || 0);
  if (amount <= 0) return null;
  const period = await openPeriodId(connection, receipt.receipt_date);
  return financeModel.createEntry(
    {
      entry_date: period.entryDate,
      posting_date: period.entryDate,
      document_type: DOCUMENT_TYPES.arReceipt,
      document_number: receipt.receipt_number,
      period_id: period.id,
      description: `AR receipt ${receipt.receipt_number}`,
      created_by: receipt.created_by || 1,
      status: 'posted',
      is_posted: 1,
    },
    [
      {
        account_id: receipt.payment_method === '现金' ? accounts.cash : accounts.bank,
        debit_amount: amount,
        credit_amount: 0,
        description: `AR receipt ${receipt.receipt_number}`,
      },
      {
        account_id: accounts.ar,
        debit_amount: 0,
        credit_amount: amount,
        description: `AR receipt ${receipt.receipt_number}`,
      },
    ],
    connection
  );
}

async function createApPaymentVoucher(connection, payment, accounts) {
  const amount = Number(payment.total_amount || 0);
  if (amount <= 0) return null;
  const period = await openPeriodId(connection, payment.payment_date);
  return financeModel.createEntry(
    {
      entry_date: period.entryDate,
      posting_date: period.entryDate,
      document_type: DOCUMENT_TYPES.apPayment,
      document_number: payment.payment_number,
      period_id: period.id,
      description: `AP payment ${payment.payment_number}`,
      created_by: payment.created_by || 1,
      status: 'posted',
      is_posted: 1,
    },
    [
      {
        account_id: accounts.ap,
        debit_amount: amount,
        credit_amount: 0,
        description: `AP payment ${payment.payment_number}`,
      },
      {
        account_id: payment.payment_method === '现金' ? accounts.cash : accounts.bank,
        debit_amount: 0,
        credit_amount: amount,
        description: `AP payment ${payment.payment_number}`,
      },
    ],
    connection
  );
}

async function repairInvoiceVouchers(connection, accounts) {
  const counters = { arCreated: 0, arLinked: 0, apCreated: 0, apLinked: 0 };

  const [arInvoices] = await connection.execute(
    `SELECT ai.*
     FROM ar_invoices ai
     WHERE ai.source_type = 'sales_order'
       AND ai.status <> '已取消'
       AND NOT EXISTS (
         SELECT 1 FROM document_links dl
         JOIN gl_entries ge ON ge.id = dl.target_id
         WHERE dl.source_type = 'ar_invoice'
           AND dl.source_id = ai.id
           AND dl.target_type = 'finance_voucher'
           AND COALESCE(ge.is_reversed, 0) = 0
       )`
  );

  for (const invoice of arInvoices) {
    let entry = await activeEntryByDocument(connection, invoice.invoice_number);
    if (!entry) {
      const entryId = await createArInvoiceVoucher(connection, invoice, accounts);
      entry = await activeEntryByDocument(connection, invoice.invoice_number);
      if (entryId) counters.arCreated += 1;
    }
    if (entry) {
      await ensureVoucherLink(
        connection,
        'ar_invoice',
        invoice.id,
        invoice.invoice_number,
        entry.id,
        entry.entry_number,
        invoice.created_by
      );
      counters.arLinked += 1;
    }
  }

  const [apInvoices] = await connection.execute(
    `SELECT ai.*
     FROM ap_invoices ai
     WHERE ai.source_type = 'purchase_receipt'
       AND ai.status <> '已取消'
       AND NOT EXISTS (
         SELECT 1 FROM document_links dl
         JOIN gl_entries ge ON ge.id = dl.target_id
         WHERE dl.source_type = 'ap_invoice'
           AND dl.source_id = ai.id
           AND dl.target_type = 'finance_voucher'
           AND COALESCE(ge.is_reversed, 0) = 0
       )`
  );

  for (const invoice of apInvoices) {
    let entry = await activeEntryByDocument(connection, invoice.invoice_number);
    if (!entry) {
      const entryId = await createApInvoiceVoucher(connection, invoice, accounts);
      entry = await activeEntryByDocument(connection, invoice.invoice_number);
      if (entryId) counters.apCreated += 1;
    }
    if (entry) {
      await ensureVoucherLink(
        connection,
        'ap_invoice',
        invoice.id,
        invoice.invoice_number,
        entry.id,
        entry.entry_number,
        invoice.created_by
      );
      counters.apLinked += 1;
    }
  }

  return counters;
}

async function repairCashVouchers(connection, accounts) {
  const counters = { arCreated: 0, arLinked: 0, apCreated: 0, apLinked: 0 };

  const [receipts] = await connection.execute(
    `SELECT *
     FROM ar_receipts r
     WHERE r.status <> 'void'
       AND NOT EXISTS (
         SELECT 1 FROM document_links dl
         JOIN gl_entries ge ON ge.id = dl.target_id
         WHERE dl.source_type = 'ar_receipt'
           AND dl.source_id = r.id
           AND dl.target_type = 'finance_voucher'
           AND COALESCE(ge.is_reversed, 0) = 0
       )`
  );

  for (const receipt of receipts) {
    let entry = await activeEntryByDocument(connection, receipt.receipt_number);
    if (!entry) {
      const entryId = await createArReceiptVoucher(connection, receipt, accounts);
      entry = await activeEntryByDocument(connection, receipt.receipt_number);
      if (entryId) counters.arCreated += 1;
    }
    if (entry) {
      await ensureVoucherLink(
        connection,
        'ar_receipt',
        receipt.id,
        receipt.receipt_number,
        entry.id,
        entry.entry_number,
        receipt.created_by
      );
      await connection.execute(
        `UPDATE bank_transactions
            SET gl_entry_id = ?
          WHERE transaction_number = ?
            AND gl_entry_id IS NULL`,
        [entry.id, receipt.receipt_number]
      );
      counters.arLinked += 1;
    }
  }

  const [payments] = await connection.execute(
    `SELECT *
     FROM ap_payments p
     WHERE p.status <> 'void'
       AND NOT EXISTS (
         SELECT 1 FROM document_links dl
         JOIN gl_entries ge ON ge.id = dl.target_id
         WHERE dl.source_type = 'ap_payment'
           AND dl.source_id = p.id
           AND dl.target_type = 'finance_voucher'
           AND COALESCE(ge.is_reversed, 0) = 0
       )`
  );

  for (const payment of payments) {
    let entry = await activeEntryByDocument(connection, payment.payment_number);
    if (!entry) {
      const entryId = await createApPaymentVoucher(connection, payment, accounts);
      entry = await activeEntryByDocument(connection, payment.payment_number);
      if (entryId) counters.apCreated += 1;
    }
    if (entry) {
      await ensureVoucherLink(
        connection,
        'ap_payment',
        payment.id,
        payment.payment_number,
        entry.id,
        entry.entry_number,
        payment.created_by
      );
      await connection.execute(
        `UPDATE bank_transactions
            SET gl_entry_id = ?
          WHERE transaction_number = ?
            AND gl_entry_id IS NULL`,
        [entry.id, payment.payment_number]
      );
      counters.apLinked += 1;
    }
  }

  return counters;
}

async function repairTaxLinks(connection) {
  const [result] = await connection.execute(
    `INSERT IGNORE INTO document_links
      (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
     SELECT 'purchase_receipt', pr.id, pr.receipt_no, 'tax_invoice', ti.id, ti.invoice_number,
            'generate', 'repair finance integration tax link', ti.created_by
       FROM tax_invoices ti
       JOIN purchase_receipts pr
         ON pr.id = ti.related_document_id
        AND ti.related_document_type = '采购入库单'
      WHERE ti.invoice_type = '进项'
        AND ti.status <> '已作废'`
  );

  return result.affectedRows || 0;
}

async function normalizeProductionDocumentTypes(connection) {
  const mappings = [
    ['production_material', ['PRODUCTION_MATERIAL', 'PRODUCTION_MATERIAL_ZERO_REPAIR']],
    ['production_labor', ['PRODUCTION_LABOR']],
    ['production_overhead', ['PRODUCTION_OVERHEAD']],
    ['production_completion', ['PRODUCTION_COMPLETE']],
  ];
  let updated = 0;
  for (const [documentType, transactionTypes] of mappings) {
    const placeholders = transactionTypes.map(() => '?').join(',');
    const [result] = await connection.execute(
      `UPDATE gl_entries
          SET document_type = ?
        WHERE transaction_type IN (${placeholders})
          AND (document_type IS NULL OR document_type LIKE '%?%' OR document_type LIKE '生产%')`,
      [documentType, ...transactionTypes]
    );
    updated += result.affectedRows || 0;
  }
  return updated;
}

async function generateMissingSalesCostVouchers(connection) {
  await connection.execute(
    `UPDATE gl_entries ge
      JOIN (
        SELECT e.id
        FROM gl_entries e
        JOIN gl_entry_items i ON i.entry_id = e.id
        WHERE e.document_type = 'sales_outbound'
          AND e.status = 'draft'
          AND COALESCE(e.is_reversed, 0) = 0
        GROUP BY e.id
        HAVING ABS(SUM(COALESCE(i.debit_amount, 0)) - SUM(COALESCE(i.credit_amount, 0))) <= 0.01
      ) balanced ON balanced.id = ge.id
      SET ge.status = 'posted',
          ge.is_posted = 1`
  );

  const [outbounds] = await connection.execute(
    `SELECT so.*, so.delivery_date AS outbound_date, ord.customer_id, c.name AS customer_name, ord.order_no
     FROM sales_outbound so
     LEFT JOIN sales_orders ord ON ord.id = so.order_id
     LEFT JOIN customers c ON c.id = ord.customer_id
     WHERE so.status = 'completed'
       AND so.deleted_at IS NULL
       AND COALESCE(so.total_amount, 0) > 0
       AND NOT EXISTS (
         SELECT 1 FROM gl_entries ge
         WHERE ge.document_type = 'sales_outbound'
           AND ge.document_number = so.outbound_no
           AND ge.status = 'posted'
           AND COALESCE(ge.is_reversed, 0) = 0
       )`
  );

  let generated = 0;
  for (const outbound of outbounds) {
    const result = await FinanceIntegrationService.generateCostEntryFromSalesOutbound(outbound);
    if (result && !result.skipped) generated += 1;
  }
  return generated;
}

async function generateMissingInputTaxInvoices(connection) {
  const [receipts] = await connection.execute(
    `SELECT pr.*
     FROM purchase_receipts pr
     WHERE pr.status IN ('confirmed', 'completed')
       AND pr.deleted_at IS NULL
       AND COALESCE(pr.total_amount, 0) > 0
       AND NOT EXISTS (
         SELECT 1
         FROM document_links dl
         JOIN tax_invoices ti ON ti.id = dl.target_id
         WHERE dl.source_type = 'purchase_receipt'
           AND dl.source_id = pr.id
           AND dl.target_type = 'tax_invoice'
           AND ti.invoice_type = '进项'
           AND ti.status <> '已作废'
       )`
  );

  let generated = 0;
  for (const receipt of receipts) {
    const result = await FinanceIntegrationService.generateInputTaxInvoiceFromPurchaseReceipt(
      receipt,
      receipt.created_by || null
    );
    if (result && !result.skipped) generated += 1;
  }
  return generated;
}

async function expenseAccountId(connection, expense, accounts) {
  const [categories] = await connection.execute(
    `SELECT gl_account_code
     FROM expense_categories
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [expense.category_id]
  );
  const accountCode = categories[0]?.gl_account_code;
  if (!accountCode) return accounts.adminExpense;
  try {
    return await accountId(connection, accountCode);
  } catch {
    return accounts.adminExpense;
  }
}

async function createExpenseVoucher(connection, expense, accounts) {
  let bankTransactionId = expense.payment_transaction_id || null;
  const amount = Number(expense.amount || 0);
  if (amount <= 0) return null;

  if (!bankTransactionId) {
    const transactionNumber = `EXP-PAY-${expense.id}`;
    const [existingTransactions] = await connection.execute(
      'SELECT id, gl_entry_id FROM bank_transactions WHERE transaction_number = ? LIMIT 1',
      [transactionNumber]
    );

    if (existingTransactions.length > 0) {
      bankTransactionId = existingTransactions[0].id;
    } else {
      const [result] = await connection.execute(
        `INSERT INTO bank_transactions
          (transaction_number, bank_account_id, transaction_date, transaction_type,
           amount, reference_number, description, is_reconciled, related_party,
           status, category, created_by)
         VALUES (?, ?, ?, '取款', ?, ?, ?, 0, ?, 'approved', 'expense', ?)`,
        [
          transactionNumber,
          expense.payment_bank_account_id || 7,
          expense.paid_at || expense.expense_date,
          amount,
          expense.expense_number,
          `Expense payment repair: ${expense.title}`,
          expense.payee || expense.title || null,
          expense.created_by || 1,
        ]
      );
      bankTransactionId = result.insertId;
      await connection.execute(
        `UPDATE bank_accounts
            SET current_balance = current_balance - ?,
                last_transaction_date = COALESCE(last_transaction_date, ?)
          WHERE id = ?`,
        [amount, expense.paid_at || expense.expense_date, expense.payment_bank_account_id || 7]
      );
    }

    await connection.execute(
      'UPDATE expenses SET payment_transaction_id = ? WHERE id = ?',
      [bankTransactionId, expense.id]
    );
  }

  const [bankRows] = await connection.execute(
    'SELECT id, transaction_number, gl_entry_id FROM bank_transactions WHERE id = ? FOR UPDATE',
    [bankTransactionId]
  );
  const bankTransaction = bankRows[0];
  if (!bankTransaction) return null;
  if (bankTransaction.gl_entry_id) {
    const [existing] = await connection.execute(
      'SELECT id, entry_number FROM gl_entries WHERE id = ? AND COALESCE(is_reversed, 0) = 0 LIMIT 1',
      [bankTransaction.gl_entry_id]
    );
    if (existing.length > 0) {
      await DocumentLinkService.tryAutoLink(
        'expense',
        expense.id,
        expense.expense_number,
        'finance_voucher',
        existing[0].id,
        existing[0].entry_number,
        expense.created_by || 1,
        connection
      );
      return { linked: true };
    }
  }

  const period = await openPeriodId(connection, expense.paid_at || expense.expense_date);
  const debitAccountId = await expenseAccountId(connection, expense, accounts);
  const entryId = await financeModel.createEntry(
    {
      entry_date: period.entryDate,
      posting_date: period.entryDate,
      document_type: 'expense_payment',
      document_number: expense.expense_number,
      period_id: period.id,
      description: `Expense payment ${expense.expense_number}`,
      created_by: expense.created_by || 1,
      status: 'posted',
      is_posted: 1,
    },
    [
      {
        account_id: debitAccountId,
        debit_amount: amount,
        credit_amount: 0,
        description: `Expense ${expense.title}`,
      },
      {
        account_id: accounts.bank,
        debit_amount: 0,
        credit_amount: amount,
        description: `Bank payment ${bankTransaction.transaction_number}`,
      },
    ],
    connection
  );
  const [entries] = await connection.execute('SELECT entry_number FROM gl_entries WHERE id = ?', [
    entryId,
  ]);
  await connection.execute('UPDATE bank_transactions SET gl_entry_id = ? WHERE id = ?', [
    entryId,
    bankTransactionId,
  ]);
  await DocumentLinkService.tryAutoLink(
    'expense',
    expense.id,
    expense.expense_number,
    'finance_voucher',
    entryId,
    entries[0]?.entry_number || null,
    expense.created_by || 1,
    connection
  );
  await DocumentLinkService.tryAutoLink(
    'bank_transaction',
    bankTransactionId,
    bankTransaction.transaction_number,
    'finance_voucher',
    entryId,
    entries[0]?.entry_number || null,
    expense.created_by || 1,
    connection
  );
  return { created: true };
}

async function createAssetImpairmentVoucher(connection, impairment, accounts) {
  const amount = Number(impairment.impairment_amount || 0);
  if (amount <= 0) return null;
  const voucherNo = impairment.voucher_no || `AIMP-${impairment.id}`;
  const [existingEntries] = await connection.execute(
    `SELECT id, entry_number
     FROM gl_entries
     WHERE document_number = ?
       AND COALESCE(is_reversed, 0) = 0
     LIMIT 1
     FOR UPDATE`,
    [voucherNo]
  );
  if (existingEntries.length > 0) {
    await connection.execute(
      'UPDATE asset_impairments SET gl_entry_id = ?, voucher_no = ? WHERE id = ?',
      [existingEntries[0].id, voucherNo, impairment.id]
    );
    return { linked: true };
  }

  const period = await openPeriodId(connection, impairment.impairment_date);
  const entryId = await financeModel.createEntry(
    {
      entry_date: period.entryDate,
      posting_date: period.entryDate,
      document_type: 'asset_impairment',
      document_number: voucherNo,
      period_id: period.id,
      description: `Asset impairment ${impairment.asset_code || impairment.asset_id}`,
      created_by: 1,
      status: 'posted',
      is_posted: 1,
    },
    [
      {
        account_id: accounts.assetImpairmentLoss,
        debit_amount: amount,
        credit_amount: 0,
        description: `Asset impairment loss ${impairment.asset_name || impairment.asset_id}`,
      },
      {
        account_id: accounts.fixedAssetImpairmentAllowance,
        debit_amount: 0,
        credit_amount: amount,
        description: `Asset impairment allowance ${impairment.asset_name || impairment.asset_id}`,
      },
    ],
    connection
  );
  const [entries] = await connection.execute('SELECT entry_number FROM gl_entries WHERE id = ?', [
    entryId,
  ]);
  await connection.execute(
    'UPDATE asset_impairments SET gl_entry_id = ?, voucher_no = ? WHERE id = ?',
    [entryId, voucherNo, impairment.id]
  );
  await DocumentLinkService.tryAutoLink(
    'asset_impairment',
    impairment.id,
    voucherNo,
    'finance_voucher',
    entryId,
    entries[0]?.entry_number || voucherNo,
    1,
    connection
  );
  await DocumentLinkService.tryAutoLink(
    'asset',
    impairment.asset_id,
    impairment.asset_code || `ASSET-${impairment.asset_id}`,
    'finance_voucher',
    entryId,
    entries[0]?.entry_number || voucherNo,
    1,
    connection
  );
  return { created: true };
}

async function createCashTransactionVoucher(connection, transaction, accounts) {
  const amount = Number(transaction.amount || 0);
  if (amount <= 0) return null;
  const existing = await activeEntryByDocument(connection, transaction.transaction_number);
  if (existing) {
    await connection.execute('UPDATE cash_transactions SET gl_entry_id = ? WHERE id = ?', [
      existing.id,
      transaction.id,
    ]);
    await ensureVoucherLink(
      connection,
      'cash_transaction',
      transaction.id,
      transaction.transaction_number,
      existing.id,
      existing.entry_number,
      transaction.created_by || 1
    );
    return { linked: true };
  }

  const period = await openPeriodId(connection, transaction.transaction_date);
  const isIncome = transaction.transaction_type === 'income';
  const entryId = await financeModel.createEntry(
    {
      entry_date: period.entryDate,
      posting_date: period.entryDate,
      document_type: isIncome ? 'cash_receipt' : 'cash_payment',
      document_number: transaction.transaction_number,
      period_id: period.id,
      description: `Cash transaction ${transaction.transaction_number}`,
      created_by: transaction.created_by || 1,
      status: 'posted',
      is_posted: 1,
    },
    isIncome
      ? [
        {
          account_id: accounts.cash,
          debit_amount: amount,
          credit_amount: 0,
          description: `Cash income ${transaction.transaction_number}`,
        },
        {
          account_id: accounts.revenue,
          debit_amount: 0,
          credit_amount: amount,
          description: `Cash income contra ${transaction.category || ''}`,
        },
      ]
      : [
        {
          account_id: accounts.adminExpense,
          debit_amount: amount,
          credit_amount: 0,
          description: `Cash expense ${transaction.transaction_number}`,
        },
        {
          account_id: accounts.cash,
          debit_amount: 0,
          credit_amount: amount,
          description: `Cash payment ${transaction.transaction_number}`,
        },
      ],
    connection
  );
  const [entries] = await connection.execute('SELECT entry_number FROM gl_entries WHERE id = ?', [
    entryId,
  ]);
  await connection.execute('UPDATE cash_transactions SET gl_entry_id = ? WHERE id = ?', [
    entryId,
    transaction.id,
  ]);
  await ensureVoucherLink(
    connection,
    'cash_transaction',
    transaction.id,
    transaction.transaction_number,
    entryId,
    entries[0]?.entry_number || null,
    transaction.created_by || 1
  );
  return { created: true };
}

async function createTaxReturnVoucher(connection, taxReturn, accounts) {
  const amount = Number(taxReturn.tax_payable || 0);
  if (amount <= 0) return null;
  const existing = await activeEntryByDocument(connection, taxReturn.return_period);
  if (existing) {
    await connection.execute('UPDATE tax_returns SET gl_entry_id = ? WHERE id = ?', [
      existing.id,
      taxReturn.id,
    ]);
    await ensureVoucherLink(
      connection,
      'tax_return',
      taxReturn.id,
      taxReturn.return_period,
      existing.id,
      existing.entry_number,
      taxReturn.created_by || 1
    );
    return { linked: true };
  }

  const period = await openPeriodId(connection, taxReturn.declaration_date || taxReturn.created_at);
  const entryId = await financeModel.createEntry(
    {
      entry_date: period.entryDate,
      posting_date: period.entryDate,
      document_type: 'tax_return_accrual',
      document_number: taxReturn.return_period,
      period_id: period.id,
      description: `Tax return accrual ${taxReturn.return_period}`,
      created_by: taxReturn.created_by || 1,
      status: 'posted',
      is_posted: 1,
    },
    [
      {
        account_id: accounts.incomeTaxExpense,
        debit_amount: amount,
        credit_amount: 0,
        description: `Tax expense ${taxReturn.return_period}`,
      },
      {
        account_id: accounts.taxPayable,
        debit_amount: 0,
        credit_amount: amount,
        description: `Tax payable ${taxReturn.return_period}`,
      },
    ],
    connection
  );
  const [entries] = await connection.execute('SELECT entry_number FROM gl_entries WHERE id = ?', [
    entryId,
  ]);
  await connection.execute('UPDATE tax_returns SET gl_entry_id = ? WHERE id = ?', [
    entryId,
    taxReturn.id,
  ]);
  await ensureVoucherLink(
    connection,
    'tax_return',
    taxReturn.id,
    taxReturn.return_period,
    entryId,
    entries[0]?.entry_number || null,
    taxReturn.created_by || 1
  );
  return { created: true };
}

async function repairFinanceEdgeVouchers(connection, accounts) {
  const counters = {
    expensesCreated: 0,
    expensesLinked: 0,
    impairmentsCreated: 0,
    impairmentsLinked: 0,
    cashCreated: 0,
    cashLinked: 0,
    taxReturnsCreated: 0,
    taxReturnsLinked: 0,
  };

  await connection.beginTransaction();
  try {
    const [expenses] = await connection.execute(
      `SELECT e.*
       FROM expenses e
       LEFT JOIN bank_transactions bt ON bt.id = e.payment_transaction_id
       LEFT JOIN gl_entries ge ON ge.id = bt.gl_entry_id AND COALESCE(ge.is_reversed, 0) = 0
       WHERE e.status = 'paid'
         AND e.deleted_at IS NULL
         AND COALESCE(e.amount, 0) > 0
         AND (bt.id IS NULL OR ge.id IS NULL)
       FOR UPDATE`
    );
    for (const expense of expenses) {
      const result = await createExpenseVoucher(connection, expense, accounts);
      if (result?.created) counters.expensesCreated += 1;
      if (result?.linked) counters.expensesLinked += 1;
    }

    const [impairments] = await connection.execute(
      `SELECT ai.*, a.asset_code, a.asset_name
       FROM asset_impairments ai
       LEFT JOIN fixed_assets a ON a.id = ai.asset_id
       LEFT JOIN gl_entries ge ON ge.id = ai.gl_entry_id AND COALESCE(ge.is_reversed, 0) = 0
       WHERE COALESCE(ai.impairment_amount, 0) > 0
         AND ge.id IS NULL
       FOR UPDATE`
    );
    for (const impairment of impairments) {
      const result = await createAssetImpairmentVoucher(connection, impairment, accounts);
      if (result?.created) counters.impairmentsCreated += 1;
      if (result?.linked) counters.impairmentsLinked += 1;
    }

    const [cashTransactions] = await connection.execute(
      `SELECT ct.*
       FROM cash_transactions ct
       LEFT JOIN gl_entries ge ON ge.id = ct.gl_entry_id AND COALESCE(ge.is_reversed, 0) = 0
       WHERE ct.status = 'approved'
         AND COALESCE(ct.amount, 0) > 0
         AND ge.id IS NULL
       FOR UPDATE`
    );
    for (const transaction of cashTransactions) {
      const result = await createCashTransactionVoucher(connection, transaction, accounts);
      if (result?.created) counters.cashCreated += 1;
      if (result?.linked) counters.cashLinked += 1;
    }

    const [taxReturns] = await connection.execute(
      `SELECT tr.*
       FROM tax_returns tr
       LEFT JOIN gl_entries ge ON ge.id = tr.gl_entry_id AND COALESCE(ge.is_reversed, 0) = 0
       WHERE tr.status IN ('已申报', '已缴纳')
         AND COALESCE(tr.tax_payable, 0) > 0
         AND ge.id IS NULL
       FOR UPDATE`
    );
    for (const taxReturn of taxReturns) {
      const result = await createTaxReturnVoucher(connection, taxReturn, accounts);
      if (result?.created) counters.taxReturnsCreated += 1;
      if (result?.linked) counters.taxReturnsLinked += 1;
    }

    await connection.commit();
    return counters;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const connection = await mysql.createConnection(getPoolConfig());
  try {
    await accountingConfig.loadFromDatabase({ pool: { execute: (...args) => connection.execute(...args) } });
    const codes = accountingConfig.getAllAccountCodes();
    const incomeTaxExpenseId = await ensureAccount(connection, {
      account_code: '6801',
      account_name: '所得税费用',
      account_type: '费用',
      type: 'expense',
      is_debit: 1,
      description: 'Auto-created by finance integration repair for income tax accruals',
    });
    const accounts = {
      ar: await accountId(connection, codes.ACCOUNTS_RECEIVABLE),
      ap: await accountId(connection, codes.ACCOUNTS_PAYABLE),
      revenue: await accountId(connection, codes.SALES_REVENUE),
      grIr: await accountId(connection, codes.GR_IR || codes.PURCHASE_COST),
      bank: await accountId(connection, codes.BANK_DEPOSIT),
      cash: await accountId(connection, codes.CASH),
      adminExpense: await accountId(connection, codes.ADMIN_EXPENSE),
      assetImpairmentLoss: await accountId(connection, codes.ASSET_IMPAIRMENT_LOSS),
      fixedAssetImpairmentAllowance: await accountId(
        connection,
        codes.FIXED_ASSET_IMPAIRMENT_ALLOWANCE
      ),
      taxPayable: await accountId(connection, codes.TAX_PAYABLE),
      incomeTaxExpense: incomeTaxExpenseId,
    };

    await connection.beginTransaction();
    const invoiceCounters = await repairInvoiceVouchers(connection, accounts);
    const cashCounters = await repairCashVouchers(connection, accounts);
    const taxLinks = await repairTaxLinks(connection);
    const productionDocTypes = await normalizeProductionDocumentTypes(connection);
    await connection.commit();

    const generatedSalesCost = await generateMissingSalesCostVouchers(connection);
    const generatedInputTax = await generateMissingInputTaxInvoices(connection);
    const edgeCounters = await repairFinanceEdgeVouchers(connection, accounts);

    console.log(JSON.stringify({
      invoiceCounters,
      cashCounters,
      taxLinks,
      productionDocTypes,
      generatedSalesCost,
      generatedInputTax,
      edgeCounters,
    }, null, 2));
    process.exit(0);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Finance integration repair failed:', error.message);
  process.exit(1);
});
