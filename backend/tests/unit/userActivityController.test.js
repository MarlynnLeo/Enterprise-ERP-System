/* global afterEach, describe, expect, jest, test */

jest.mock('../../src/services/AuditService', () => ({
  AuditService: {
    query: jest.fn(),
    queryForExport: jest.fn(),
  },
}));

jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const db = require('../../src/config/db');
const { AuditService } = require('../../src/services/AuditService');
const userActivityController = require('../../src/controllers/common/userActivityController');

const createResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('userActivityController', () => {
  afterEach(() => {
    db.pool.query.mockReset();
    AuditService.query.mockReset();
    AuditService.queryForExport.mockReset();
  });

  test('rejects invalid online ranking dates before querying audit logs', async () => {
    const res = createResponse();

    await userActivityController.getOnlineTimeRanking({ query: { date: '2026-02-31' } }, res);

    expect(db.pool.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorCode: 'VALIDATION_ERROR',
      })
    );
  });

  test('maps ranking display name from real_name instead of username', async () => {
    db.pool.query.mockResolvedValueOnce([
      [
        {
          user_id: 19,
          username: 'WBJ',
          real_name: '王彬洁',
          avatar: null,
          avatar_frame: null,
          bio: null,
          total_seconds: 3600,
          hours: 1,
          minutes: 0,
        },
      ],
    ]);
    const res = createResponse();

    await userActivityController.getOnlineTimeRanking({ query: { date: '2026-08-14' } }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          rankings: [
            expect.objectContaining({
              username: 'WBJ',
              realName: '王彬洁',
            }),
          ],
        }),
      })
    );
  });

  test('excludes online heartbeats and formats real business activities', async () => {
    AuditService.query.mockResolvedValueOnce({
      list: [
        {
          id: 2,
          user_id: 19,
          module: 'finance',
          action: 'UPDATE',
          path: '/api/finance/entries/1',
          entity_type: 'gl_entries',
          entity_id: '1',
          created_at: '2026-08-14 11:00:00',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    const res = createResponse();
    await userActivityController.getUserActivities(
      { user: { id: 19 }, query: { page: 1, limit: 20 } },
      res
    );

    expect(AuditService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 19,
        excludeActions: ['ACTIVITY'],
        excludePaths: expect.arrayContaining([
          '/unread-count',
          '/user-activities',
        ]),
      })
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          activities: [
            expect.objectContaining({
              content: "财务操作 · #1",
              category: 'finance',
            }),
          ],
        }),
      })
    );
  });


});
