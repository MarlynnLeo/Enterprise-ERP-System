const {
  normalizeUserId,
  firstValidUserId,
  getUserIdByIdentifier,
  getRequestActorLabel,
} = require('../../src/utils/userUtils');

describe('user identity resolution', () => {
  test('accepts only complete positive integer user IDs', () => {
    expect(normalizeUserId(7)).toBe(7);
    expect(normalizeUserId('7')).toBe(7);
    expect(normalizeUserId('7abc')).toBeNull();
    expect(normalizeUserId(0)).toBeNull();
    expect(normalizeUserId(-1)).toBeNull();
  });

  test('uses the first valid ID without allowing an invalid value to block fallback', () => {
    expect(firstValidUserId('invalid', 0, '12')).toBe(12);
    expect(firstValidUserId(null, undefined, '')).toBeNull();
  });

  test('resolves an exact active username', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValue([[{ id: 23 }]]),
    };

    await expect(getUserIdByIdentifier(connection, 'finance.user')).resolves.toBe(23);
    expect(connection.execute).toHaveBeenCalledWith(
      'SELECT id FROM users WHERE BINARY username = BINARY ? AND status = 1 LIMIT 1',
      ['finance.user']
    );
  });

  test('does not fall back from a display name or service alias to another account', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValue([[]]),
    };

    await expect(getUserIdByIdentifier(connection, '王晓敏')).rejects.toThrow('有效用户名不存在');
    expect(connection.execute).toHaveBeenCalledTimes(1);
  });

  test('getRequestActorLabel prefers real name over username', () => {
    expect(
      getRequestActorLabel({ user: { id: 1, username: 'WBJ', realName: '王彬洁' } })
    ).toBe('王彬洁');
    expect(
      getRequestActorLabel({ user: { id: 1, username: 'WBJ', real_name: '王彬洁' } })
    ).toBe('王彬洁');
    expect(getRequestActorLabel({ user: { id: 1, username: 'WBJ' } })).toBe('WBJ');
    expect(getRequestActorLabel({})).toBeNull();
  });
});
