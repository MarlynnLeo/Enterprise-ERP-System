'use strict';

const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

function assertLiveFlowDatabase() {
  const enabled = process.env.RUN_LIVE_UAT === '1'
    || process.env.RUN_DESTRUCTIVE_FINANCE_FLOW === 'I_UNDERSTAND_THIS_WRITES_DATA'
    || process.env.RUN_DESTRUCTIVE_PRODUCTION_FLOW === 'I_UNDERSTAND_THIS_WRITES_DATA';
  assert.equal(process.env.NODE_ENV, 'test', 'Live flow helpers require NODE_ENV=test');
  assert.match(String(process.env.DB_NAME || ''), /(test|uat)/i, 'Live flow helpers require an isolated test/UAT database');
  assert.ok(enabled, 'Live flow helpers require an explicit write-enabled UAT flag');
}

async function createApiClient(app, username, password) {
  assertLiveFlowDatabase();
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ username, password });
  assert.equal(login.status, 200, `Login for ${username} failed: ${JSON.stringify(login.body)}`);
  const csrfResponse = await agent.get('/api/csrf-token');
  assert.equal(csrfResponse.status, 200, 'CSRF token request failed');
  const csrf = csrfResponse.body.csrfToken || csrfResponse.body.token || csrfResponse.body.data?.csrfToken;
  assert.ok(csrf, 'CSRF token is missing');
  const api = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    api[method] = (url, body) => {
      const req = agent[method](url).set('Content-Type', 'application/json');
      if (method !== 'get') req.set('X-CSRF-Token', csrf);
      return body === undefined ? req : req.send(body);
    };
  }
  return api;
}

async function createFinanceActor(app, db, prefix, suffix = 'finance', roleCode = 'finance_manager') {
  assertLiveFlowDatabase();
  const password = process.env.TEST_ADMIN_PASSWORD;
  assert.ok(password, 'TEST_ADMIN_PASSWORD is required for synthetic UAT accounts');
  const username = `${prefix}_${suffix}`;
  const [[role]] = await db.pool.execute('SELECT id FROM roles WHERE code = ? AND status = 1 LIMIT 1', [roleCode]);
  assert.ok(role, `An active ${roleCode} role is required`);
  const hash = await bcrypt.hash(password, 10);
  const connection = await db.pool.getConnection();
  let userId;
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      "INSERT INTO users (username, password, real_name, role, status) VALUES (?, ?, ?, 'user', 1)",
      [username, hash, username]
    );
    userId = Number(result.insertId);
    await connection.execute('INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, NOW())', [userId, role.id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return { id: userId, username, api: await createApiClient(app, username, password) };
}

async function approveInventoryPosting(db, financeApi, sourceNo, { businessApi, postingKind = 'movement' } = {}) {
  assertLiveFlowDatabase();
  assert.ok(sourceNo, 'An explicit source document number is required for finance approval');
  const [documents] = await db.pool.execute(
    `SELECT id, finance_status FROM inventory_posting_documents
      WHERE source_no = ? AND posting_kind = ? AND finance_status = 'pending'
      ORDER BY posting_sequence, id`,
    [sourceNo, postingKind]
  );
  assert.ok(documents.length > 0, `No pending ${postingKind} posting exists for ${sourceNo}`);
  for (const document of documents) {
    const [[before]] = await db.pool.execute('SELECT COUNT(*) AS count FROM inventory_ledger WHERE posting_document_id = ?', [document.id]);
    assert.equal(Number(before.count), 0, 'Pending finance postings must not have formal inventory ledger rows');
    if (businessApi) {
      const sameActor = await businessApi.post(`/api/finance/inventory-postings/${document.id}/approve`).send({});
      assert.equal(sameActor.status, 403, `Business approver must not approve their own inventory posting: ${JSON.stringify(sameActor.body)}`);
    }
    const response = await financeApi.post(`/api/finance/inventory-postings/${document.id}/approve`).send({});
    assert.equal(response.status, 200, `Finance approval for ${sourceNo} failed: ${JSON.stringify(response.body)}`);
    const [[posted]] = await db.pool.execute(
      `SELECT d.finance_status, d.locked, COUNT(l.id) AS ledger_count
       FROM inventory_posting_documents d LEFT JOIN inventory_ledger l ON l.posting_document_id = d.id
       WHERE d.id = ? GROUP BY d.id, d.finance_status, d.locked`,
      [document.id]
    );
    assert.equal(posted.finance_status, 'approved');
    assert.equal(Number(posted.locked), 1);
    assert.ok(Number(posted.ledger_count) > 0, 'Finance approval must create formal inventory ledger rows');
  }
  return documents.map((document) => Number(document.id));
}

module.exports = { createApiClient, createFinanceActor, approveInventoryPosting };
