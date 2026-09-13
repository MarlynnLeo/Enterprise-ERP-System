'use strict';

/**
 * Repair missing sub-BOM references in the A3 / NG0001 import without resaving BOMs.
 * Preview: node scripts/repair-bom-sub-references.js
 * Apply:   node scripts/repair-bom-sub-references.js --apply --expected-rows=<preview count>
 * Originals are backed up before any write. Approval, quantities and timestamps stay unchanged.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const IMPORT_REMARK = 'NG0001导入BOM';

function addEdge(graph, from, to) {
  if (!graph.has(from)) graph.set(from, new Set());
  graph.get(from).add(to);
}

function hasPath(graph, start, target) {
  const pending = [start];
  const visited = new Set();
  while (pending.length) {
    const id = pending.pop();
    if (id === target) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...(graph.get(id) || []));
  }
  return false;
}

function planRepair(masters, details) {
  const availableMasters = masters.filter(master => !master.deleted_at);
  const masterById = new Map(availableMasters.map(master => [Number(master.id), master]));
  const approvedByProduct = new Map();
  // Same precedence as BomExplosionService.getLatestApprovedBomMap, including approved history.
  const sortedMasters = [...availableMasters].sort((a, b) =>
    String(b.approved_at || '').localeCompare(String(a.approved_at || '')) || Number(b.id) - Number(a.id)
  );
  for (const master of sortedMasters) {
    const productId = Number(master.product_id);
    if (master.approved_by != null && !approvedByProduct.has(productId)) {
      approvedByProduct.set(productId, master);
    }
  }

  const bomsWithDetails = new Set(details.map(detail => Number(detail.bom_id)));
  const inlineParents = new Set(details.filter(detail => Number(detail.parent_id) > 0)
    .map(detail => `${detail.bom_id}:${detail.parent_id}`));
  const graph = new Map();
  for (const detail of details) {
    if (Number(detail.has_sub_bom) && masterById.has(Number(detail.ref_bom_id))) {
      addEdge(graph, Number(detail.bom_id), Number(detail.ref_bom_id));
    }
  }

  const candidates = [];
  const skipped = [];
  for (const detail of details) {
    const master = masterById.get(Number(detail.bom_id));
    if (!master || Number(master.status) === 2 || master.remark !== IMPORT_REMARK) continue;
    // Preserve every explicit version reference, including manually maintained ones.
    if (Number(detail.ref_bom_id) > 0) continue;
    const child = approvedByProduct.get(Number(detail.material_id));
    if (!child) continue;
    const repair = { id: Number(detail.id), bomId: Number(detail.bom_id), refBomId: Number(child.id) };
    if (inlineParents.has(`${detail.bom_id}:${detail.id}`)) {
      skipped.push({ ...repair, reason: 'inline_children' });
    } else if (!bomsWithDetails.has(repair.refBomId)) {
      skipped.push({ ...repair, reason: 'empty_child_bom' });
    } else {
      candidates.push(repair);
      addEdge(graph, repair.bomId, repair.refBomId);
    }
  }

  // Check the combined graph, so a cycle formed by several new references is also rejected.
  const repairs = candidates.filter(repair => {
    if (!hasPath(graph, repair.refBomId, repair.bomId)) return true;
    skipped.push({ ...repair, reason: 'circular_reference' });
    return false;
  });
  const parentGraph = new Map();
  for (const detail of details) {
    if (Number(detail.has_sub_bom) && Number(detail.ref_bom_id) > 0) {
      addEdge(parentGraph, Number(detail.ref_bom_id), Number(detail.bom_id));
    }
  }
  repairs.forEach(repair => addEdge(parentGraph, repair.refBomId, repair.bomId));
  const affectedBomIds = new Set(repairs.map(repair => repair.bomId));
  const cacheBomIds = new Set(affectedBomIds);
  const pending = [...affectedBomIds];
  while (pending.length) {
    for (const parent of parentGraph.get(pending.pop()) || []) {
      if (!cacheBomIds.has(parent)) {
        cacheBomIds.add(parent);
        pending.push(parent);
      }
    }
  }

  return {
    repairs,
    skipped,
    affectedBomIds: [...affectedBomIds].sort((a, b) => a - b),
    cacheBomIds: [...cacheBomIds].sort((a, b) => a - b),
  };
}

function summarize(plan) {
  const skippedReasons = {};
  for (const item of plan.skipped) skippedReasons[item.reason] = (skippedReasons[item.reason] || 0) + 1;
  return {
    source: IMPORT_REMARK,
    repairRows: plan.repairs.length,
    affectedBoms: plan.affectedBomIds.length,
    cacheBoms: plan.cacheBomIds.length,
    skippedRows: plan.skipped.length,
    skippedReasons,
  };
}

async function runRepair(connection, { apply = false, expectedRows, backupDirectory } = {}) {
  let transactionStarted = false;
  try {
    if (apply) {
      assert.ok(Number.isInteger(expectedRows) && expectedRows > 0, '--apply requires --expected-rows from the preview');
      await connection.beginTransaction();
      transactionStarted = true;
    }
    // BOM writes lock their master first. Hold those locks briefly during the repair.
    const [masters] = await connection.query(
      `SELECT * FROM bom_masters WHERE deleted_at IS NULL ORDER BY id${apply ? ' FOR UPDATE' : ''}`
    );
    const [details] = await connection.query(
      'SELECT id, bom_id, material_id, parent_id, has_sub_bom, ref_bom_id FROM bom_details ORDER BY id'
    );
    const plan = planRepair(masters, details);
    const summary = summarize(plan);
    if (!apply) return { mode: 'preview', ...summary, skipped: plan.skipped };
    assert.equal(plan.repairs.length, expectedRows, 'Repair count changed; run the preview again');

    const detailIds = plan.repairs.map(repair => repair.id);
    const [originalDetails] = await connection.query(
      'SELECT * FROM bom_details WHERE id IN (?) ORDER BY id FOR UPDATE', [detailIds]
    );
    assert.equal(originalDetails.length, detailIds.length);
    assert.ok(originalDetails.every(detail => !Number(detail.ref_bom_id)), 'A reference changed during planning');
    const originalMasters = masters.filter(master => plan.affectedBomIds.includes(Number(master.id)));
    const [cacheRows] = await connection.query(
      'SELECT * FROM bom_explosion_cache WHERE bom_id IN (?) FOR UPDATE', [plan.cacheBomIds]
    );
    const [[identity]] = await connection.query('SELECT DATABASE() AS database_name, @@hostname AS server_name');
    const directory = backupDirectory || path.resolve(__dirname, '../backups/bom-sub-references');
    await fs.mkdir(directory, { recursive: true });
    const backupPath = path.join(directory, `bom-sub-references-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await fs.writeFile(backupPath, JSON.stringify({
      createdAt: new Date().toISOString(), identity, summary, repairs: plan.repairs, skipped: plan.skipped,
      masters: originalMasters, details: originalDetails, cacheRows,
    }, null, 2), { flag: 'wx', mode: 0o600 });

    for (let offset = 0; offset < plan.repairs.length; offset += 200) {
      const batch = plan.repairs.slice(offset, offset + 200);
      const cases = batch.map(() => 'WHEN ? THEN ?').join(' ');
      const params = batch.flatMap(repair => [repair.id, repair.refBomId]);
      params.push(batch.map(repair => repair.id));
      const [result] = await connection.query(
        `UPDATE bom_details SET has_sub_bom = 1, ref_bom_id = CASE id ${cases} END,
           updated_at = updated_at WHERE id IN (?) AND COALESCE(ref_bom_id, 0) = 0`, params
      );
      assert.equal(result.affectedRows, batch.length, 'Concurrent BOM change; rolling back');
    }
    const [cacheResult] = await connection.query(
      'DELETE FROM bom_explosion_cache WHERE bom_id IN (?)', [plan.cacheBomIds]
    );
    const [updatedDetails] = await connection.query(
      'SELECT * FROM bom_details WHERE id IN (?) ORDER BY id', [detailIds]
    );
    const referenceById = new Map(plan.repairs.map(repair => [repair.id, repair.refBomId]));
    assert.deepEqual(updatedDetails, originalDetails.map(detail => ({
      ...detail, has_sub_bom: 1, ref_bom_id: referenceById.get(Number(detail.id)),
    })), 'A field other than the two reference fields changed');
    const [updatedMasters] = await connection.query(
      'SELECT * FROM bom_masters WHERE id IN (?) ORDER BY id', [plan.affectedBomIds]
    );
    assert.deepEqual(updatedMasters, originalMasters, 'BOM approval or header data changed');

    await connection.commit();
    transactionStarted = false;
    return { mode: 'applied', ...summary, cacheRowsCleared: cacheResult.affectedRows, backupPath };
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  }
}

async function main(args = process.argv.slice(2)) {
  for (const argument of args) {
    if (argument !== '--apply' && !/^--expected-rows=\d+$/.test(argument)) {
      throw new Error(`Unsupported argument: ${argument}`);
    }
  }
  const { getMysqlConnectionOptions } = require('./databaseScriptConfig');
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection(getMysqlConnectionOptions({ dateStrings: true, connectTimeout: 10000 }));
  try {
    const expectedArgument = args.find(argument => argument.startsWith('--expected-rows='));
    const result = await runRepair(connection, {
      apply: args.includes('--apply'),
      expectedRows: expectedArgument ? Number(expectedArgument.split('=')[1]) : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await connection.end();
  }
}

module.exports = { planRepair, runRepair, summarize };
if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
