/* global afterEach, beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../../src/models/purchase', () => ({}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  assertAccess: jest.fn(),
}));
jest.mock('../../src/utils/desensitizer', () => ({ desensitizeDataForUser: jest.fn() }));
jest.mock('../../src/services/PurchaseOrderService', () => ({}));
jest.mock('../../src/services/business/PurchaseOrderStatusService', () => ({}));
jest.mock('../../src/services/business/PurchaseReceiveInspectionService', () => ({}));
jest.mock('../../src/services/business/PurchasePriceService', () => ({}));
jest.mock('../../src/services/business/SupplierMetalRangePriceService', () => ({}));

const db = require('../../src/config/db');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const controller = require('../../src/controllers/business/purchase/purchaseOrderController');
const { DatabaseSync } = require('node:sqlite');

describe('purchase order details for printing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.pool.query.mockReset();
    ScopeGuard.assertAccess.mockResolvedValue(true);
  });

  test.each([
    ['creator name takes precedence over username', ' 潘林苏 ', 'buyer.pan', '潘林苏'],
    ['missing creator name falls back to username', null, 'buyer.pan', 'buyer.pan'],
    ['blank creator name falls back to username', '   ', ' buyer.pan ', 'buyer.pan'],
    ['missing creator remains blank', null, null, null],
    ['empty creator details remain blank', ' ', '', null],
  ])(
    '%s without using the current viewer as sender',
    async (_label, realName, username, senderName) => {
      db.pool.query
        .mockResolvedValueOnce([
          [
            {
              id: 9,
              order_no: 'G2610060022',
              created_by: 7,
              supplier_code: 'G010',
              sender_real_name: realName,
              sender_username: username,
            },
          ],
        ])
        .mockResolvedValueOnce([[]]);
      const req = {
        params: { id: '9' },
        user: { id: 99, username: 'viewer', real_name: '当前打印者' },
        userPermissions: ['purchase:orders:view'],
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

      await controller.getOrder(req, res);

      expect(ScopeGuard.assertAccess).toHaveBeenCalledWith(db.pool, req, 'purchase_order', 9, {
        accessMode: 'read',
      });
      expect(db.pool.query.mock.calls[0][0]).toMatch(
        /LEFT JOIN users creator ON o\.created_by = creator\.id/
      );
      expect(db.pool.query.mock.calls[0][1]).toEqual([9]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 9,
            createdBy: 7,
            supplierCode: 'G010',
            senderName,
          }),
        })
      );
    }
  );

  describe('approval signature evidence', () => {
    let fixture;

    beforeEach(() => {
      fixture = new DatabaseSync(':memory:');
      fixture.exec(`
        CREATE TABLE purchase_orders (
          id INTEGER, order_no TEXT, order_date TEXT, supplier_id INTEGER, created_by INTEGER,
          status TEXT, workflow_instance_id INTEGER, deleted_at TEXT
        );
        CREATE TABLE suppliers (id INTEGER, code TEXT, name TEXT);
        CREATE TABLE users (id INTEGER, real_name TEXT, username TEXT, signature_code TEXT);
        CREATE TABLE workflow_instances (
          id INTEGER, business_type TEXT, business_id INTEGER, status TEXT,
          completed_at TEXT, deleted_at TEXT
        );
        CREATE TABLE workflow_action_logs (
          id INTEGER, instance_id INTEGER, action TEXT, actor_id INTEGER,
          actor_name TEXT, to_status TEXT, created_at TEXT
        );
        CREATE TABLE workflow_instance_nodes (
          id INTEGER, instance_id INTEGER, node_type TEXT, sequence INTEGER,
          status TEXT, approver_id INTEGER, approver_name TEXT, acted_at TEXT
        );
        INSERT INTO purchase_orders VALUES
          (9, 'G2610060022', '2026-10-06', 1, 7, 'approved', 10, NULL);
        INSERT INTO suppliers VALUES (1, 'G010', '浙江久制电气有限公司');
        INSERT INTO users VALUES
          (7, '制单人', 'creator', 'B'),
          (42, '最终审核人', 'final.approver', 'Z'),
          (43, '最终审核人', 'same.name', 'A'),
          (44, '重新审核人', 'new.approver', 'K'),
          (99, '当前打印者', 'viewer', 'V');
        INSERT INTO workflow_instances VALUES
          (10, 'purchase_order', 9, 'approved', '2026-10-07 00:00:02', NULL);
        INSERT INTO workflow_instance_nodes VALUES
          (100, 10, 'approval', 1, 'approved', 43, '初审人', '2026-10-06 11:00:00'),
          (101, 10, 'approval', 2, 'approved', 42, '最终审核人', '2026-10-07 00:00:00'),
          (102, 10, 'end', 3, 'approved', 99, '结束节点不是签字人', NULL);
        INSERT INTO workflow_action_logs VALUES
          (1000, 10, 'approve', 43, '初审人', 'approved', '2026-10-06 11:00:00'),
          (1001, 10, 'complete', 42, '最终审核人', 'approved', '2026-10-07 00:00:01');
      `);
      db.pool.query.mockImplementation(async (sql, params) => {
        if (sql.includes('FROM purchase_orders o')) return [fixture.prepare(sql).all(...params)];
        if (sql.includes('purchase_order_items poi')) return [[]];
        throw new Error(`Unexpected query: ${sql}`);
      });
    });

    afterEach(() => fixture.close());

    async function getPrintedOrder() {
      const req = {
        params: { id: '9' },
        user: { id: 99, username: 'viewer', real_name: '当前打印者', signature_code: 'V' },
        userPermissions: ['purchase:orders:view'],
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
      await controller.getOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      return res.json.mock.calls[0][0].data;
    }

    function expectUnsigned(order) {
      expect(order).toEqual(
        expect.objectContaining({
          approverId: null,
          approverName: null,
          approverSignatureCode: null,
          approvedAt: null,
        })
      );
    }

    test('uses the actual final approval actor and date, not creator, viewer or another same-name user', async () => {
      const order = await getPrintedOrder();
      expect(order).toEqual(
        expect.objectContaining({
          createdBy: 7,
          senderName: '制单人',
          approverId: 42,
          approverName: '最终审核人',
          approverSignatureCode: 'Z',
          approvedAt: '2026-10-07 00:00:01',
        })
      );
      expect(order.orderDate).toBe('2026-10-06');
      expect(Object.keys(order).some((key) => key.startsWith('print_'))).toBe(false);
    });

    test.each(['pending', 'in_progress', 'rejected', 'withdrawn', 'cancelled'])(
      'does not reuse an older approval when the latest workflow is %s',
      async (status) => {
        fixture
          .prepare('INSERT INTO workflow_instances VALUES (11, ?, 9, ?, NULL, NULL)')
          .run('purchase_order', status);
        fixture.exec('UPDATE purchase_orders SET workflow_instance_id = 11');
        expectUnsigned(await getPrintedOrder());
      }
    );

    test('uses the latest completed resubmission even when the prior approval still exists', async () => {
      fixture.exec(`
        INSERT INTO workflow_instances VALUES
          (11, 'purchase_order', 9, 'approved', '2026-10-09 10:02:00', NULL);
        INSERT INTO workflow_action_logs VALUES
          (1002, 11, 'complete', 44, '重新审核人', 'approved', '2026-10-09 10:02:00');
        UPDATE purchase_orders SET workflow_instance_id = 11;
      `);
      expect(await getPrintedOrder()).toEqual(
        expect.objectContaining({
          approverId: 44,
          approverName: '重新审核人',
          approverSignatureCode: 'K',
          approvedAt: '2026-10-09 10:02:00',
        })
      );
    });

    test.each(['draft', 'pending', 'cancelled'])(
      'does not print stale approval evidence for a %s order',
      async (status) => {
        fixture.prepare('UPDATE purchase_orders SET status = ?').run(status);
        expectUnsigned(await getPrintedOrder());
      }
    );

    test.each([
      'received',
      'inspecting',
      'inspected',
      'warehousing',
      'partial_received',
      'completed',
    ])('preserves the original approval while the order advances to %s', async (status) => {
      fixture.prepare('UPDATE purchase_orders SET status = ?').run(status);
      expect(await getPrintedOrder()).toEqual(
        expect.objectContaining({
          status,
          approverId: 42,
          approverSignatureCode: 'Z',
          approvedAt: '2026-10-07 00:00:01',
        })
      );
    });

    test('leaves signature blank without losing the verified approver or approval date when no signature is configured', async () => {
      fixture.exec('UPDATE users SET signature_code = NULL WHERE id = 42');
      expect(await getPrintedOrder()).toEqual(
        expect.objectContaining({
          approverId: 42,
          approverName: '最终审核人',
          approverSignatureCode: null,
          approvedAt: '2026-10-07 00:00:01',
        })
      );
    });

    test('keeps a deleted user unsigned instead of matching another user by name', async () => {
      fixture.exec('DELETE FROM users WHERE id = 42');
      expect(await getPrintedOrder()).toEqual(
        expect.objectContaining({
          approverId: 42,
          approverName: '最终审核人',
          approverSignatureCode: null,
          approvedAt: '2026-10-07 00:00:01',
        })
      );
    });

    test('uses an older final approved node only when all approval nodes actually completed', async () => {
      fixture.exec("DELETE FROM workflow_action_logs WHERE action = 'complete'");
      expect(await getPrintedOrder()).toEqual(
        expect.objectContaining({
          approverId: 42,
          approverSignatureCode: 'Z',
          approvedAt: '2026-10-07 00:00:00',
        })
      );
    });

    test('does not treat legacy reconciliation or skipped assigned nodes as a human approval', async () => {
      fixture.exec(`
        DELETE FROM workflow_action_logs WHERE action = 'complete';
        UPDATE workflow_instance_nodes SET status = 'skipped' WHERE id = 101;
        INSERT INTO workflow_action_logs VALUES
          (1002, 10, 'legacy_reconcile', 99, 'System migration', 'approved', '2026-10-08 15:00:00');
      `);
      expectUnsigned(await getPrintedOrder());
    });

    test('does not use an approved last node if another required approval never completed', async () => {
      fixture.exec(`
        DELETE FROM workflow_action_logs WHERE action = 'complete';
        UPDATE workflow_instance_nodes SET status = 'skipped' WHERE id = 100;
      `);
      expectUnsigned(await getPrintedOrder());
    });

    test('waits for countersigning to complete and then uses the final participant', async () => {
      fixture.exec(`
        UPDATE workflow_instances SET status = 'in_progress', completed_at = NULL;
        UPDATE purchase_orders SET status = 'pending';
        UPDATE workflow_instance_nodes SET status = 'in_progress', acted_at = NULL WHERE id = 101;
        DELETE FROM workflow_action_logs WHERE action = 'complete';
        INSERT INTO workflow_action_logs VALUES
          (1002, 10, 'approve', 43, '另一会签人', 'in_progress', '2026-10-07 09:00:00');
      `);
      expectUnsigned(await getPrintedOrder());

      fixture.exec(`
        UPDATE workflow_instances SET status = 'approved', completed_at = '2026-10-08 10:00:00';
        UPDATE purchase_orders SET status = 'approved';
        UPDATE workflow_instance_nodes SET status = 'approved', approver_id = 44,
          approver_name = '重新审核人', acted_at = '2026-10-08 10:00:00' WHERE id = 101;
        INSERT INTO workflow_action_logs VALUES
          (1003, 10, 'complete', 44, '重新审核人', 'approved', '2026-10-08 10:00:00');
      `);
      expect(await getPrintedOrder()).toEqual(
        expect.objectContaining({
          approverId: 44,
          approverSignatureCode: 'K',
          approvedAt: '2026-10-08 10:00:00',
        })
      );
    });

    test.each([
      'DELETE FROM workflow_instances',
      "UPDATE workflow_instances SET deleted_at = '2026-10-08 12:00:00'",
      "UPDATE workflow_instances SET business_type = 'contract'",
      'UPDATE workflow_instances SET business_id = 99',
      'UPDATE purchase_orders SET workflow_instance_id = 999',
    ])('leaves signature blank without valid approval workflow ownership: %s', async (sql) => {
      fixture.exec(sql);
      expectUnsigned(await getPrintedOrder());
    });

    test('never falls back to an old workflow when the order points to a deleted resubmission', async () => {
      fixture.exec(`
        INSERT INTO workflow_instances VALUES
          (11, 'purchase_order', 9, 'approved', '2026-10-09 10:02:00', '2026-10-10 10:00:00');
        UPDATE purchase_orders SET workflow_instance_id = 11;
      `);
      expectUnsigned(await getPrintedOrder());
    });

    test('requires an actual action date for historical approved nodes', async () => {
      fixture.exec(`
        DELETE FROM workflow_action_logs;
        UPDATE workflow_instance_nodes SET acted_at = NULL WHERE id = 101;
      `);
      expectUnsigned(await getPrintedOrder());
    });
  });
});
