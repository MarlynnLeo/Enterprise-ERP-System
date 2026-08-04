jest.mock('../../src/events/EventBus', () => ({
  on: jest.fn(),
}));

jest.mock('../../src/services/system/NotificationRuleService', () => ({
  getActiveRulesByEvent: jest.fn(),
  resolveRecipients: jest.fn(),
  renderTemplate: jest.fn((template) => template),
}));

jest.mock('../../src/services/NotificationService', () => ({
  notifyUsers: jest.fn(),
}));

jest.mock('../../src/services/system/NotificationGovernanceConfig', () => ({
  get: jest.fn().mockResolvedValue({ realtimeWindowMinutes: 5 }),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const RuleService = require('../../src/services/system/NotificationRuleService');
const NotificationService = require('../../src/services/NotificationService');
const subscriber = require('../../src/events/subscribers/NotificationSubscriber');

describe('NotificationSubscriber delivery policy', () => {
  beforeEach(() => jest.clearAllMocks());

  test('陈旧积压事件仍写入通知库，但不实时弹窗', async () => {
    RuleService.getActiveRulesByEvent.mockResolvedValueOnce([{
      id: 3,
      name: '测试规则',
      recipient_type: 'user',
      recipient_config: [2],
      title_template: '标题',
      content_template: '内容',
      link_template: '/finance',
      priority: 1,
    }]);
    RuleService.resolveRecipients.mockResolvedValueOnce([2]);
    NotificationService.notifyUsers.mockResolvedValueOnce({
      inserted: 1,
      skipped: 0,
      updated: 0,
      insertedUserIds: [2],
    });

    await subscriber.handleEvent('FINANCE_AR_INVOICE_OVERDUE', {
      invoiceId: 99,
      __domainEvent: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    });

    expect(NotificationService.notifyUsers).toHaveBeenCalledWith(
      [2],
      expect.objectContaining({ type: 'business' }),
      expect.objectContaining({ dedupeBySource: true })
    );
  });
});
