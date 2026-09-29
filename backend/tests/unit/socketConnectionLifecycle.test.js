/* global describe, expect, jest, test, beforeEach, afterEach */
const http = require('http');
const proxyaddr = require('proxy-addr');

jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn() } }));
jest.mock('../../src/config/jwtEnhanced', () => ({ verifyAccessToken: jest.fn() }));
jest.mock('../../src/services/PermissionService', () => ({ getUserPermissions: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const { initSocket } = require('../../src/socket');
const { pool } = require('../../src/config/db');
const { verifyAccessToken } = require('../../src/config/jwtEnhanced');
const PermissionService = require('../../src/services/PermissionService');

describe('Socket quota lifecycle on the actual Engine.IO server', () => {
  let httpServer;
  let io;
  let baseUrl;

  beforeEach(async () => {
    httpServer = http.createServer();
    io = initSocket(httpServer, { trustProxy: proxyaddr.compile(['loopback']) });
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${httpServer.address().port}/socket.io/?EIO=4&transport=polling`;
    verifyAccessToken.mockReturnValue({ id: 7, tokenVersion: 0 });
    pool.execute.mockResolvedValue([
      [{ id: 7, username: 'socket-test', status: 1, token_version: 0 }],
    ]);
    PermissionService.getUserPermissions.mockResolvedValue(['chat:access']);
  });

  afterEach(async () => {
    await new Promise((resolve) => io.close(resolve));
    httpServer.closeAllConnections();
  });

  async function handshake(ip = '203.0.113.10') {
    const response = await fetch(baseUrl, { headers: { 'x-forwarded-for': ip } });
    const body = await response.text();
    return { status: response.status, sid: response.ok ? JSON.parse(body.slice(1)).sid : null };
  }

  async function authenticate(sid, payload) {
    const url = `${baseUrl}&sid=${sid}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `40${JSON.stringify(payload)}`,
    });
    const response = await fetch(url);
    return response.text();
  }

  test('more than 25 abandoned pre-auth sessions do not exhaust the quota', async () => {
    for (let index = 0; index < 30; index++) {
      const result = await handshake();
      expect(result.status).toBe(200);
      io.engine.clients[result.sid].close(true);
    }
    expect(io.engine.clientsCount).toBe(0);
    expect((await handshake()).status).toBe(200);
  });

  test('failed authentication followed by transport close releases every reservation', async () => {
    for (let index = 0; index < 27; index++) {
      const { status, sid } = await handshake();
      expect(status).toBe(200);
      expect(await authenticate(sid, {})).toContain('44');
      io.engine.clients[sid].close(true);
    }
    expect(io.sockets.sockets.size).toBe(0);
    expect((await handshake()).status).toBe(200);
  });

  test('an auth timeout closes Engine.IO and restores the quota', async () => {
    io.connectTimeout(30);
    const { sid } = await handshake();
    const client = io.engine.clients[sid];
    const closed = client
      ? new Promise((resolve) => client.once('close', resolve))
      : Promise.resolve();
    const response = await fetch(`${baseUrl}&sid=${sid}`);
    await response.text();
    await closed;
    expect(io.engine.clientsCount).toBe(0);
    expect((await handshake()).status).toBe(200);
  });

  test('an Engine.IO handshake error releases reservations before a socket exists', async () => {
    const generateId = io.engine.generateId;
    io.engine.generateId = () => {
      throw new Error('simulated handshake failure');
    };
    for (let index = 0; index < 27; index++) {
      expect((await handshake()).status).toBe(400);
    }
    io.engine.generateId = generateId;
    expect((await handshake()).status).toBe(200);
  });

  test('different clients behind the trusted proxy each receive a full quota', async () => {
    const first = await Promise.all(Array.from({ length: 26 }, () => handshake('203.0.113.10')));
    expect(first.filter((result) => result.status === 200)).toHaveLength(25);
    expect(first.filter((result) => result.status === 403)).toHaveLength(1);
    const second = await Promise.all(Array.from({ length: 25 }, () => handshake('203.0.113.11')));
    expect(second.every((result) => result.status === 200)).toBe(true);
    io.engine.clients[first.find((result) => result.sid).sid].close(true);
    expect((await handshake('203.0.113.10')).status).toBe(200);
    expect((await handshake('203.0.113.10')).status).toBe(403);
  });

  test('normal authenticated disconnect releases exactly one slot', async () => {
    const { sid } = await handshake();
    expect(await authenticate(sid, { token: 'test-token' })).toContain('40');
    const socket = [...io.sockets.sockets.values()][0];
    expect(socket.userId).toBe(7);
    const closed = new Promise((resolve) => socket.conn.once('close', resolve));
    socket.disconnect(true);
    const response = await fetch(`${baseUrl}&sid=${sid}`);
    await response.text();
    // The first poll receives the namespace disconnect packet; the next
    // receives the Engine.IO close packet and completes graceful shutdown.
    if (io.engine.clients[sid]) {
      const closingResponse = await fetch(`${baseUrl}&sid=${sid}`);
      await closingResponse.text();
    }
    await closed;
    const results = await Promise.all(Array.from({ length: 26 }, () => handshake()));
    expect(results.filter((result) => result.status === 200)).toHaveLength(25);
    expect(results.filter((result) => result.status === 403)).toHaveLength(1);
  });
});
