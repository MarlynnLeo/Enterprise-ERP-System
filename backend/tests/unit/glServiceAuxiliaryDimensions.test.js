jest.mock('../../src/utils/userUtils', () => ({
  getUserIdByIdentifier: jest.fn().mockResolvedValue(99),
  resolveActorUserId: jest.fn().mockResolvedValue(99),
  resolveActorLabel: jest.fn().mockResolvedValue('tester'),
  getRequestActorLabel: jest.fn().mockReturnValue('tester'),
}));

const GLService = require('../../src/services/finance/GLService');

describe('GLService auxiliary dimensions', () => {
  test('persists all auxiliary accounting dimensions on entry items', async () => {
    let insertedItemSql = '';
    let insertedItemValues = null;

    const connection = {
      execute: jest.fn(async (sql) => {
        if (sql.includes('FROM gl_periods')) {
          return [[{
            id: 3,
            is_closed: 0,
            period_name: '2026-07',
            start_date: '2026-07-01',
            end_date: '2026-07-31',
          }]];
        }
        if (sql.includes('MAX(voucher_number)')) {
          return [[{ max_num: 12 }]];
        }
        if (sql.includes('INSERT INTO gl_entries')) {
          return [{ insertId: 42 }];
        }
        return [[]];
      }),
      query: jest.fn(async (sql, params) => {
        if (sql.includes('FROM gl_accounts')) {
          return [[{ id: 1001 }, { id: 6001 }]];
        }
        if (sql.includes('INSERT INTO gl_entry_items')) {
          insertedItemSql = sql;
          insertedItemValues = params[0];
          return [{ affectedRows: 2 }];
        }
        return [[]];
      }),
    };

    const entryId = await GLService.createEntry(
      {
        entry_date: '2026-07-04',
        posting_date: '2026-07-04',
        period_id: 3,
        document_type: 'manual',
        document_number: 'JV-AUX-001',
        created_by: 99,
      },
      [
        {
          account_id: 6001,
          debit_amount: 88.66,
          credit_amount: 0,
          cost_center_id: 11,
          project_id: 22,
          customer_id: 33,
          supplier_id: 44,
          employee_id: 55,
          description: 'dimension debit',
        },
        {
          account_id: 1001,
          debit_amount: 0,
          credit_amount: 88.66,
          description: 'dimension credit',
        },
      ],
      connection
    );

    expect(entryId).toBe(42);
    expect(insertedItemSql).toContain(
      'cost_center_id, project_id, customer_id, supplier_id, employee_id, description'
    );
    expect(insertedItemValues[0]).toEqual([
      42,
      1,
      6001,
      88.66,
      0,
      'CNY',
      1,
      11,
      22,
      33,
      44,
      55,
      'dimension debit',
    ]);
  });
});
