#!/usr/bin/env node

const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');
const { accountingConfig } = require('../src/config/accountingConfig');

const BANK_BACKED_METHODS = [
  '银行转账',
  'bank_transfer',
  '电子支付',
  'credit_card',
  '信用卡',
  '支票',
  'check',
  '支付宝',
  'alipay',
  '微信',
  'wechat',
];

async function defaultBankAccountId(connection) {
  const [rows] = await connection.query(`
    SELECT ba.id, COUNT(bt.id) AS tx_count
    FROM bank_accounts ba
    LEFT JOIN bank_transactions bt ON bt.bank_account_id = ba.id
    WHERE ba.is_active = 1
    GROUP BY ba.id
    ORDER BY tx_count DESC, ba.id ASC
    LIMIT 1
  `);
  if (rows.length === 0) {
    throw new Error('No active bank account available for historical receipt repair.');
  }
  return rows[0].id;
}

async function activeAccountId(connection, accountCode, label) {
  const [rows] = await connection.execute(
    'SELECT id FROM gl_accounts WHERE account_code = ? AND (is_active = 1 OR is_active IS NULL) LIMIT 1',
    [accountCode]
  );
  if (rows.length === 0) {
    throw new Error(`${label} account ${accountCode} does not exist or is inactive.`);
  }
  return rows[0].id;
}

async function openPeriodId(connection, date) {
  const [rows] = await connection.execute(
    `SELECT id
     FROM gl_periods
     WHERE start_date <= ?
       AND end_date >= ?
     ORDER BY start_date DESC
     LIMIT 1`,
    [date, date]
  );
  if (rows.length === 0) {
    const [fallback] = await connection.execute(
      `SELECT id
       FROM gl_periods
       WHERE is_closed = 0
       ORDER BY start_date ASC
       LIMIT 1`
    );
    if (fallback.length === 0) {
      throw new Error(`No accounting period available for ${date}.`);
    }
    return fallback[0].id;
  }
  return rows[0].id;
}

