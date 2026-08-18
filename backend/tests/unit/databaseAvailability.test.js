/* global describe, expect, jest, test */

const {
  isTransientDatabaseError,
  retryTransientDatabaseRead,
} = require('../../src/utils/databaseAvailability');

describe('database availability helpers', () => {
  test('recognizes retryable database transport errors, including wrapped causes', () => {
    expect(isTransientDatabaseError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isTransientDatabaseError({ cause: { code: 'PROTOCOL_CONNECTION_LOST' } })).toBe(true);
    expect(isTransientDatabaseError({ code: 'ER_PARSE_ERROR' })).toBe(false);
  });

  test('retries a transient read once and returns the recovered result', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }))
      .mockResolvedValueOnce('recovered');
    const onRetry = jest.fn();

    await expect(
      retryTransientDatabaseRead(operation, { delayMs: 0, onRetry })
    ).resolves.toBe('recovered');

    expect(operation).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ code: 'ETIMEDOUT' }), 1, 0);
  });

  test('does not retry permanent database errors', async () => {
    const error = Object.assign(new Error('bad query'), { code: 'ER_PARSE_ERROR' });
    const operation = jest.fn().mockRejectedValue(error);

    await expect(retryTransientDatabaseRead(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
