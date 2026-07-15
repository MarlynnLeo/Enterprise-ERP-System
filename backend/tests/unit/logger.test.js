describe('logger metadata normalization', () => {
  let logger;
  let stdoutSpy;

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    delete process.env.LOG_LEVEL;
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logger = require('../../src/utils/logger');
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  const lastLogEntry = () => {
    const output = stdoutSpy.mock.calls.at(-1)?.[0] || '';
    const json = output.replace(/\x1b\[[0-9;]*m/g, '').trim();
    return JSON.parse(json);
  };

  it('wraps string metadata instead of spreading it into character indexes', () => {
    logger.info('payload received', '{"id":1}');

    const entry = lastLogEntry();
    expect(entry.meta).toBe('{"id":1}');
    expect(entry).not.toHaveProperty('0');
  });

  it('wraps array metadata instead of spreading it into numeric keys', () => {
    logger.info('items received', [{ id: 1 }]);

    const entry = lastLogEntry();
    expect(entry.meta).toEqual([{ id: 1 }]);
    expect(entry).not.toHaveProperty('0');
  });
});
