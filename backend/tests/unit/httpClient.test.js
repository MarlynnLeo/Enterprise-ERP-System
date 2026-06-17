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

    await expect(
      request('GET', `${baseUrl}/large`, {
        retries: 0,
        maxResponseBytes: 8,
      })
    ).rejects.toMatchObject({
      code: 'HTTP_RESPONSE_TOO_LARGE',
    });
  });
});
