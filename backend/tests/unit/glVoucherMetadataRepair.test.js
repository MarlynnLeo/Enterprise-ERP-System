const {
  REPAIR_FIELDS, planVoucherMetadataRepair, runVoucherMetadataRepair,
} = require('../../src/services/finance/glVoucherMetadataRepair');

function fixture() {
  return {
    entries: [{ id: 9, entry_date: '2026-10-17', document_type: 'invoice', document_number: 'AP-1' }],
    items: [
      { id: 90, entry_id: 9, debit_amount: '100', credit_amount: 0, currency_code: 'CNY', exchange_rate: 1, cost_center_id: 8 },
      { id: 91, entry_id: 9, debit_amount: 0, credit_amount: '113', currency_code: 'CNY', exchange_rate: 1 },
      { id: 92, entry_id: 9, debit_amount: '13', credit_amount: 0, currency_code: 'CNY', exchange_rate: 1 },
    ],
    links: [{ source_type: 'ap_invoice', source_id: 1, target_type: 'finance_voucher', target_id: 9 }],
    sources: { ap_invoice: [{ id: 1, invoice_number: 'AP-1', invoice_date: '2026-10-17', amount_excluding_tax: '100', total_amount: '113', tax_amount: '13', currency_code: 'CNY', exchange_rate: 1, supplier_id: 5 }] },
    invoiceItems: { ap_invoice: [{ id: 1, invoice_id: 1, material_id: 2, quantity: '4', unit_price: '25', amount: '100', unit_id: 2 }] },
    costCenters: [{ id: 8, department_id: 7 }], departments: [{ id: 7 }],
    suppliers: [{ id: 5 }], units: [{ id: 2, name: '箱' }],
  };
}

test('plans only source-backed blank metadata and preserves ledger evidence', () => {
  const data = fixture();
  const original = JSON.stringify(data);
  const plan = planVoucherMetadataRepair(data);
  expect(plan.repairableLines).toBe(3);
  expect(plan.changes[0].patch).toEqual({ department_id: 7, invoice_number: 'AP-1', supplier_id: 5, quantity: '4.000000', unit_name: '箱', unit_price: '25.000000' });
  expect(plan.changes.every((change) => Object.keys(change.patch).every((field) => REPAIR_FIELDS.includes(field)))).toBe(true);
  expect(JSON.stringify(data)).toBe(original);
  for (const field of ['debit_amount', 'credit_amount', 'exchange_rate', 'foreign_amount', 'account_id', 'status']) {
    expect(REPAIR_FIELDS).not.toContain(field);
  }
});

test('repeated repair is idempotent and explicit zero/existing data remain unchanged', () => {
  const data = fixture();
  Object.assign(data.items[0], { quantity: 0, unit_price: 0, unit_name: '原始单位', department_id: 3 });
  const plan = planVoucherMetadataRepair(data);
  expect(plan.changes[0].patch).toEqual({ invoice_number: 'AP-1', supplier_id: 5 });
  for (const change of plan.changes) Object.assign(data.items.find((line) => line.id === change.lineId), change.patch);
  expect(planVoucherMetadataRepair(data).changes).toEqual([]);
});

test('never borrows a current material unit when the original invoice has no unit snapshot', () => {
  const data = fixture();
  delete data.invoiceItems.ap_invoice[0].unit_id;
  const plan = planVoucherMetadataRepair(data);
  expect(plan.changes[0].patch).not.toHaveProperty('unit_name');
  expect(plan.changes[0].patch.quantity).toBe('4.000000');
  expect(plan.unresolvedReasons.missing_historical_unit_snapshot).toBe(1);
});

test('a uniquely matching physical receipt provides its saved unit, but conflicting source rows do not', () => {
  const data = fixture();
  delete data.invoiceItems.ap_invoice[0].unit_id;
  Object.assign(data.sources.ap_invoice[0], { source_type: 'purchase_receipt', source_id: 20 });
  data.purchaseReceipts = [{ id: 20, supplier_id: 5 }];
  data.purchaseReceiptItems = [{ id: 21, receipt_id: 20, material_id: 2, qualified_quantity: 4, price: 25, unit_id: 2 }];
  let plan = planVoucherMetadataRepair(data);
  expect(plan.changes[0].patch.unit_name).toBe('箱');
  expect(plan.changes[0].provenance.unit_name).toContain('purchase_receipt:20');
  data.purchaseReceiptItems.push({ ...data.purchaseReceiptItems[0], id: 22, unit_id: 3 });
  plan = planVoucherMetadataRepair(data);
  expect(plan.changes[0].patch).not.toHaveProperty('unit_name');
  expect(plan.unresolvedReasons.missing_historical_unit_snapshot).toBe(1);
});

test.each(['material', 'price'])('mixed %s invoice data are not aggregated into misleading quantities', (field) => {
  const data = fixture();
  data.invoiceItems.ap_invoice.push({ ...data.invoiceItems.ap_invoice[0], id: 2, ...(field === 'material' ? { material_id: 3 } : { unit_price: 30 }) });
  const plan = planVoucherMetadataRepair(data);
  expect(plan.changes[0].patch).not.toHaveProperty('quantity');
  expect(plan.unresolvedReasons.mixed_invoice_items).toBe(1);
});