async function nextEntryNumber(connection, date, prefix) {
  const compactDate = String(date).replace(/-/g, '');
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM gl_entries
     WHERE entry_number LIKE ?`,
    [`${prefix}${compactDate}%`]
  );
  return `${prefix}${compactDate}${String((rows[0]?.count || 0) + 1).padStart(4, '0')}`;
}

async function nextVoucherNumber(connection, periodId) {
  const [rows] = await connection.execute(
    "SELECT COALESCE(MAX(voucher_number), 0) AS max_no FROM gl_entries WHERE period_id = ? AND voucher_word = '记'",
    [periodId]
  );
  return (rows[0]?.max_no || 0) + 1;
}

async function linkDocument(connection, sourceType, sourceId, sourceCode, targetType, targetId, targetCode, remark) {
  await connection.execute(
    `INSERT IGNORE INTO document_links
      (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'generate', ?, 1)`,
    [sourceType, sourceId, sourceCode, targetType, targetId, targetCode, remark]
  );
}

async function createSettlementEntry(connection, tx, accounts) {
  const isAr = tx.related_invoice_type === 'AR';
  const documentType = isAr ? '收款单' : '付款单';
  const documentNumber = tx.transaction_number;
  const [existing] = await connection.execute(
    `SELECT id, entry_number
     FROM gl_entries
     WHERE document_number = ?
       AND document_type = ?
       AND COALESCE(is_reversed, 0) = 0
     LIMIT 1`,
    [documentNumber, documentType]
  );

  if (existing.length > 0) {
    await connection.execute(
      "UPDATE gl_entries SET status = 'posted', is_posted = 1 WHERE id = ?",
      [existing[0].id]
    );
    return { entryId: existing[0].id, entryNumber: existing[0].entry_number, reused: true };
  }

  const periodId = await openPeriodId(connection, tx.transaction_date);
  const entryNumber = await nextEntryNumber(connection, tx.transaction_date, isAr ? 'ARR' : 'APP');
  const voucherNumber = await nextVoucherNumber(connection, periodId);
  const [entryResult] = await connection.execute(
    `INSERT INTO gl_entries
      (entry_number, entry_date, posting_date, document_type, document_number,
       period_id, voucher_word, voucher_number, description, created_by, status, is_posted)
     VALUES (?, ?, ?, ?, ?, ?, '记', ?, ?, 1, 'posted', 1)`,
    [
      entryNumber,
      tx.transaction_date,
      tx.transaction_date,
      documentType,
      documentNumber,
      periodId,
      voucherNumber,
      isAr ? `Historical AR receipt repair ${documentNumber}` : `Historical AP payment repair ${documentNumber}`,
    ]
  );

  const amount = Number(tx.amount || 0);
  const entryId = entryResult.insertId;
  const lines = isAr
    ? [
        [entryId, 1, accounts.bank, amount, 0, `Bank receipt ${documentNumber}`],
        [entryId, 2, accounts.receivable, 0, amount, `AR receipt ${documentNumber}`],
      ]
    : [
        [entryId, 1, accounts.payable, amount, 0, `AP payment ${documentNumber}`],
        [entryId, 2, accounts.bank, 0, amount, `Bank payment ${documentNumber}`],
      ];

  await connection.query(
    `INSERT INTO gl_entry_items
      (entry_id, line_number, account_id, debit_amount, credit_amount, description)
     VALUES ?`,
    [lines]
  );

  return { entryId, entryNumber };
}

function isBankInflow(type) {
  return ['存款', '转入', '利息', '收入', 'income', 'deposit', 'transfer_in', 'interest'].includes(type);
}

function resolveManualContraAccount(tx, accounts) {
  const text = `${tx.transaction_number || ''} ${tx.description || ''} ${tx.category || ''}`;
  if (text.includes('冲销收款') || text.includes('AR-RC') || tx.transaction_number?.startsWith('RC-')) {
    return accounts.receivable;
  }
  if (text.includes('冲销付款') || text.includes('PAY-')) {
    return accounts.payable;
  }
  if (tx.transaction_type === '费用' || tx.transaction_type === 'fee' || text.includes('手续费')) {
    return accounts.financeExpense;
  }
  if (isBankInflow(tx.transaction_type)) {
    return accounts.otherRevenue;
  }
  return accounts.adminExpense;
}

async function createManualBankEntry(connection, tx, accounts) {
  const isInflow = isBankInflow(tx.transaction_type);
  const documentType = isInflow ? '银行收款单' : '银行付款单';
  const documentNumber = tx.transaction_number;
  const [existing] = await connection.execute(
    `SELECT id, entry_number
     FROM gl_entries
     WHERE document_number = ?
       AND document_type = ?
       AND COALESCE(is_reversed, 0) = 0
     LIMIT 1`,
    [documentNumber, documentType]
  );

  if (existing.length > 0) {
    await connection.execute(
      "UPDATE gl_entries SET status = 'posted', is_posted = 1 WHERE id = ?",
      [existing[0].id]
    );
    return { entryId: existing[0].id, entryNumber: existing[0].entry_number, reused: true };
  }

  const periodId = await openPeriodId(connection, tx.transaction_date);
  const entryNumber = await nextEntryNumber(connection, tx.transaction_date, isInflow ? 'BNR' : 'BNP');
  const voucherNumber = await nextVoucherNumber(connection, periodId);
  const [entryResult] = await connection.execute(
    `INSERT INTO gl_entries
      (entry_number, entry_date, posting_date, document_type, document_number,
       period_id, voucher_word, voucher_number, description, created_by, status, is_posted)
     VALUES (?, ?, ?, ?, ?, ?, '记', ?, ?, 1, 'posted', 1)`,
    [
      entryNumber,
      tx.transaction_date,
      tx.transaction_date,
      documentType,
      documentNumber,
      periodId,
      voucherNumber,
      `Historical bank transaction voucher repair ${documentNumber}`,
    ]
  );

  const amount = Number(tx.amount || 0);
  const entryId = entryResult.insertId;
  const contraAccount = resolveManualContraAccount(tx, accounts);
  const lines = isInflow
    ? [
        [entryId, 1, accounts.bank, amount, 0, `Bank inflow ${documentNumber}`],
        [entryId, 2, contraAccount, 0, amount, `Bank inflow counterpart ${documentNumber}`],
      ]
    : [
        [entryId, 1, contraAccount, amount, 0, `Bank outflow counterpart ${documentNumber}`],
        [entryId, 2, accounts.bank, 0, amount, `Bank outflow ${documentNumber}`],
      ];

  await connection.query(
    `INSERT INTO gl_entry_items
      (entry_id, line_number, account_id, debit_amount, credit_amount, description)
     VALUES ?`,
    [lines]
  );

  return { entryId, entryNumber };
}

async function main() {
  const connection = await mysql.createConnection(getPoolConfig());
  const counters = {
    voidedZeroPayments: 0,
    clearedManualReconciliations: 0,
    repairedReceipts: 0,
    createdBankTransactions: 0,
    createdOrLinkedEntries: 0,
    postedExistingBankEntries: 0,
    createdManualBankEntries: 0,
  };

  try {
    await accountingConfig.loadFromDatabase({ pool: connection });
    const accounts = {
      bank: await activeAccountId(connection, accountingConfig.getAccountCode('BANK_DEPOSIT'), 'BANK_DEPOSIT'),
      receivable: await activeAccountId(
        connection,
        accountingConfig.getAccountCode('ACCOUNTS_RECEIVABLE'),
        'ACCOUNTS_RECEIVABLE'
      ),
      payable: await activeAccountId(
        connection,
        accountingConfig.getAccountCode('ACCOUNTS_PAYABLE'),
        'ACCOUNTS_PAYABLE'
      ),
      adminExpense: await activeAccountId(connection, accountingConfig.getAccountCode('ADMIN_EXPENSE'), 'ADMIN_EXPENSE'),
      financeExpense: await activeAccountId(
        connection,
        accountingConfig.getAccountCode('FINANCE_EXPENSE'),
        'FINANCE_EXPENSE'
      ),
      otherRevenue: await activeAccountId(connection, accountingConfig.getAccountCode('OTHER_REVENUE'), 'OTHER_REVENUE'),
    };

    await connection.beginTransaction();

    const [zeroPayments] = await connection.query(`
      SELECT id, payment_number
      FROM ap_payments
      WHERE COALESCE(status, '') <> 'void'
        AND ROUND(COALESCE(total_amount, 0), 2) <= 0
      FOR UPDATE
    `);
    for (const payment of zeroPayments) {
      await connection.execute(
        `UPDATE ap_payments
         SET status = 'void',
             voided_at = NOW(),
             voided_by = 1,
             void_reason = 'Zero amount historical payment repair'
         WHERE id = ?`,
        [payment.id]
      );
      await connection.execute(
        `UPDATE bank_transactions
         SET status = 'void', is_reconciled = 0, reconciliation_date = NULL
         WHERE transaction_number = ?`,
        [payment.payment_number]
      );
      counters.voidedZeroPayments += 1;
    }

    const [manualReconciled] = await connection.query(`
      SELECT bt.id
      FROM bank_transactions bt
      WHERE bt.status = 'approved'
        AND bt.is_reconciled = 1
        AND NOT EXISTS (
          SELECT 1 FROM bank_reconciliation_matches m WHERE m.bank_transaction_id = bt.id
        )
      FOR UPDATE
    `);
    if (manualReconciled.length > 0) {
      await connection.query(
        `UPDATE bank_transactions
         SET is_reconciled = 0, reconciliation_date = NULL
         WHERE id IN (${manualReconciled.map(() => '?').join(',')})`,
        manualReconciled.map((row) => row.id)
      );
      counters.clearedManualReconciliations = manualReconciled.length;
    }

    const defaultAccountId = await defaultBankAccountId(connection);
    const [receipts] = await connection.query(
      `
      SELECT r.*, c.name AS customer_name
      FROM ar_receipts r
      LEFT JOIN customers c ON c.id = r.customer_id
      WHERE COALESCE(r.status, '') <> 'void'
        AND r.payment_method IN (${BANK_BACKED_METHODS.map(() => '?').join(',')})
        AND NOT EXISTS (
          SELECT 1 FROM bank_transactions bt
          WHERE bt.transaction_number = r.receipt_number
            AND bt.bank_account_id = COALESCE(r.bank_account_id, ?)
            AND bt.status = 'approved'
        )
      FOR UPDATE
    `,
      [...BANK_BACKED_METHODS, defaultAccountId]
    );

    for (const receipt of receipts) {
      const accountId = receipt.bank_account_id || defaultAccountId;
      if (!receipt.bank_account_id) {
        await connection.execute('UPDATE ar_receipts SET bank_account_id = ? WHERE id = ?', [
          accountId,
          receipt.id,
        ]);
        counters.repairedReceipts += 1;
      }

      const [existingTxRows] = await connection.execute(
        'SELECT * FROM bank_transactions WHERE transaction_number = ? FOR UPDATE',
        [receipt.receipt_number]
      );
      let bankTransactionId = null;
      let shouldApplyBalance = false;

      if (existingTxRows.length > 0) {
        const existingTx = existingTxRows[0];
        bankTransactionId = existingTx.id;
        shouldApplyBalance = existingTx.status !== 'approved';
        await connection.execute(
          `UPDATE bank_transactions
           SET bank_account_id = ?,
               transaction_date = ?,
               transaction_type = '转入',
               amount = ?,
               reference_number = ?,
               description = ?,
               is_reconciled = 0,
               reconciliation_date = NULL,
               related_party = ?,
               related_invoice_id = ?,
               related_invoice_type = 'AR',
               status = 'approved'
           WHERE id = ?`,
          [
            accountId,
            receipt.receipt_date,
            receipt.total_amount,
            receipt.reference_number || null,
            `Historical AR receipt bank transaction repair ${receipt.receipt_number}`,
            receipt.customer_name || null,
            receipt.id,
            existingTx.id,
          ]
        );
      } else {
        const [txResult] = await connection.execute(
          `INSERT INTO bank_transactions
            (transaction_number, bank_account_id, transaction_date, transaction_type,
             amount, reference_number, description, is_reconciled, related_party,
             related_invoice_id, related_invoice_type, status)
           VALUES (?, ?, ?, '转入', ?, ?, ?, 0, ?, ?, 'AR', 'approved')`,
          [
            receipt.receipt_number,
            accountId,
            receipt.receipt_date,
            receipt.total_amount,
            receipt.reference_number || null,
            `Historical AR receipt bank transaction repair ${receipt.receipt_number}`,
            receipt.customer_name || null,
            receipt.id,
          ]
        );
        bankTransactionId = txResult.insertId;
        shouldApplyBalance = true;
        counters.createdBankTransactions += 1;
      }

      if (shouldApplyBalance) {
        await connection.execute(
          'UPDATE bank_accounts SET current_balance = current_balance + ?, last_transaction_date = ? WHERE id = ?',
          [receipt.total_amount, receipt.receipt_date, accountId]
        );
      }
      await linkDocument(
        connection,
        'ar_receipt',
        receipt.id,
        receipt.receipt_number,
        'bank_transaction',
        bankTransactionId,
        receipt.receipt_number,
        'Historical AR receipt bank transaction repair'
      );
    }

    const [businessTransactions] = await connection.query(`
      SELECT bt.*
      FROM bank_transactions bt
      WHERE bt.status = 'approved'
        AND bt.related_invoice_type IN ('AR', 'AP')
        AND ROUND(COALESCE(bt.amount, 0), 2) > 0
        AND (
          bt.gl_entry_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM gl_entries ge WHERE ge.id = bt.gl_entry_id)
        )
      FOR UPDATE
    `);

    for (const tx of businessTransactions) {
      const entry = await createSettlementEntry(connection, tx, accounts);
      await connection.execute('UPDATE bank_transactions SET gl_entry_id = ? WHERE id = ?', [
        entry.entryId,
        tx.id,
      ]);

      if (tx.related_invoice_type === 'AR') {
        const [receiptsForTx] = await connection.execute(
          'SELECT id, receipt_number FROM ar_receipts WHERE receipt_number = ? LIMIT 1',
          [tx.transaction_number]
        );
        if (receiptsForTx.length > 0) {
          await linkDocument(
            connection,
            'ar_receipt',
            receiptsForTx[0].id,
            receiptsForTx[0].receipt_number,
            'finance_voucher',
            entry.entryId,
            entry.entryNumber,
            'Historical AR receipt voucher repair'
          );
        }
      } else {
        const [paymentsForTx] = await connection.execute(
          'SELECT id, payment_number FROM ap_payments WHERE payment_number = ? LIMIT 1',
          [tx.transaction_number]
        );
        if (paymentsForTx.length > 0) {
          await linkDocument(
            connection,
            'ap_payment',
            paymentsForTx[0].id,
            paymentsForTx[0].payment_number,
            'finance_voucher',
            entry.entryId,
            entry.entryNumber,
            'Historical AP payment voucher repair'
          );
        }
      }

      await linkDocument(
        connection,
        'bank_transaction',
        tx.id,
        tx.transaction_number,
        'finance_voucher',
        entry.entryId,
        entry.entryNumber,
        'Historical bank transaction voucher repair'
      );
      counters.createdOrLinkedEntries += 1;
    }

    const [unpostedLinkedEntries] = await connection.query(`
      SELECT bt.id AS bank_transaction_id, bt.transaction_number, ge.id AS entry_id, ge.entry_number
      FROM bank_transactions bt
      JOIN gl_entries ge ON ge.id = bt.gl_entry_id
      WHERE bt.status = 'approved'
        AND COALESCE(ge.is_reversed, 0) = 0
        AND (COALESCE(ge.is_posted, 0) = 0 OR COALESCE(ge.status, '') <> 'posted')
      FOR UPDATE
    `);
    for (const row of unpostedLinkedEntries) {
      await connection.execute(
        "UPDATE gl_entries SET status = 'posted', is_posted = 1 WHERE id = ?",
        [row.entry_id]
      );
      await linkDocument(
        connection,
        'bank_transaction',
        row.bank_transaction_id,
        row.transaction_number,
        'finance_voucher',
        row.entry_id,
        row.entry_number,
        'Historical bank transaction posted voucher repair'
      );
      counters.postedExistingBankEntries += 1;
    }

    const [manualBankTransactions] = await connection.query(`
      SELECT bt.*
      FROM bank_transactions bt
      LEFT JOIN gl_entries ge ON ge.id = bt.gl_entry_id
      WHERE bt.status = 'approved'
        AND ROUND(COALESCE(bt.amount, 0), 2) > 0
        AND (
          bt.gl_entry_id IS NULL
          OR ge.id IS NULL
          OR COALESCE(ge.is_reversed, 0) = 1
        )
      FOR UPDATE
    `);

    for (const tx of manualBankTransactions) {
      const entry = await createManualBankEntry(connection, tx, accounts);
      await connection.execute('UPDATE bank_transactions SET gl_entry_id = ? WHERE id = ?', [
        entry.entryId,
        tx.id,
      ]);
      await linkDocument(
        connection,
        'bank_transaction',
        tx.id,
        tx.transaction_number,
        'finance_voucher',
        entry.entryId,
        entry.entryNumber,
        'Historical manual bank transaction voucher repair'
      );
      counters.createdManualBankEntries += 1;
    }

    await connection.commit();
    console.log(JSON.stringify(counters, null, 2));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
