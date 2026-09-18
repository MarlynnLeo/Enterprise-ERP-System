describe('logger metadata normalization', () => {
  let logger;
  let stdoutSpy;
  let stream;
  let createStreamSpy;
  let originalEnv;
  const envKeys = ['NODE_ENV', 'LOG_LEVEL', 'LOG_DIR', 'LOG_CONSOLE'];

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
    process.env.NODE_ENV = 'test';
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_DIR;
    delete process.env.LOG_CONSOLE;
    const fs = require('node:fs');
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    stream = { on: jest.fn().mockReturnThis(), write: jest.fn(), end: jest.fn() };
    createStreamSpy = jest.spyOn(fs, 'createWriteStream').mockReturnValue(stream);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logger = require('../../src/utils/logger');
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
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

  it('keeps full errors in the log file when audit console output is disabled', () => {
    process.env.LOG_CONSOLE = 'false';
    const error = Object.assign(new Error('Quantity must be positive'), { code: 'VALIDATION_ERROR' });
    logger.error('Create failed', error);

    expect(stdoutSpy).not.toHaveBeenCalled();
    const entry = JSON.parse(stream.write.mock.calls.at(-1)[0]);
    expect(entry).toMatchObject({ level: 'ERROR', message: 'Create failed', error: error.message, code: 'VALIDATION_ERROR' });
    expect(entry.stack).toContain('Quantity must be positive');
  });

  it('writes isolated audit logs to the configured directory', () => {
    process.env.LOG_DIR = 'logs/sales-audit-test/application';
    jest.resetModules();
    logger = require('../../src/utils/logger');
    logger.warn('Expected business rejection');

    const path = require('node:path');
    expect(path.dirname(createStreamSpy.mock.calls.at(-1)[0])).toBe(path.resolve(process.env.LOG_DIR));
    expect(JSON.parse(stream.write.mock.calls.at(-1)[0]).message).toBe('Expected business rejection');
  });

  it('still prints and persists application errors by default', () => {
    logger.error('Unexpected server error');
    expect(lastLogEntry()).toMatchObject({ level: 'ERROR', message: 'Unexpected server error' });
    expect(stream.write).toHaveBeenCalledTimes(1);
  });
});
