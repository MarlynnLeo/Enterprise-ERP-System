jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({ CodeGenerators: {} }));
jest.mock('../../src/config/businessRulesConfig', () => ({ getModuleRules: jest.fn() }));
jest.mock('../../src/services/business/PendingPurchaseCoverageService', () => ({}));
jest.mock('../../src/services/business/RequisitionAutoOrderService', () => ({
  generateOrdersFromRequisition: jest.fn(),
}));

const businessRulesConfig = require('../../src/config/businessRulesConfig');
const {
  generateOrdersFromRequisition,
} = require('../../src/services/business/RequisitionAutoOrderService');
const {
  submitRequisition,
  createRequisitionFromOutboundShortage,
} = require('../../src/services/business/ShortageRequisitionService');

function makeConnection(status = 'draft') {
  const state = { status, orders: [] };
  let savepoint;
  return {
    state,
    query: jest.fn(async (sql) => {
      if (sql.startsWith('SAVEPOINT')) savepoint = JSON.parse(JSON.stringify(state));
      if (sql.startsWith('ROLLBACK TO')) Object.assign(state, savepoint);
      return [{ affectedRows: 1 }];
    }),
    execute: jest.fn(async (sql) => {
      if (sql.includes('FROM users')) return [[{ id: 9 }]];
      if (sql.includes('SELECT status')) return [[{ status: state.status }]];
      if (sql.includes('SELECT id, requisition_number, status')) {
        return [[{ id: 12, requisition_number: 'PR-12', status: state.status }]];
      }
      if (sql.includes("SET status = 'submitted'")) state.status = 'submitted';
      return [{ affectedRows: 1 }];
    }),
  };
}

describe('shortage requisition direct submission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    businessRulesConfig.getModuleRules.mockResolvedValue({ autoSubmitPROnIssueShortage: true });
  });

  test('generates orders with the caller transaction and responsible user', async () => {
    const connection = makeConnection();
    const orders = [{ order_id: 18, order_no: 'PO-18' }];
    generateOrdersFromRequisition.mockImplementation(async (_id, conn) => {
      expect(conn.state.status).toBe('submitted');
      conn.state.orders.push(...orders);
      conn.state.status = 'completed';
      return orders;
    });

    await expect(
      submitRequisition(connection, {
        requisitionId: 12,
        requisitionNo: 'PR-12',
        initiatorId: 7,
      })
    ).resolves.toEqual({ submitted: true, status: 'completed', generatedOrders: orders });

    expect(generateOrdersFromRequisition).toHaveBeenCalledWith(12, connection, 7);
    expect(connection.query).toHaveBeenLastCalledWith(
      'RELEASE SAVEPOINT shortage_requisition_submit'
    );
    expect(connection.state).toEqual({ status: 'completed', orders });
  });

  test('restores the draft and removes partial orders when generation fails', async () => {
    const connection = makeConnection();
    generateOrdersFromRequisition.mockImplementation(async (_id, conn) => {
      conn.state.orders.push({ order_id: 18 });
      throw new Error('second supplier order failed');
    });

    await expect(
      submitRequisition(connection, {
        requisitionId: 12,
        requisitionNo: 'PR-12',
        initiatorId: 7,
      })
    ).rejects.toThrow('second supplier order failed');

    expect(connection.query).toHaveBeenCalledWith(
      'ROLLBACK TO SAVEPOINT shortage_requisition_submit'
    );
    expect(connection.state).toEqual({ status: 'draft', orders: [] });
  });

  test('does not submit a requisition that another caller already completed', async () => {
    const connection = makeConnection('completed');

    await expect(
      submitRequisition(connection, {
        requisitionId: 12,
        requisitionNo: 'PR-12',
        initiatorId: 7,
      })
    ).resolves.toEqual({ submitted: false, status: 'completed', generatedOrders: [] });

    expect(generateOrdersFromRequisition).not.toHaveBeenCalled();
    expect(connection.execute.mock.calls.some(([sql]) => /^\s*UPDATE\b/.test(sql))).toBe(false);
  });

  test('uses an active administrator as the order owner for system generated shortages', async () => {
    const connection = makeConnection();
    generateOrdersFromRequisition.mockResolvedValue([]);

    await submitRequisition(connection, { requisitionId: 12, requisitionNo: 'PR-12' });

    expect(generateOrdersFromRequisition).toHaveBeenCalledWith(12, connection, 9);
  });

  test('keeps an existing shortage draft intact while allowing outbound processing to continue', async () => {
    const connection = makeConnection();
    generateOrdersFromRequisition.mockImplementation(async (_id, conn) => {
      conn.state.orders.push({ order_id: 18 });
      throw new Error('cannot create order');
    });

    await expect(
      createRequisitionFromOutboundShortage(connection, {
        outboundId: 5,
        outboundNo: 'OUT-5',
        operatorUserId: 7,
        shortageItems: [{ material_id: 3, shortage_quantity: 2 }],
      })
    ).resolves.toMatchObject({
      created: false,
      reason: 'already_exists',
      status: 'draft',
      submitted: false,
    });

    expect(connection.state).toEqual({ status: 'draft', orders: [] });
  });
});
