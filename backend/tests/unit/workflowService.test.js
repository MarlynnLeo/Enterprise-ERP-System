jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return Object.assign(logger, { logger });
});

const { pool } = require('../../src/config/db');
const workflowService = require('../../src/services/business/WorkflowService');

describe('WorkflowService approval gates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('routes a self-only candidate to another administrator without enabling self approval', async () => {
    const query = jest.fn(async (sql) => {
      if (sql.includes('r.code IN')) return [[{ id: 42 }]];
      if (sql.includes('WHERE r.is_super_admin')) return [[{ id: 1 }]];
      return [{ affectedRows: 1 }];
    });
    await workflowService._assignApprover({ query }, 99, {
      node_name: '审批', approver_type: 'role', approver_ids: '["purchase_manager"]', allow_self_approval: 0,
    }, 42);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workflow_node_approvers'), [99, 1, 1, 'pending']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE workflow_instance_nodes'), [1, 'role', '[1]', 'any', 0, 99]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('u.id <> ?'), [0, 42]);
  });

  test('rejects a self-only candidate when no independent fallback exists', async () => {
    const query = jest.fn(async sql => sql.includes('r.code IN') ? [[{ id: 42 }]] : [[]]);
    await expect(workflowService._assignApprover({ query }, 99, {
      node_name: '审批', approver_type: 'role', approver_ids: '["purchase_manager"]', allow_self_approval: 0,
    }, 42)).rejects.toThrow('无可用审批人');
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
  });

  test('startWorkflow rejects when no active template is configured', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await expect(workflowService.startWorkflow({
      business_type: 'purchase_order',
      business_id: 1,
      business_code: 'PO-1',
      title: 'PO approval',
      initiator_id: 1,
    })).rejects.toThrow('未配置启用的审批流程');
  });

  test('startWorkflow rejects when template has no approval nodes', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 10, business_type: 'purchase_order' }]])
      .mockResolvedValueOnce([[{ id: 100, node_type: 'start' }, { id: 101, node_type: 'end' }]]);

    await expect(workflowService.startWorkflow({
      business_type: 'purchase_order',
      business_id: 1,
      business_code: 'PO-1',
      title: 'PO approval',
      initiator_id: 1,
    })).rejects.toThrow('缺少审批节点');
  });

  test('startWorkflow rejects unsupported business types before querying templates', async () => {
    await expect(workflowService.startWorkflow({
      business_type: 'manual_in',
      business_id: 1,
      business_code: 'MI-1',
      title: 'Manual transaction approval',
      initiator_id: 1,
    })).rejects.toThrow('未配置审批状态回调');

    expect(pool.query).not.toHaveBeenCalled();
  });

  test('purchase requisitions cannot start a workflow or create an approval template', async () => {
    await expect(workflowService.startWorkflow({
      business_type: 'purchase_requisition', business_id: 1, initiator_id: 7,
    })).rejects.toThrow('采购申请已取消审批');
    await expect(workflowService.createTemplate({
      code: 'WF-PR', name: 'Purchase requisition approval', business_type: 'purchase_requisition',
      nodes: [{ node_name: 'Approval', approver_type: 'self' }],
    }, 7)).rejects.toThrow('采购申请已取消审批');

    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(workflowService.BUSINESS_STATUS_MAP.purchase_requisition).toBeUndefined();
  });

  test.each(['approve', 'reject'])('blocks %s on historical requisition workflows before any write', async (action) => {
    const conn = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ id: 2, instance_id: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, business_type: 'purchase_requisition' }]]),
      beginTransaction: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    };
    pool.getConnection.mockResolvedValueOnce(conn);

    await expect(workflowService.handleApproval({
      instance_id: 1, node_id: 2, action, approver_id: 7,
    })).rejects.toThrow('采购申请已取消审批');

    expect(conn.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('blocks withdrawal of historical requisition workflows before any write', async () => {
    const conn = {
      query: jest.fn().mockResolvedValueOnce([[{ id: 1, business_type: 'purchase_requisition' }]]),
      beginTransaction: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    };
    pool.getConnection.mockResolvedValueOnce(conn);

    await expect(workflowService.withdrawWorkflow(1, 7)).rejects.toThrow('采购申请已取消审批');

    expect(conn.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('excludes old requisition templates from both configuration list and count', async () => {
    pool.query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);

    await workflowService.getTemplates();

    expect(pool.query).toHaveBeenCalledTimes(2);
    for (const [sql] of pool.query.mock.calls) {
      expect(sql).toContain("business_type <> 'purchase_requisition'");
    }
  });

  test('excludes old requisition approvals from both pending list and count', async () => {
    pool.query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);

    await workflowService.getMyPending(7);

    expect(pool.query).toHaveBeenCalledTimes(2);
    for (const [sql] of pool.query.mock.calls) {
      expect(sql).toContain("wi.business_type <> 'purchase_requisition'");
    }
  });

  test('createTemplate rejects unsupported business types before opening a connection', async () => {
    await expect(workflowService.createTemplate({
      code: 'WF-MANUAL-IN',
      name: 'Manual transaction approval',
      business_type: 'manual_in',
      nodes: [
        {
          node_name: 'Department approval',
          approver_type: 'role',
          approver_ids: ['purchase_manager'],
        },
      ],
    }, 1)).rejects.toThrow('未配置审批状态回调');

    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('tryStartWorkflow propagates startup errors instead of auto approving', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await expect(workflowService.tryStartWorkflow(
      'purchase_order',
      1,
      'PO-1',
      'PO approval',
      1
    )).rejects.toThrow('未配置启用的审批流程');
  });

  test('workflow instance visibility is not limited to initiator or approver', async () => {
    pool.query.mockResolvedValueOnce([[{ allowed: 1 }]]);

    await expect(workflowService.canAccessInstance(88, 42)).resolves.toBe(true);

    expect(pool.query).toHaveBeenCalledWith(
      expect.not.stringContaining('initiator_id = ?'),
      [88]
    );
  });

  test('assigns role approvers by system role code instead of user id', async () => {
    const conn = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ id: 54 }]])
        .mockResolvedValueOnce([[{ allowed: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    await workflowService._assignApprover(conn, 99, {
      node_name: '采购管理员审批',
      approver_type: 'role',
      approver_ids: JSON.stringify(['purchase_manager']),
    }, 24);

    expect(conn.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('r.code IN (?)'),
      [['purchase_manager']]
    );
    expect(conn.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO workflow_node_approvers'),
      [99, 54, 1, 'pending']
    );
  });

  test('assigns department approver from active users and prefers department manager', async () => {
    const conn = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ id: 7 }]])
        .mockResolvedValueOnce([[{ allowed: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    await workflowService._assignApprover(conn, 99, {
      node_name: 'Department approval',
      approver_type: 'department',
      approver_ids: JSON.stringify([3]),
    }, 1);

    expect(conn.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM users u'),
      [[3]]
    );
    expect(conn.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO workflow_node_approvers'),
      [99, 7, 1, 'pending']
    );
    expect(conn.query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('UPDATE workflow_instance_nodes'),
      [7, 'department', '[7]', 'any', 0, 99]
    );
  });

  test('rejects unimplemented automatic timeout decisions', () => {
    expect(() => workflowService._validateTemplateData({
      code: 'WF-TIMEOUT',
      name: 'Timeout workflow',
      business_type: 'contract',
      nodes: [{
        node_name: 'Approval',
        node_type: 'approval',
        sequence: 1,
        approver_type: 'role',
        approver_ids: ['purchase_manager'],
        timeout_hours: 1,
        timeout_action: 'auto_approve',
      }],
    })).toThrow('仅支持超时提醒');
  });
});
