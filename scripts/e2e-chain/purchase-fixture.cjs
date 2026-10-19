'use strict';

// Only adds the audit reviewer's procurement role in the isolated test company.
// Existing role-based approval templates and separation-of-duties stay active.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DATABASE, dbConfig, requireBackend, evidenceDir } = require('./config.cjs');

async function main() {
  const fixture = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'fixture.private.json'), 'utf8'));
  assert.equal(fixture.database, DATABASE);
  const db = await requireBackend('mysql2/promise').createConnection(dbConfig);
  try {
    const [[identity]] = await db.query('SELECT DATABASE() AS db');
    assert.equal(identity.db, DATABASE);
    const [[actor]] = await db.query('SELECT id,username FROM users WHERE id=?', [fixture.actors.reviewer.id]);
    assert.equal(actor.username, fixture.actors.reviewer.username);
    const [[role]] = await db.query("SELECT id,code FROM roles WHERE code='purchase_manager' AND status=1");
    assert.ok(role, '采购管理员角色必须存在');
    const [[existing]] = await db.query('SELECT id FROM user_roles WHERE user_id=? AND role_id=?', [actor.id, role.id]);
    if (!existing) await db.query('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)', [actor.id, role.id]);
    const result = { database: DATABASE, reviewerId: actor.id, role: role.code, roleId: role.id };
    fs.writeFileSync(path.join(evidenceDir, 'purchase-fixture.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await db.end(); }
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
