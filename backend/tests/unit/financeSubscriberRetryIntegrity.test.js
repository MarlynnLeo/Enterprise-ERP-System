/* global beforeEach, describe, expect, jest, test */

const mockExecute = jest.fn();
const mockPoolQuery = jest.fn();
const mockConnectionQuery = jest.fn();
const mockRelease = jest.fn();
const mockGenerateAR = jest.fn();
const mockGenerateAP = jest.fn();
const mockEmitAsync = jest.fn();

jest.mock('../../src/config/db', () => ({
  pool: {
    execute: mockExecute,
    query: mockPoolQuery,
    getConnection: jest.fn(async () => ({ query: mockConnectionQuery, release: mockRelease })),
  },
}));
jest.mock('../../src/events/EventBus', () => ({ on: jest.fn(), emitAsync: mockEmitAsync }));
jest.mock('../../src/services/InventoryPostingService', () => ({
  findApprovedForTransaction: jest.fn(async () => ({ id: 70 })),
}));
jest.mock('../../src/services/external/FinanceIntegrationService', () => ({
  generateARInvoiceFromSalesOutbound: mockGenerateAR,
  generateAPInvoiceFromPurchaseReceipt: mockGenerateAP,
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const DLQService = require('../../src/services/business/DLQService');
const DomainEventService = require('../../src/services/business/DomainEventService');
const subscriber = require('../../src/events/subscribers/FinanceSubscriber');

describe('finance retry durability', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockPoolQuery.mockReset();
    mockConnectionQuery.mockReset();
    mockGenerateAR.mockReset();
    mockGenerateAP.mockReset();
    mockEmitAsync.mockReset();
  });

  function preparePurchaseEvent() {
    const receipt = { id: 12, receipt_no: 'RCV-12' };
    mockExecute.mockImplementation(async (sql) => {
      if (sql.includes('FROM purchase_receipts pr')) return [[receipt]];
      if (sql.includes('FROM ap_invoices')) return [[]];
      if (sql.includes('FROM tax_invoices')) return [[{ id: 33 }]];
      if (sql.includes('UPDATE domain_events')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    mockEmitAsync.mockImplementation(async (_eventName, payload) => {
      await subscriber.handlePurchaseReceiptCompleted(payload);
      return true;
    });
    return { id: 90, event_name: 'PURCHASE_RECEIPT_COMPLETED', payload: { receiptId: 12 } };
  }

  test('keeps the outbox event failed when finance and durable retry storage both fail', async () => {
    const event = preparePurchaseEvent();
    const unavailable = new Error('Retry storage unavailable');
    mockGenerateAP.mockRejectedValue(new Error('AP service unavailable'));
    mockConnectionQuery.mockRejectedValue(unavailable);

    await expect(DomainEventService.dispatchEvent(event)).rejects.toBe(unavailable);

    const updates = mockExecute.mock.calls.filter(([sql]) => sql.includes('UPDATE domain_events'));
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toContain("status = 'failed'");
    expect(mockConnectionQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sys_failed_jobs'),
      expect.arrayContaining(['Finance:GenerateAPInvoiceFromPurchaseReceipt'])
    );
    expect(mockRelease).toHaveBeenCalled();
  });

  test('acknowledges the outbox only after a finance failure has been persisted for retry', async () => {
    const event = preparePurchaseEvent();
    mockGenerateAP.mockRejectedValue(new Error('AP service unavailable'));
    mockConnectionQuery.mockResolvedValue([{ insertId: 21 }]);

    await DomainEventService.dispatchEvent(event);

    expect(mockConnectionQuery).toHaveBeenCalledTimes(1);
    const update = mockExecute.mock.calls.find(([sql]) => sql.includes('UPDATE domain_events'));
    expect(update[1][0]).toBe('processed');
    expect(mockConnectionQuery.mock.invocationCallOrder[0]).toBeLessThan(
      mockExecute.mock.invocationCallOrder[mockExecute.mock.calls.indexOf(update)]
    );
  });

  function prepareARJob(status = 'completed') {
    const job = {
      id: 21,
      task_name: 'Finance:GenerateARInvoiceFromSalesOutbound',
      payload: { outboundId: 8, currentUserId: 60, salesOrderIds: [999] },
      attempts: 0,
    };
    const outbound = { id: 8, outbound_no: 'SO-8', order_id: 19, status };
    jest.spyOn(subscriber, 'fetchSalesOutbound').mockResolvedValue(outbound);
    jest.spyOn(subscriber, 'existsBySource').mockResolvedValue(false);
    jest
      .spyOn(subscriber, 'fetchSalesOrdersForOutbound')
      .mockResolvedValue([{ id: 19 }, { id: 20 }]);
    mockPoolQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, task_name, payload, attempts'))
        return [[{ ...job, attempts: 1 }]];
      return [{ affectedRows: 1 }];
    });
    return { job, outbound };
  }

  test('retries outbound AR using current source and order associations', async () => {
    const { job, outbound } = prepareARJob();
    mockGenerateAR.mockResolvedValue({ invoiceId: 44 });

    await expect(DLQService.retryJob(job)).resolves.toEqual({ retried: true, resolved: true });

    expect(subscriber.fetchSalesOutbound).toHaveBeenCalledWith(8);
    expect(subscriber.fetchSalesOrdersForOutbound).toHaveBeenCalledWith(8, 19);
    expect(mockGenerateAR).toHaveBeenCalledWith(outbound, [{ id: 19 }, { id: 20 }], 60);
  });

  test('failed outbound AR retries remain pending and retain the job attempt count', async () => {
    const { job } = prepareARJob();
    mockGenerateAR.mockRejectedValue(new Error('Accounting period is closed'));

    await expect(DLQService.retryJob(job)).resolves.toEqual({
      retried: true,
      resolved: false,
      exhausted: false,
    });

    expect(mockPoolQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('error_message = ?'),
      expect.arrayContaining(['pending', 'Accounting period is closed', 21])
    );
    expect(mockConnectionQuery).not.toHaveBeenCalled();
  });

  test('legacy composite retry failures preserve the original job instead of enqueueing a new attempt-zero job', async () => {
    preparePurchaseEvent();
    const job = {
      id: 31,
      task_name: 'Finance:PurchaseReceiptCompleted',
      payload: { receiptId: 12 },
      attempts: 4,
    };
    mockPoolQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, task_name, payload, attempts'))
        return [[{ ...job, attempts: 5 }]];
      return [{ affectedRows: 1 }];
    });
    mockGenerateAP.mockRejectedValue(new Error('AP service unavailable'));

    await expect(DLQService.retryJob(job)).resolves.toEqual({
      retried: true,
      resolved: false,
      exhausted: true,
    });

    expect(mockConnectionQuery).not.toHaveBeenCalled();
    expect(mockPoolQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('error_message = ?'),
      expect.arrayContaining(['failed', 'AP service unavailable', 31])
    );
  });

  test.each(['reversed', 'cancelled'])('does not regenerate AR for a %s source', async (status) => {
    const { job } = prepareARJob(status);

    await expect(DLQService.retryJob(job)).resolves.toEqual({ retried: true, resolved: true });

    expect(mockGenerateAR).not.toHaveBeenCalled();
    expect(subscriber.fetchSalesOrdersForOutbound).not.toHaveBeenCalled();
  });

  test('returns existing active AR without creating another invoice', async () => {
    const { job } = prepareARJob();
    subscriber.existsBySource.mockResolvedValue(true);

    await expect(DLQService.retryJob(job)).resolves.toEqual({ retried: true, resolved: true });

    expect(mockGenerateAR).not.toHaveBeenCalled();
  });

  test('sales source-read failures also propagate when retry storage is unavailable', async () => {
    jest.spyOn(subscriber, 'fetchSalesOutbound').mockRejectedValue(new Error('Source unavailable'));
    mockConnectionQuery.mockRejectedValue(new Error('Retry storage unavailable'));

    await expect(
      subscriber.handleSalesOutboundCompleted({ outboundData: { id: 8 } })
    ).rejects.toThrow('Retry storage unavailable');
  });

  test('keeps best-effort recording compatible for callers without a durable outbox', async () => {
    mockConnectionQuery.mockRejectedValue(new Error('Retry storage unavailable'));

    await expect(
      DLQService.recordSideEffectFailure('Other:Task', {}, new Error('Original failure'))
    ).resolves.toBeUndefined();
  });
});
