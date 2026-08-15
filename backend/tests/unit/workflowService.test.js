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
