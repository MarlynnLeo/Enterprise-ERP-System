jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

const db = require('../../src/config/db');
const Transfer = require('../../src/models/cash/Transfer');
const cash = require('../../src/models/cash');

test('the public cash API approves a transfer with its internal posting method and commits once', async () => {
  const connection = {
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    execute: jest.fn()
      .mockResolvedValueOnce([[{ id: 17, status: 'pending', created_by: 1, amount: 250 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  const execute = jest.spyOn(Transfer, '_executeTransfer').mockResolvedValue({ from_transaction_id: 31, to_transaction_id: 32, entry_id: 41 });

  await expect(cash.approveTransfer(17, 2)).resolves.toMatchObject({ status: 'approved', entry_id: 41 });
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ id: 17, approved_by: 2 }), connection);
  expect(connection.commit).toHaveBeenCalledTimes(1);
  expect(connection.rollback).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledTimes(1);
});
