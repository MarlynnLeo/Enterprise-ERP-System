/* global test, expect */
const { DatabaseSync } = require('node:sqlite');
const ProductionReturnService = require('../../src/services/business/ProductionReturnService');

// Exercise the actual source joins against an isolated relational fixture.
// Only MySQL collation/CONCAT syntax is adapted; no application DB is imported.
const sqliteSql = (sql) =>
  sql
    .replaceAll('COLLATE utf8mb4_unicode_ci', 'COLLATE NOCASE')
    .replaceAll("CONCAT(o.outbound_no, '-补发')", "(o.outbound_no || '-补发')");

test.each([
  ['pending', 5, 5, 1, 'OUT-1-Sabc'],
  ['approved', 5, 5, 1, 'OUT-1-Sabc'],
  ['legacy-ledger', 5, 5, null, 'OUT-1-补发'],
  ['pending', 5, 5, null, 'OUT-1-补发'],
  ['pending', 0, 10, 1, 'OUT-1-Sabc'],
])(
  '%s supplement contributes to the task return capacity',
  async (status, original, supplement, sourceId, sourceNo) => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(`
      CREATE TABLE inventory_outbound (id, outbound_no, reference_type, reference_id, production_task_id, status, deleted_at);
      CREATE TABLE inventory_ledger (material_id, location_id, batch_number, quantity, unit_cost, reference_type, reference_no, posting_document_id);
      CREATE TABLE inventory_posting_documents (id, source_type, source_id, source_no, posting_kind, finance_status);
      CREATE TABLE inventory_posting_lines (posting_document_id, material_id, location_id, batch_number, signed_quantity, unit_cost);
      CREATE TABLE materials (id, code, name, specs, unit_id);
      CREATE TABLE units (id, name);
      CREATE TABLE locations (id, name);
      INSERT INTO inventory_outbound VALUES (1, 'OUT-1', 'production_task', 7, 7, 'completed', NULL), (2, 'OUT-2', 'production_task', 8, 8, 'completed', NULL);
      INSERT INTO materials VALUES (3, 'M3', '物料', '', 1);
      INSERT INTO units VALUES (1, '个');
      INSERT INTO locations VALUES (2, '原领料仓库');
      INSERT INTO inventory_posting_documents VALUES (99, 'outbound_supplement', 2, 'OUT-2-Sabc', 'movement', 'pending');
      INSERT INTO inventory_posting_lines VALUES (99, 3, 2, 'B1', -99, 8);
    `);
      if (original)
        database
          .prepare('INSERT INTO inventory_ledger VALUES (3, 2, ?, ?, 8, ?, ?, NULL)')
          .run('B1', -original, 'outbound', 'OUT-1');
      if (status !== 'legacy-ledger') {
        database
          .prepare('INSERT INTO inventory_posting_documents VALUES (11, ?, ?, ?, ?, ?)')
          .run('outbound_supplement', sourceId, sourceNo, 'movement', status);
        database
          .prepare('INSERT INTO inventory_posting_lines VALUES (11, 3, 2, ?, ?, 8)')
          .run('B1', -supplement);
      }
      if (status !== 'pending')
        database
          .prepare('INSERT INTO inventory_ledger VALUES (3, 2, ?, ?, 8, ?, ?, ?)')
          .run(
            'B1',
            -supplement,
            'outbound_supplement',
            sourceNo,
            status === 'approved' ? 11 : null
          );
      const connection = {
        execute: async (sql, values) => {
          if (/FROM inventory_posting_documents reversal/.test(sql)) return [[]];
          if (/FROM production_tasks t/.test(sql)) return [[{ id: 7 }]];
          if (/FROM inventory_inbound i/.test(sql)) return [[]];
          return [database.prepare(sqliteSql(sql)).all(...values)];
        },
      };
      const result = await ProductionReturnService.getAvailableRecords(connection, 7);
      expect(result.records).toHaveLength(1);
      expect(result.records[0]).toMatchObject({
        material_id: 3,
        default_location_id: 2,
        batch_number: 'B1',
        max_returnable_quantity: 10,
        unit_cost: 8,
      });
    } finally {
      database.close();
    }
  }
);
