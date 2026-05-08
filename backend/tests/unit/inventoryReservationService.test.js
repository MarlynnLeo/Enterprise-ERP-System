jest.mock('../../src/config/db', () => ({
  pool: {
    getConnection: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('../../src/services/InventoryService', () => ({
  getBatchMaterialInfo: jest.fn(),
  getCurrentStock: jest.fn(),
}));

const InventoryReservationService = require('../../src/services/InventoryReservationService');
const InventoryService = require('../../src/services/InventoryService');

describe('InventoryReservationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    InventoryService.getBatchMaterialInfo.mockResolvedValue(
      new Map([
        [1001, { code: 'MAT-1001', name: 'Material 1001', locationId: 10 }],
      ])
    );
  });

  function createConnection(existingReserved = 0) {
    return {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ reserved_quantity: existingReserved }]])
        .mockResolvedValueOnce([[{ reserved_quantity: 0 }]])
        .mockResolvedValueOnce([{ insertId: 88 }]),
    };
  }

  it('reserves only the missing quantity for an order with existing active reservations', async () => {
    const conn = createConnection(4);
    InventoryService.getCurrentStock.mockResolvedValue(10);

    const result = await InventoryReservationService.reserveInventoryForOrder(
      200,
      'SO-200',
      [{ material_id: 1001, quantity: 10 }],
      1,
      conn
    );

    expect(result.fullSuccess).toBe(true);
    expect(conn.execute).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO inventory_reservations'),
      expect.arrayContaining([200, 'SO-200', 1001, 'MAT-1001', 'Material 1001', 10, 6])
    );
  });

  it('does not report full success when available stock cannot cover the order line', async () => {
    const conn = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ reserved_quantity: 0 }]])
        .mockResolvedValueOnce([[{ reserved_quantity: 0 }]])
        .mockResolvedValueOnce([{ insertId: 89 }]),
    };
    InventoryService.getCurrentStock.mockResolvedValue(3);

    const result = await InventoryReservationService.reserveInventoryForOrder(
      201,
      'SO-201',
      [{ material_id: 1001, quantity: 10 }],
      1,
      conn
    );

    expect(result.fullSuccess).toBe(false);
    expect(result.partialSuccess).toBe(true);
    expect(result.insufficientItems[0]).toMatchObject({
      materialId: 1001,
      required: 10,
      reserved: 3,
      shortage: 7,
    });
  });
});