test('multiple invoices and conflicting source IDs are explicitly unresolved', () => {
  const data = fixture();
  data.sources.ap_invoice.push({ ...data.sources.ap_invoice[0], id: 2, invoice_number: 'AP-2' });
  data.links.push({ source_type: 'ap_invoice', source_id: 2, target_type: 'finance_voucher', target_id: 9 });
  let plan = planVoucherMetadataRepair(data);
  expect(plan.unresolvedReasons.multiple_source_documents).toBe(3);
  expect(plan.changes[0].patch).toEqual({ department_id: 7 });
  data.entries[0].document_number = 'AP-3';
  data.sources.ap_invoice.push({ ...data.sources.ap_invoice[0], id: 3, invoice_number: 'AP-3' });
  plan = planVoucherMetadataRepair(data);
  expect(plan.unresolvedReasons.conflicting_source_identity).toBe(1);
  expect(plan.changes[0].patch).toEqual({ department_id: 7 });
});

test('does not attach fields from an invoice with a conflicting existing party', () => {
  const data = fixture();
  data.items[0].supplier_id = 6;
  const plan = planVoucherMetadataRepair(data);
  expect(plan.changes[0].patch).toEqual({ department_id: 7 });
  expect(plan.unresolvedReasons.existing_source_metadata_conflict).toBe(1);
});

test('payment metadata follows a unique settlement invoice and never copies invoice quantities', () => {
  const data = fixture();
  data.entries[0].document_type = 'payment';
  data.entries[0].document_number = 'PAY-1';
  data.links[0].source_type = 'ap_payment';
  data.sources.ap_payment = [{ id: 1, payment_number: 'PAY-1', supplier_id: 5, payment_method: '银行转账' }];
  data.settlementItems = { ap_payment: [{ id: 1, payment_id: 1, invoice_id: 1 }] };
  const plan = planVoucherMetadataRepair(data);
  expect(plan.changes[0].patch).toEqual({ department_id: 7, supplier_id: 5, settlement_method: '银行转账', invoice_number: 'AP-1' });
});

test('salary employee source requires both the exact salary transaction and matching HR identity', () => {
  const data = fixture();
  data.entries[0] = { id: 9, transaction_type: 'salary', transaction_id: 1 };
  data.links = [];
  data.sources = { salary: [{ id: 1, employee_id: 3, gl_entry_id: 9 }] };
  data.hrEmployees = [{ id: 3 }];
  data.items[0].employee_id = 3;
  data.items[1].employee_id = 4;
  const plan = planVoucherMetadataRepair(data);
  expect(plan.changes[0].patch).toEqual({ department_id: 7, employee_source: 'hr' });
  expect(plan.unresolvedReasons.salary_employee_identity_not_verified).toBe(2);
});

function connectionFixture({ failUpdate = false } = {}) {
  const data = fixture();
  const tables = {
    gl_entries: data.entries, gl_entry_items: data.items, document_links: data.links,
    ap_invoices: data.sources.ap_invoice, ap_invoice_items: data.invoiceItems.ap_invoice,
    ar_invoices: [], ar_invoice_items: [], ap_payments: [], ap_payment_items: [], ar_receipts: [], ar_receipt_items: [],
    cost_centers: data.costCenters, departments: data.departments, hr_salary_records: [], hr_employees: [], units: data.units,
    suppliers: data.suppliers, customers: [],
  };
  const connection = {
    query: jest.fn(async (sql) => {
      if (sql === 'SELECT DATABASE() AS name') return [[{ name: 'repair_test' }]];
      if (sql.includes('information_schema.columns')) return [Object.keys(tables).flatMap((table) => (table === 'gl_entry_items' ? ['id', ...REPAIR_FIELDS] : ['id']).map((column) => ({ table_name: table, column_name: column })))];
      if (sql.startsWith('START TRANSACTION')) return [{}];
      if (sql.startsWith('UPDATE')) {
        if (failUpdate) throw new Error('simulated write conflict');
        return [{ affectedRows: 1 }];
      }
      const table = sql.match(/FROM (\w+)/)?.[1];
      if (!tables[table]) throw new Error(`Unexpected SQL: ${sql}`);
      return [tables[table]];
    }), commit: jest.fn(), rollback: jest.fn(),
  };
  return connection;
}

test('default dry run uses a read-only transaction and issues no updates', async () => {
  const connection = connectionFixture();
  const result = await runVoucherMetadataRepair(connection);
  expect(result).toMatchObject({ mode: 'dry-run', updatedLines: 0, repairableLines: 3 });
  expect(connection.query.mock.calls.some(([sql]) => sql === 'START TRANSACTION READ ONLY')).toBe(true);
  expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
});

test('explicit apply locks sources and fills blanks atomically; any write failure rolls back', async () => {
  const connection = connectionFixture();
  const result = await runVoucherMetadataRepair(connection, { apply: true, expectedDatabase: 'repair_test' });
  expect(result.updatedLines).toBe(3);
  const updates = connection.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE'));
  expect(updates).toHaveLength(3);
  expect(updates.every(([sql]) => sql.includes('updated_at = updated_at') && sql.includes('IS NULL'))).toBe(true);
  expect(connection.commit).toHaveBeenCalled();
  const failing = connectionFixture({ failUpdate: true });
  await expect(runVoucherMetadataRepair(failing, { apply: true })).rejects.toThrow('simulated write conflict');
  expect(failing.rollback).toHaveBeenCalled();
  expect(failing.commit).not.toHaveBeenCalled();
});

test('database mismatch aborts before beginning a write transaction', async () => {
  const connection = connectionFixture();
  await expect(runVoucherMetadataRepair(connection, { apply: true, expectedDatabase: 'another_database' })).rejects.toThrow('differs');
  expect(connection.query).toHaveBeenCalledTimes(1);
  expect(connection.commit).not.toHaveBeenCalled();
});
