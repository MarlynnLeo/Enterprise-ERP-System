/* global afterEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const db = require('../../src/config/db');
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
});
