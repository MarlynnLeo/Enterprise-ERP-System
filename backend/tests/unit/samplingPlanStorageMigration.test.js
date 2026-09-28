const migration = require('../../migrations/20260927000006_harden_sampling_plan_storage');

test('stores new plan snapshots and supports precise AQL without changing historical inspection rows', async () => {
  const textColumn = { nullable: jest.fn(), comment: jest.fn() };
  textColumn.nullable.mockReturnValue(textColumn);
  const decimalColumn = { notNullable: jest.fn(), alter: jest.fn() };
  decimalColumn.notNullable.mockReturnValue(decimalColumn);
  const table = { text: jest.fn(() => textColumn), decimal: jest.fn(() => decimalColumn) };
  const knex = jest.fn();
  knex.schema = {
    hasTable: jest.fn(async () => true),
    hasColumn: jest.fn(async () => false),
    alterTable: jest.fn(async (_name, callback) => callback(table)),
  };
  await migration.up(knex);
  expect(table.text).toHaveBeenCalledWith('sampling_plan');
  expect(table.decimal).toHaveBeenCalledWith('aql_level', 8, 5);
  expect(decimalColumn.alter).toHaveBeenCalledTimes(1);
  expect(knex).not.toHaveBeenCalled();
});
