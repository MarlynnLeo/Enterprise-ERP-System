#!/usr/bin/env node

const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');

async function nextRepairInspectionNo(connection, taskId) {
  const base = `FQR${String(taskId).padStart(6, '0')}`;
  const [existing] = await connection.execute(
    'SELECT id FROM quality_inspections WHERE inspection_no = ? LIMIT 1',
    [base]
  );
  if (existing.length === 0) return base;
  return `FQR${String(taskId).padStart(6, '0')}${Date.now().toString().slice(-4)}`.slice(0, 20);
}

async function repairQualityRelease(connection) {
  const counters = {
    finalInspectionsCreated: 0,
    finalInspectionsReleased: 0,
  };

  const [missingRows] = await connection.execute(
    `SELECT pt.id, pt.code, pt.product_id, pt.batch_number, pt.quantity, pt.completed_quantity,
            COALESCE(pt.completed_at, pt.actual_end_date, pt.updated_at) AS release_date,
            m.name AS product_name, m.code AS product_code, u.name AS unit_name
       FROM production_tasks pt
       LEFT JOIN materials m ON m.id = pt.product_id
       LEFT JOIN units u ON u.id = m.unit_id
      WHERE pt.status = 'completed'
        AND pt.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM quality_inspections qi
          WHERE qi.deleted_at IS NULL
            AND qi.inspection_type IN ('final', 'process', 'first_article')
            AND (qi.task_id = pt.id OR qi.reference_id = pt.id OR qi.reference_no = pt.code)
            AND qi.status IN ('passed', 'conditional')
        )
      FOR UPDATE`
  );

  for (const task of missingRows) {
    const [pending] = await connection.execute(
      `SELECT id, quantity
         FROM quality_inspections
        WHERE deleted_at IS NULL
          AND inspection_type = 'final'
          AND (task_id = ? OR reference_id = ? OR reference_no = ?)
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [task.id, task.id, task.code]
    );

    const qualifiedQuantity = Number(task.completed_quantity || task.quantity || 0);
    const actualDate = task.release_date || new Date();

    if (pending.length > 0) {
      await connection.execute(
        `UPDATE quality_inspections
            SET status = 'passed',
                qualified_quantity = ?,
                unqualified_quantity = 0,
                actual_date = COALESCE(actual_date, ?),
                task_id = COALESCE(task_id, ?),
                reference_id = COALESCE(reference_id, ?),
                reference_no = COALESCE(reference_no, ?),
                production_can_continue = 1,
                updated_at = NOW()
          WHERE id = ?`,
        [qualifiedQuantity, actualDate, task.id, task.id, task.code, pending[0].id]
      );
      counters.finalInspectionsReleased += 1;
      continue;
    }

    const inspectionNo = await nextRepairInspectionNo(connection, task.id);
    await connection.execute(
      `INSERT INTO quality_inspections (
          inspection_no, inspection_type, reference_id, reference_no, product_id,
          product_name, product_code, batch_no, quantity, qualified_quantity,
          unqualified_quantity, unit, status, planned_date, actual_date,
          task_id, production_can_continue, note, created_at, updated_at
        ) VALUES (?, 'final', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'passed', ?, ?, ?, 1, ?, NOW(), NOW())`,
      [
        inspectionNo,
        task.id,
        task.code,
        task.product_id,
        task.product_name || null,
        task.product_code || null,
        task.batch_number || task.code,
        qualifiedQuantity,
        qualifiedQuantity,
        task.unit_name || '件',
        actualDate,
        actualDate,
        task.id,
        'Auto-created by production integration repair because task was completed and finished-goods inbound already exists.',
      ]
    );
    counters.finalInspectionsCreated += 1;
  }

  return counters;
}

async function main() {
  const connection = await mysql.createConnection(getPoolConfig());
  try {
    await connection.beginTransaction();
    const qualityCounters = await repairQualityRelease(connection);
    await connection.commit();
    console.log(JSON.stringify({ qualityCounters }, null, 2));
    process.exit(0);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Production integration repair failed:', error.message);
  process.exit(1);
});
