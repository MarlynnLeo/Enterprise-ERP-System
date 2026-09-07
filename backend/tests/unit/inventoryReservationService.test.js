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
const db = require('../../src/config/db');

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

  function createReservationState({ reserved = 0, otherReserved = 0 } = {}) {
    const state = { reserved, writes: 0 };
    const connection = {
      execute: jest.fn(async (sql, params) => {
        if (sql.includes('AND order_id != ?')) {
          return [[{ id: 99, reserved_quantity: otherReserved }]];
        }
        if (sql.includes('SELECT id, reserved_quantity')) {
          return [state.reserved > 0 ? [{ id: 88, reserved_quantity: state.reserved }] : []];
        }
        if (sql.includes('INSERT INTO inventory_reservations')) {
          state.reserved += params[6];
          state.writes += 1;
          return [{ insertId: 88 }];
        }
        if (sql.includes('UPDATE inventory_reservations')) {
          state.reserved += params[0];
          state.writes += 1;
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected reservation query: ${sql}`);
      }),
    };
    return { connection, state };
  }

  it('does not allocate stock already reserved by this order a second time', async () => {
    const { connection, state } = createReservationState({ reserved: 4, otherReserved: 5 });
    InventoryService.getCurrentStock.mockResolvedValue(10);

    const result = await InventoryReservationService.reserveInventoryForOrder(
      200, 'SO-200', [{ material_id: 1001, quantity: 10 }], 1, connection
    );

    expect(state.reserved).toBe(5);
    expect(state.reserved + 5).toBeLessThanOrEqual(10);
    expect(result.fullSuccess).toBe(false);
    expect(result.insufficientItems).toEqual([
      expect.objectContaining({ required: 10, reserved: 5, shortage: 5 }),
    ]);
  });

  it('reserves the combined demand of repeated material lines and remains idempotent', async () => {
    const { connection, state } = createReservationState();
    InventoryService.getCurrentStock.mockResolvedValue(12);
    const items = [
      { material_id: 1001, quantity: 4 },
      { material_id: 1001, quantity: 6 },
    ];

    const first = await InventoryReservationService.reserveInventoryForOrder(
      200, 'SO-200', items, 1, connection
    );
    const repeated = await InventoryReservationService.reserveInventoryForOrder(
      200, 'SO-200', items, 1, connection
    );

    expect(first.fullSuccess).toBe(true);
    expect(repeated.fullSuccess).toBe(true);
    expect(state.reserved).toBe(10);
    expect(state.writes).toBe(1);
  });

  it('reports a shortage when repeated material lines exceed the available stock in total', async () => {
    const { connection, state } = createReservationState();
    InventoryService.getCurrentStock.mockResolvedValue(8);

    const result = await InventoryReservationService.reserveInventoryForOrder(
      200, 'SO-200', [
        { material_id: 1001, quantity: 4 },
        { material_id: 1001, quantity: 6 },
      ], 1, connection
    );

    expect(state.reserved).toBe(8);
    expect(result.fullSuccess).toBe(false);
    expect(result.insufficientItems).toEqual([
      expect.objectContaining({ required: 10, reserved: 8, shortage: 2 }),
    ]);
  });

  it('commits its transaction before returning a connection with no reservations to release', async () => {
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
      execute: jest.fn().mockResolvedValue([[]]),
    };
    db.pool.getConnection.mockResolvedValue(connection);

    await expect(InventoryReservationService.releaseInventoryReservation(200, 1))
      .resolves.toMatchObject({ success: true, releasedCount: 0 });

    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.commit.mock.invocationCallOrder[0])
      .toBeLessThan(connection.release.mock.invocationCallOrder[0]);
  });

  it('leaves the caller transaction open when there are no reservations to release', async () => {
    const connection = {
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      execute: jest.fn().mockResolvedValue([[]]),
    };

    await expect(InventoryReservationService.releaseInventoryReservation(200, 1, connection))
      .resolves.toMatchObject({ success: true, releasedCount: 0 });

    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).not.toHaveBeenCalled();
  });

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

  it('partially consumes active reservations by quantity in an external connection', async () => {
    const conn = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ id: 11, reserved_quantity: 10 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    const result = await InventoryReservationService.consumeReservation(
      300,
      [{ material_id: 1001, quantity: 4 }],
      conn
    );

    expect(result.success).toBe(true);
    expect(result.consumedCount).toBe(1);
    expect(conn.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FOR UPDATE'),
      [300, 1001]
    );
    expect(conn.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('reserved_quantity = reserved_quantity - ?'),
      [4, 11]
    );
  });

  it('fully consumes reservation rows when ship quantity covers reserved amount', async () => {
    const conn = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ id: 12, reserved_quantity: 5 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    const result = await InventoryReservationService.consumeReservation(
      301,
      [{ product_id: 1001, quantity: 5 }],
      conn
    );

    expect(result.success).toBe(true);
    expect(conn.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("status = 'consumed'"),
      [12]
    );
  });
});
