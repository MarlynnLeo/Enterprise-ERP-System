const migration = require('../../migrations/20260927000005_preserve_inspection_sample_quantity');

test('adds an empty sampling field and fixes only misleading print fallbacks, idempotently', async () => {
  let columnExists = false;
  const row = {
    id: 1,
    content:
      '<td>{{default sample_quantity quantity}}</td><p>{{default sampling_plan "GB/T 2828.1 一般检验水平 II"}}</p><p>客户指定抽样方案</p>',
  };
  const writes = [];
  const column = { nullable: jest.fn(), comment: jest.fn() };
  column.nullable.mockReturnValue(column);
  const table = { decimal: jest.fn(() => column) };
  const knex = jest.fn((tableName) => {
    expect(tableName).toBe('print_templates');
    const query = {
      select: jest.fn(() => query),
      where: jest.fn(() => query),
      whereNull: jest.fn(async () => [row]),
      update: jest.fn(async (values) => {
        writes.push(values);
        Object.assign(row, values);
      }),
    };
    return query;
  });
  knex.schema = {
    hasTable: jest.fn(async () => true),
    hasColumn: jest.fn(async () => columnExists),
    alterTable: jest.fn(async (name, callback) => {
      expect(name).toBe('quality_inspections');
      callback(table);
      columnExists = true;
    }),
  };
  knex.fn = { now: () => 'NOW' };

  await migration.up(knex);
  await migration.up(knex);

  expect(table.decimal).toHaveBeenCalledWith('sample_quantity', 18, 4);
  expect(column.nullable).toHaveBeenCalledTimes(1);
  expect(knex.schema.alterTable).toHaveBeenCalledTimes(1);
  expect(writes).toHaveLength(1);
  expect(row.content).toContain('{{default sample_quantity "未记录"}}');
  expect(row.content).toContain('{{default sampling_plan "待配置"}}');
  expect(row.content).toContain('客户指定抽样方案');
});
