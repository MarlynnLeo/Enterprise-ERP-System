/* global beforeEach, describe, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/models/finance', () => ({ createEntry: jest.fn() }));
jest.mock('../../src/services/InventoryPostingService', () => ({
  requireApprovedForTransaction: jest.fn(async () => ({ finance_approved_by: 60 })),
}));
jest.mock('../../src/config/accountingConfig', () => ({
  accountingConfig: {
    loadFromDatabase: jest.fn(),
    getAccountCode: jest.fn(
      (key) =>
        ({
          RAW_MATERIALS: '1403',
          INVENTORY_GOODS: '1405',
          GR_IR: '220201',
          ACCOUNTS_PAYABLE: '2202',
          SALES_COST: '5401',
        })[key]
    ),
  },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const db = require('../../src/config/db');
const finance = require('../../src/models/finance');
const Cost = require('../../src/services/business/InventoryCostService');

describe('inventory cost accounting routes', () => {
  let connection;
  const transaction = {
    posting_document_id: 1,
    posting_line_id: 11,
    material_id: 7,
    quantity: 10,
    unit_cost: 10,
    total_value: 100,
    reference_no: 'RECEIPT-1',
    transaction_date: '2026-10-13',
  };

  beforeEach(() => {
    connection = {
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      execute: jest.fn(async (sql, params) => {
        if (sql.includes('FROM materials'))
          return [[{ id: 7, code: 'M7', name: '原料', cost_price: 10 }]];
        if (sql.includes('FROM inventory_stock_balances'))
          return [[{ quantity: 10, total_value: 100 }]];
        if (sql.includes('UPDATE materials')) return [{ affectedRows: 1 }];
        if (sql.includes('MAX(CAST')) return [[{ max_seq: 0 }]];
        if (sql.includes('FROM gl_entries')) return [[]];
        if (sql.includes('FROM gl_accounts')) return [[{ id: params[0] }]];
        throw new Error(`Unexpected query: ${sql}`);
      }),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    finance.createEntry.mockResolvedValue(1);
  });

  function movements() {
    return finance.createEntry.mock.calls
      .flatMap(([, items]) => items)
      .reduce((balances, item) => {
        balances[item.account_id] =
          (balances[item.account_id] || 0) + item.debit_amount - item.credit_amount;
        return balances;
      }, {});
  }

  test.each(['inbound', 'batch_create', 'purchase_receipt'])(
    'a purchase receipt owned by %s credits GR/IR and never creates a second payable',
    async (referenceType) => {
      await Cost.generateInboundCostEntry(
        {
          ...transaction,
          transaction_type: 'purchase_inbound',
          reference_type: referenceType,
        },
        { periodId: 1 }
      );
      expect(movements()).toEqual({ 1403: 100, 220201: -100 });
      expect(connection.commit).toHaveBeenCalled();
      expect(finance.createEntry.mock.calls[0][0].created_by).toBe(60);
    }
  );

  test('a full purchase return clears the same inventory and GR/IR accounts as receipt', async () => {
    await Cost.generateInboundCostEntry(
      {
        ...transaction,
        transaction_type: 'purchase_inbound',
        reference_type: 'inbound',
      },
      { periodId: 1 }
    );
    await Cost.generateOutboundCostEntry(
      {
        ...transaction,
        quantity: -10,
        total_value: -100,
        reference_no: 'RETURN-1',
        transaction_type: 'purchase_return',
        reference_type: 'purchase_return',
      },
      { periodId: 1 }
    );
    expect(movements()).toEqual({ 1403: 0, 220201: 0 });
  });

  test.each([
    [100, 0],
    [125, 25],
  ])(
    'exchange return at original cost and outgoing cost %s recognizes only the cost difference',
    async (outgoingCost, expectedCost) => {
      await Cost.generateInboundCostEntry(
        {
          ...transaction,
          transaction_type: 'sales_exchange_return',
          reference_type: 'sales_exchange',
        },
        { periodId: 1 }
      );
      await Cost.generateOutboundCostEntry(
        {
          ...transaction,
          posting_line_id: 12,
          quantity: -10,
          total_value: -outgoingCost,
          transaction_type: 'sales_exchange_out',
          reference_type: 'sales_exchange',
        },
        { periodId: 1 }
      );
      expect(movements()).toEqual({ 1405: 0 - expectedCost, 5401: expectedCost });
    }
  );

  test('legacy generic movements retain their specific purchase document classification', () => {
    expect(
      Cost.resolveAccountingType({
        transaction_type: 'inbound',
        reference_type: 'purchase_receipt',
      })
    ).toBe('purchase_receipt');
  });
});
