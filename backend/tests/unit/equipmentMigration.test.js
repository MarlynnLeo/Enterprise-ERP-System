/* global describe, expect, jest, test */

const migration = require('../../migrations/20260918000001_align_equipment_runtime_contracts');

function makeKnex(unknownMaintenance = false) {
  const columns = new Map([
    ['equipment', new Set(['status'])],
    ['equipment_status_history', new Set(['previous_status', 'current_status'])],
    ['equipment_maintenance', new Set(['status', 'maintenance_person'])],
    ['equipment_inspection', new Set(['result'])],
  ]);
  const knex = jest.fn((name) => {
    const builder = {
      distinct: jest.fn().mockReturnThis(), whereNotNull: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(), whereIn: jest.fn().mockReturnThis(),
      whereNotIn: jest.fn().mockResolvedValue(unknownMaintenance && name === 'equipment_maintenance' ? [{ status: 'unknown' }] : []),
      update: jest.fn().mockResolvedValue(1),
    };
    return builder;
  });
  knex.raw = jest.fn().mockResolvedValue([]);
  knex.schema = {
    hasTable: jest.fn(async (name) => columns.has(name)),
    hasColumn: jest.fn(async (name, column) => columns.get(name)?.has(column)),
    alterTable: jest.fn(async (name, change) => {
      const add = (column) => {
        columns.get(name).add(column);
        return { nullable: jest.fn() };
      };
      change({ string: add, text: add, date: add });
    }),
  };
  return { knex, columns };
}

describe('equipment contract forward migration', () => {
  test('rejects unknown maintenance states before any automatically committed DDL', async () => {
    const { knex } = makeKnex(true);
    await expect(migration.up(knex)).rejects.toThrow('Unknown equipment_maintenance.status');
    expect(knex.raw).not.toHaveBeenCalled();
    expect(knex.schema.alterTable).not.toHaveBeenCalled();
  });

  test('adds missing record fields once and retains legacy columns for safe upgrades', async () => {
    const { knex, columns } = makeKnex();
    await migration.up(knex);
    const changes = knex.schema.alterTable.mock.calls.length;
    expect(columns.get('equipment_maintenance')).toEqual(new Set([
      'status', 'maintenance_person', 'maintenance_staff', 'next_maintenance_date', 'remarks',
    ]));
    expect(columns.get('equipment_inspection')).toContain('inspection_result');
    expect(columns.get('equipment_inspection')).toContain('result');
    expect(knex.raw.mock.calls.some(([sql]) => sql.includes('SET maintenance_staff = maintenance_person'))).toBe(true);
    await migration.up(knex);
    expect(knex.schema.alterTable).toHaveBeenCalledTimes(changes);
  });
});
