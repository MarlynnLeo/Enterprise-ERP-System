/* global afterEach, describe, expect, test */

const http = require('http');
const { request } = require('../../src/utils/httpClient');

let server;

const closeServer = async () => {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
  server = null;
};

const listen = async (handler) => {
  server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
};

describe('httpClient', () => {
  afterEach(async () => {
    await closeServer();
  });

  test('rejects responses that exceed the configured byte limit', async () => {
    const baseUrl = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('0123456789abcdef');
    });

    const requestPromise = request('GET', `${baseUrl}/large?access_token=do-not-log`, {
      retries: 0,
      maxResponseBytes: 8,
    });
    await expect(requestPromise).rejects.toMatchObject({
      code: 'HTTP_RESPONSE_TOO_LARGE',
    });
    await expect(requestPromise).rejects.not.toThrow(/do-not-log/);
  });

  test('does not retry unsafe POST requests unless explicitly requested', async () => {
    let attempts = 0;
    const baseUrl = await listen((req, _res) => {
      attempts += 1;
      req.socket.destroy();
    });

    await expect(
      request('POST', `${baseUrl}/mutate`, {
        data: { value: 1 },
      })
    ).rejects.toBeDefined();

    expect(attempts).toBe(1);
  });
});
