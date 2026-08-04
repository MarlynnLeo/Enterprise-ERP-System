jest.mock('../../src/config/db', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../src/services/NotificationRecipientService', () => ({
  validateConfig: jest.fn(),
  resolveRecipients: jest.fn(),
  preview: jest.fn(),
}));

const { pool } = require('../../src/config/db');
const recipientService = require('../../src/services/NotificationRecipientService');
const service = require('../../src/services/system/NotificationResponsibilityService');

describe('NotificationResponsibilityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.clearCache();
  });

  test('拒绝财务规则向责任组范围外用户发送', async () => {
    pool.query.mockResolvedValueOnce([[
      { value: JSON.stringify({ finance: { recipient_type: 'department', recipient_config: [3] } }) },
    ]]);
    recipientService.resolveRecipients
      .mockResolvedValueOnce([10, 11])
      .mockResolvedValueOnce([10, 12]);

    await expect(service.validateRuleRecipients(
      'FINANCE_AR_INVOICE_OVERDUE',
      'user',
      [10, 12]
    )).rejects.toThrow('超出事件责任组');
  });

  test('更新责任组前保护现有启用规则收件范围', async () => {
    recipientService.validateConfig.mockResolvedValueOnce([8]);
    recipientService.resolveRecipients
      .mockResolvedValueOnce([20])
      .mockResolvedValueOnce([20, 21]);
    pool.query.mockResolvedValueOnce([[
      { id: 7, name: '应收通知', recipient_type: 'user', recipient_config: '[20,21]' },
    ]]);

    await expect(service.update('finance', {
      name: '财务通知责任组',
      recipient_type: 'user',
      recipient_config: [8],
    })).rejects.toThrow('不能排除启用规则');
  });
});
