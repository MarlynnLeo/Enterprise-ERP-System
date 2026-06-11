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
          approver_type: 'user',
          approver_ids: [1],
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

  test('assigns department approver from active users and prefers department manager', async () => {
    const conn = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ id: 7 }]])
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
      2,
      'UPDATE workflow_instance_nodes SET approver_id = ? WHERE id = ?',
      [7, 99]
    );
  });
});
