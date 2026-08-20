const migration = require('../../migrations/20260813000001_ensure_org_roles_and_principals');

function createKnexDouble({ laterMigrationApplied }) {
  const calls = [];

  function knex(table) {
    const state = { table, where: null };
    const builder = {
      where(...args) {
        state.where = args;
        return builder;
      },
      orderBy() {
        return builder;
      },
      first() {
        calls.push({ operation: 'first', ...state });
        if (table === 'knex_migrations') {
          return Promise.resolve(laterMigrationApplied ? { id: 1 } : undefined);
        }
        if (table === 'roles' || table === 'users') {
          return Promise.resolve({ id: 1 });
        }
        return Promise.resolve(undefined);
      },
      update() {
        calls.push({ operation: 'update', ...state });
        return Promise.resolve(1);
      },
      insert() {
        calls.push({ operation: 'insert', ...state });
        return Promise.resolve([1]);
      },
    };
    return builder;
  }

  knex.schema = {
    hasTable: jest.fn().mockResolvedValue(true),
  };
  knex.fn = {
    now: jest.fn(() => 'NOW'),
  };

  return { knex, calls };
}

describe('late principal bootstrap migration', () => {
  test('does not mutate principals after the organisational chain has already advanced', async () => {
    const { knex, calls } = createKnexDouble({ laterMigrationApplied: true });
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await migration.up(knex);

    expect(knex.schema.hasTable).toHaveBeenCalledWith('knex_migrations');
    expect(calls).toEqual([
      expect.objectContaining({
        operation: 'first',
        table: 'knex_migrations',
        where: ['name', '>=', '20260814000009_add_quality_inspector_org.js'],
      }),
    ]);
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });

  test('still repairs principals for a fresh or pre-organisation database', async () => {
    const { knex, calls } = createKnexDouble({ laterMigrationApplied: false });

    await migration.up(knex);

    expect(calls.some((call) => call.table === 'roles' && call.operation === 'update')).toBe(true);
    expect(calls.some((call) => call.table === 'users' && call.operation === 'first')).toBe(true);
  });
});
