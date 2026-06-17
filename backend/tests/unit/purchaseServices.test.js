const PurchaseOrderService = require('../../src/services/PurchaseOrderService');
const PurchaseOrderStatusService = require('../../src/services/business/PurchaseOrderStatusService');

describe('purchase service invariants', () => {
  test('does not complete a requisition when duplicate material rows are only partially ordered', async () => {
    const connection = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ id: 1, status: 'approved' }]])
        .mockResolvedValueOnce([[
          { material_id: 10, material_code: 'M-10', quantity: 5 },
          { material_id: 10, material_code: 'M-10', quantity: 5 },
        ]])
        .mockResolvedValueOnce([[{ material_id: 10, material_code: 'M-10', ordered_quantity: 6 }]]),
    };

    const result = await PurchaseOrderService.syncRequisitionStatusFromOrders(connection, 1);

    expect(result).toMatchObject({
      requisitionId: 1,
      status: 'approved',
      totalRequired: 10,
      totalOrdered: 6,
      completed: false,
    });
    expect(connection.query).toHaveBeenCalledTimes(3);
  });

  test('completes a requisition only after active order quantities cover every material', async () => {
    const connection = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ id: 1, status: 'approved' }]])
        .mockResolvedValueOnce([[
          { material_id: 10, material_code: 'M-10', quantity: 5 },
          { material_id: 11, material_code: 'M-11', quantity: 3 },
        ]])
        .mockResolvedValueOnce([[
          { material_id: 10, material_code: 'M-10', ordered_quantity: 5 },
          { material_id: 11, material_code: 'M-11', ordered_quantity: 3 },
        ]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    const result = await PurchaseOrderService.syncRequisitionStatusFromOrders(connection, 1);

    expect(result).toMatchObject({
      status: 'completed',
      totalRequired: 8,
      totalOrdered: 8,
      completed: true,
    });
    expect(connection.query.mock.calls[3][1]).toEqual(['completed', 1]);
  });

  test('rejects receipt synchronization when confirmed receipts exceed the order quantity', async () => {
    const connection = {
      execute: jest.fn()
        .mockResolvedValueOnce([[{ total_received: 12 }]])
        .mockResolvedValueOnce([[{ quantity: 10 }]]),
    };

    await expect(
      PurchaseOrderStatusService.syncOrderItemReceivedFromReceipts(7, 10, connection)
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });

    expect(connection.execute).toHaveBeenCalledTimes(2);
  });
});
