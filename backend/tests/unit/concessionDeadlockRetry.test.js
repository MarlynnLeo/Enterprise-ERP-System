jest.mock('../../src/services/business/nonconformingProduct/runtime', () => ({ logger: { info: jest.fn(), error: jest.fn() }, STATUS: { NCP: { COMPLETED: 'completed', CLOSED: 'closed' } } }));
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/services/business/PurchaseReceiptReleaseService', () => ({ lockConcessionOrder: jest.fn() }));
const methods = require('../../src/services/business/nonconformingProduct/concessionMethods');
const deadlock = () => Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' });
test('concession retries the complete owning transaction, not a failed statement', async () => {
  const service = { ...methods, _approveConcessionTransaction: jest.fn().mockRejectedValueOnce(deadlock()).mockResolvedValue(true) };
  await expect(service.approveConcession(12, { status: 'approved' })).resolves.toBe(true);
  expect(service._approveConcessionTransaction).toHaveBeenCalledTimes(2);
  expect(service._approveConcessionTransaction).toHaveBeenNthCalledWith(2, 12, { status: 'approved' });
});
test('deadlock retries are bounded to three attempts', async () => {
  const service = { ...methods, _approveConcessionTransaction: jest.fn().mockRejectedValue(deadlock()) };
  await expect(service.approveConcession(12, {})).rejects.toThrow('deadlock');
  expect(service._approveConcessionTransaction).toHaveBeenCalledTimes(3);
});
test('business and ambiguous commit errors are never replayed', async () => {
  const service = { ...methods, _approveConcessionTransaction: jest.fn().mockRejectedValue(new Error('invalid')) };
  await expect(service.approveConcession(12, {})).rejects.toThrow('invalid');
  expect(service._approveConcessionTransaction).toHaveBeenCalledTimes(1);
});


test('real approval transaction rolls back and releases before reacquiring on deadlock', async () => {
  const db = require('../../src/config/db');
  const makeConnection = () => ({ beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    query: jest.fn(async sql => sql.startsWith('SELECT') ? [[{ id: 12, ncp_no: 'N12', status: 'processing', concession_status: 'pending', quantity: 10, handled_quantity: 0 }]] : [{ affectedRows: 1 }]) });
  const first = makeConnection(), second = makeConnection();
  db.pool.getConnection.mockResolvedValueOnce(first).mockImplementationOnce(async () => {
    expect(first.rollback).toHaveBeenCalledTimes(1);
    expect(first.release).toHaveBeenCalledTimes(1);
    return second;
  });
  const service = { ...methods, handleUseAsIs: jest.fn().mockRejectedValueOnce(deadlock()).mockResolvedValueOnce({ id: 22 }) };
  await expect(service.approveConcession(12, { status: 'approved', approverId: 1, approverName: 'QA' })).resolves.toBe(true);
  expect(first.commit).not.toHaveBeenCalled();
  expect(second.commit).toHaveBeenCalledTimes(1);
  expect(second.rollback).not.toHaveBeenCalled();
  expect(second.release).toHaveBeenCalledTimes(1);
});
