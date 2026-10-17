/* global afterEach, beforeEach, describe, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/models/finance', () => ({ createEntry: jest.fn() }));
jest.mock('../../src/services/InventoryPostingService', () => ({ requireApprovedForTransaction: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { pool } = require('../../src/config/db');
const finance = require('../../src/models/finance');
const posting = require('../../src/services/InventoryPostingService');
const Cost = require('../../src/services/business/InventoryCostService');

describe('inventory cost transaction failure', () => {
  let connection;
  const transaction = {
    material_id: 7, quantity: 2, unit_cost: 10, total_value: 20,
    transaction_date: '2026-07-12', transaction_type: 'purchase_inbound',
    reference_no: 'IN-7', posting_line_id: 71, posting_document_id: 70,
  };

  beforeEach(() => {
    connection = {
      beginTransaction: jest.fn(async () => {}),
      execute: jest.fn(async () => [[{ quantity: 2, total_value: 20 }]]),
      commit: jest.fn(async () => {}),
      rollback: jest.fn(async () => {}),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(connection);
    posting.requireApprovedForTransaction.mockReset().mockResolvedValue({ id: 70, finance_approved_by: 60 });
    finance.createEntry.mockReset().mockResolvedValue(77);
    jest.spyOn(Cost, 'getMaterialInfo').mockResolvedValue({ code: 'M7', name: 'Material', cost_price: 10 });
    jest.spyOn(Cost, 'findExistingActiveGlEntry').mockResolvedValue(null);
    jest.spyOn(Cost, 'getCurrentPeriodId').mockResolvedValue(1);
    jest.spyOn(Cost, 'generateEntryNumber').mockResolvedValue('INV-77');
    jest.spyOn(Cost, 'getInventoryAccountId').mockResolvedValue(11);
    jest.spyOn(Cost, 'getSourceAccountId').mockResolvedValue(12);
    jest.spyOn(Cost, 'getCostAccountId').mockResolvedValue(13);
  });

  afterEach(() => jest.restoreAllMocks());

  test.each([
    ['balance read', 'ER_LOCK_DEADLOCK'],
    ['material update', 'ER_LOCK_DEADLOCK'],
    ['balance read', 'PROTOCOL_CONNECTION_LOST'],
    ['material update', 'ER_LOCK_WAIT_TIMEOUT'],
    ['material update', 'ER_UNKNOWN_ERROR'],
  ])('%s %s aborts before any voucher is created', async (step, code) => {
    const error = Object.assign(new Error(code), { code });
    connection.execute.mockImplementation(async (sql) => {
      if (step === 'balance read' || sql.startsWith('UPDATE materials')) throw error;
      return [[{ quantity: 2, total_value: 20 }]];
    });

    await expect(Cost.generateInboundCostEntry(transaction)).rejects.toBe(error);

    expect(posting.requireApprovedForTransaction).toHaveBeenCalledWith(connection, transaction);
    expect(finance.createEntry).not.toHaveBeenCalled();
    expect(Cost.getCurrentPeriodId).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test.each(['generateInboundCostEntry', 'generateOutboundCostEntry'])(
    '%s preserves the original failure when the lost connection also rejects rollback', async (method) => {
      const error = Object.assign(new Error('approval connection lost'), { code: 'PROTOCOL_CONNECTION_LOST' });
      posting.requireApprovedForTransaction.mockRejectedValue(error);
      connection.rollback.mockRejectedValue(new Error('cannot rollback closed connection'));

      await expect(Cost[method](transaction)).rejects.toBe(error);

      expect(finance.createEntry).not.toHaveBeenCalled();
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.release).toHaveBeenCalledTimes(1);
    }
  );

  test('a retry rechecks approval and refuses to create GL after a intervening reversal', async () => {
    connection.execute.mockRejectedValueOnce(Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' }));
    await expect(Cost.generateInboundCostEntry(transaction)).rejects.toThrow('deadlock');
    posting.requireApprovedForTransaction.mockRejectedValueOnce(new Error('posting is reversed'));

    await expect(Cost.generateInboundCostEntry(transaction)).rejects.toThrow('posting is reversed');

    expect(posting.requireApprovedForTransaction).toHaveBeenCalledTimes(2);
    expect(finance.createEntry).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(2);
    expect(connection.release).toHaveBeenCalledTimes(2);
  });

  test('a healthy retry completes MAC and GL within a newly approved transaction', async () => {
    connection.execute.mockRejectedValueOnce(Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' }));
    await expect(Cost.generateInboundCostEntry(transaction)).rejects.toThrow('deadlock');

    await expect(Cost.generateInboundCostEntry(transaction)).resolves.toMatchObject({ entryId: 77, totalCost: 20 });

    expect(posting.requireApprovedForTransaction).toHaveBeenCalledTimes(2);
    expect(connection.execute).toHaveBeenLastCalledWith(expect.stringContaining('UPDATE materials'), ['10.0000', 7]);
    expect(finance.createEntry).toHaveBeenCalledTimes(1);
    expect(finance.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: 60 }),
      [expect.objectContaining({ debit_amount: 20 }), expect.objectContaining({ credit_amount: 20 })],
      connection
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });
});
