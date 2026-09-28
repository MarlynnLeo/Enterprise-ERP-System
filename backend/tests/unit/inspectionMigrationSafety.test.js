const importPlan = require('../../migrations/20260927000012_import_aql_25_sampling_plan');
const styles = require('../../migrations/20260928000001_consolidate_inspection_print_styles');

test('imports AQL 2.5 without deleting historical IDs or changing other AQL levels', async () => {
  const rows = [
    { id: 1, code: 'AQL-1', aql_level: 1, status: 'active', batch_min: 1, batch_max: 10000 },
    { id: 2, code: 'OLD-2.5', aql_level: 2.5, status: 'active', batch_min: 1, batch_max: 10000 },
    { id: 3, code: 'GB2828-2.5-A', aql_level: 2.5, status: 'active', batch_min: 2, batch_max: 8 },
  ];
  const originalOtherLevel = { ...rows[0] };
  const knex = jest.fn(() => {
    const predicates = [];
    let pending = [];
    const query = {
      where(key, operator, value) {
        if (typeof key === 'object') {
          predicates.push((row) =>
            Object.entries(key).every(([field, expected]) => row[field] === expected)
          );
        } else {
          predicates.push((row) => (operator === '<=' ? row[key] <= value : row[key] >= value));
        }
        return query;
      },
      whereNotIn(key, values) {
        predicates.push((row) => !values.includes(row[key]));
        return query;
      },
      async update(data) {
        rows
          .filter((row) => predicates.every((test) => test(row)))
          .forEach((row) => Object.assign(row, data));
      },
      insert(data) {
        pending = data;
        return query;
      },
      onConflict(key) {
        return {
          async merge(fields) {
            for (const incoming of pending) {
              const existing = rows.find((row) => row[key] === incoming[key]);
              if (existing)
                fields.forEach((field) => {
                  existing[field] = incoming[field];
                });
              else rows.push({ id: rows.length + 1, ...incoming });
            }
          },
        };
      },
    };
    return query;
  });
  knex.schema = { hasTable: jest.fn(async () => true) };
  knex.fn = { now: () => new Date(0) };
  knex.transaction = async (callback) => callback(knex);

  await importPlan.up(knex);
  expect(rows[0]).toEqual(originalOtherLevel);
  expect(rows.find((row) => row.id === 2)).toMatchObject({ code: 'OLD-2.5', status: 'inactive' });
  expect(rows.find((row) => row.code === 'GB2828-2.5-A').id).toBe(3);
  expect(rows.filter((row) => row.aql_level === 2.5 && row.status === 'active')).toHaveLength(15);
  await importPlan.up(knex);
  expect(rows).toHaveLength(17);
  await importPlan.down(knex);
  expect(rows).toHaveLength(17);
});

test('user signature migrations never infer identity or overwrite bindings', async () => {
  const knex = jest.fn(() => {
    throw new Error('User data must not be changed');
  });
  knex.schema = { hasTable: async () => true, hasColumn: async () => true };
  const migrations = [
    require('../../migrations/20260927000009_add_signature_code_to_users'),
    require('../../migrations/20260927000010_set_chenxianping_signature_code'),
  ];
  for (const migration of migrations) {
    await migration.up(knex);
    await migration.down(knex);
  }
  expect(knex).not.toHaveBeenCalled();
});

test('consolidates the old style cascade and keeps ordinary names out of the signature font', () => {
  const content = `<html><head><style>.custom { color: red; }</style>
    <style id="incoming-inspection-item-font-size">.items td { font-size: 22pt !important; }</style>
    <style id="incoming-inspection-footer-font-size">.signature * { font-size: inherit !important; }</style>
    <style id="incoming-inspection-signature-font">.signature-handwritten { font-size: 24pt; }</style>
    </head><body><span class="signature-handwritten">{{inspector_name}}</span>
    <span class="signature-handwritten">{{inspector_signature}}</span></body></html>`;
  const result = styles.transformContent(content, 'screw_inspection');
  expect(result).toContain('<style>.custom { color: red; }</style>');
  expect(result).not.toContain('22pt');
  expect(result).not.toContain('id="incoming-inspection-footer-font-size"');
  expect(result).toContain('class="signature-name">{{inspector_name}}');
  expect(result).toContain('class="signature-handwritten">{{inspector_signature}}');
  expect(result.match(/id="incoming-inspection-layout"/g)).toHaveLength(1);
  expect(styles.transformContent(result, 'screw_inspection')).toBe(result);
});

test('preserves custom templates that do not contain the migrated style markers', () => {
  const content =
    '<html><head><style>td { background: blue; }</style></head><body>Custom</body></html>';
  expect(styles.transformContent(content, 'incoming_inspection')).toBe(content);
});
