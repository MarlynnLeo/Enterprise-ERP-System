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
});
