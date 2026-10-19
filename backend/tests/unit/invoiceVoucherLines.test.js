/* global describe, test, expect, jest */
const {
  convertInvoiceCurrencyLines, prepareInvoiceVoucherLines, loadInvoiceLineMetadata,
  resolveVoucherCurrency, resolveSameVoucherCurrency,
} = require('../../src/services/finance/invoiceVoucherLines');
const { singleMaterialMetadata } = require('../../src/services/finance/voucherLineMetadata');
const { mergeDraftsIntoVoucher, canonicalizeGenerateOverrides } = require('../../src/services/finance/manualVoucherHelpers');

const lines = [
  { account_id: 1, debit_amount: 0.02, credit_amount: 0, customer_id: 12 },
  { account_id: 2, debit_amount: 0, credit_amount: 0.01 },
  { account_id: 3, debit_amount: 0, credit_amount: 0.01 },
];

describe('invoice original-currency to base-currency contract', () => {
  test('USD uses actual rate and records only the explicit cent needed to balance net and tax', () => {
    const result = convertInvoiceCurrencyLines(lines, { currency_code: 'USD', exchange_rate: 7.5 });
    expect(result.map(row => row.foreign_amount)).toEqual([0.02, 0.01, 0.01]);
    expect(result.map(row => row.debit_amount)).toEqual([0.15, 0, 0]);
    expect(result.map(row => row.credit_amount)).toEqual([0, 0.08, 0.07]);
    expect(result.map(row => row.base_rounding_adjustment)).toEqual([0, 0, -0.01]);
    expect(lines[2].credit_amount).toBe(0.01);
  });

  test('credit-note direction is preserved while the foreign amount stays positive', () => {
    const reversed = lines.map(row => ({ ...row, debit_amount: row.credit_amount, credit_amount: row.debit_amount }));
    const result = convertInvoiceCurrencyLines(reversed, { currencyCode: 'USD', exchangeRate: 7.5 });
    expect(result[0]).toMatchObject({ debit_amount: 0, credit_amount: 0.15, foreign_amount: 0.02 });
    expect(result[2]).toMatchObject({ debit_amount: 0.07, credit_amount: 0, base_rounding_adjustment: -0.01 });
  });

  test('CNY keeps base amounts and never invents an original foreign amount', () => {
    const result = convertInvoiceCurrencyLines(lines);
    expect(result[0]).toMatchObject({ debit_amount: 0.02, currency_code: 'CNY', exchange_rate: 1, foreign_amount: null });
  });

  test('missing USD rate, mixed rates/currencies, and unbalanced original lines fail before posting', () => {
    expect(() => resolveVoucherCurrency({ currency: 'USD' })).toThrow('美元必须填写实际汇率');
    expect(() => resolveVoucherCurrency({ currency: 'CNY', exchange_rate: 7.1 })).toThrow('人民币汇率必须为1');
    expect(() => resolveSameVoucherCurrency([{ currency: 'CNY' }, { currency: 'USD', exchange_rate: 7 }])).toThrow('不同币种或汇率');
    expect(() => resolveSameVoucherCurrency([{ currency: 'USD', exchange_rate: 7 }, { currency: 'USD', exchange_rate: 7.1 }])).toThrow('不同币种或汇率');
    expect(() => convertInvoiceCurrencyLines(lines.slice(0, 2))).toThrow('原币分录借贷不平');
  });
});

describe('source-backed voucher metadata', () => {
  test('only homogeneous materials, prices and units yield quantity metadata', () => {
    const item = { material_id: 4, quantity: 0.1, unit_price: 12.3456, unit_name: '个' };
    expect(singleMaterialMetadata([item, { ...item, material_id: '4', quantity: 0.2 }])).toEqual({ quantity: 0.3, unit_price: 12.3456, unit_name: '个' });
    for (const different of [{ material_id: 5 }, { unit_price: 2 }, { unit_name: '箱' }]) {
      expect(singleMaterialMetadata([item, { ...item, ...different }])).toEqual({});
    }
    expect(singleMaterialMetadata([{ ...item, quantity: -2 }])).toMatchObject({ quantity: 2 });
  });

  test('final invoice items and party override stale preview quantity and identity', () => {
    const result = prepareInvoiceVoucherLines(lines, {
      invoice_number: 'AR-20261017-1', customer_id: 12,
      items: [{ product_id: 4, quantity: 2, unit_price: 0.005, unit_name: '个' }],
      gl_entry: {
        department_id: 8, customer_id: 90,
        entry_lines: [
          { role: 'receivable', customer_id: 99, invoice_number: 'old' },
          { role: 'income', quantity: 9, unit_price: 99, cost_center_id: 3, employee_id: 7, employee_source: 'hr', project_name: '项目甲', settlement_method: '电汇' },
        ],
      },
    }, { quantityAccountId: 2, roleByAccount: { 1: 'receivable', 2: 'income' } });
    expect(result[0]).toMatchObject({ customer_id: 12, department_id: 8, invoice_number: 'AR-20261017-1' });
    expect(result[1]).toMatchObject({ quantity: 2, unit_price: 0.005, unit_name: '个', cost_center_id: 3, employee_id: 7, employee_source: 'hr', project_name: '项目甲', settlement_method: '电汇' });
    expect(result[2].customer_id).toBeUndefined();
  });

  test('confirmation reload uses exact source quantity, price and saved unit rather than current material defaults', async () => {
    const invoice = { id: 6, supplier_id: 9, source_type: 'purchase_receipt', source_id: 4 };
    const connection = { execute: jest.fn()
      .mockResolvedValueOnce([[{ material_id: 3, quantity: 2, unit_price: 5 }]])
      .mockResolvedValueOnce([[{ material_id: 3, qualified_quantity: 2, price: 5, source_party_id: 9, unit_name: '箱' }]]) };
    const result = await loadInvoiceLineMetadata(connection, invoice, 'ap');
    expect(result.items[0].unit_name).toBe('箱');
    expect(connection.execute.mock.calls.map(call => call[0]).join(' ')).not.toContain('materials');
  });

  test('ambiguous historical source unit remains blank', async () => {
    const source = { product_id: 3, quantity: 2, price: 5, source_party_id: 9, unit_name: '箱' };
    const connection = { execute: jest.fn().mockResolvedValueOnce([[{ product_id: 3, quantity: 2, unit_price: 5 }]]).mockResolvedValueOnce([[source, source]]) };
    const result = await loadInvoiceLineMetadata(connection, { id: 6, customer_id: 9, source_type: 'sales_outbound', source_id: 4 }, 'ar');
    expect(result.items[0].unit_name).toBeUndefined();
  });

  test('manual business overrides retain explicit independent dimensions and units', () => {
    const result = canonicalizeGenerateOverrides({ id: 1, items: [{ quantity: 2, unit_price: 5, unit_name: '米' }], entryLines: [{ role: 'income', account_id: 3, department_id: 4, cost_center_id: 8, quantity: 2, unit_name: '米', unit_price: 5, employee_source: 'user' }] });
    expect(result.items[0].unit_name).toBe('米');
    expect(result.entryLines[0]).toMatchObject({ department_id: 4, cost_center_id: 8, employee_source: 'user' });
  });

  test('merged vouchers reject mixed party and currency instead of dropping subsidiary identities', () => {
    const first = { id: 1, partyId: 3, currencyCode: 'CNY', entryLines: [], items: [] };
    expect(() => mergeDraftsIntoVoucher('sales_outbound', [first, { ...first, id: 2, partyId: 4 }], false)).toThrow('不同往来单位');
    expect(() => mergeDraftsIntoVoucher('sales_outbound', [first, { ...first, id: 2, currencyCode: 'USD', exchangeRate: 7 }], false)).toThrow('不同币种或汇率');
  });

  test('USD multiple-source merge is rejected while one-source preview stays available', () => {
    const draft = { id: 1, docNo: 'OUT-1', partyId: 3, currencyCode: 'USD', exchangeRate: 7.2, entryLines: [], items: [] };
    expect(() => mergeDraftsIntoVoucher('sales_outbound', [draft, { ...draft, id: 2 }], false)).toThrow('美元来源请逐单生成凭证，以保留原单核销金额');
    expect(mergeDraftsIntoVoucher('sales_outbound', [draft], false)).toMatchObject({ currencyCode: 'USD', exchangeRate: 7.2 });
  });
});
