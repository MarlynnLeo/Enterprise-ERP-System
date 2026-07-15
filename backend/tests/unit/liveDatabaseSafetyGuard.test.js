const { assertSafeLiveDatabase } = require('../../scripts/lib/assert-safe-live-database');

describe('destructive live-flow database safety guard', () => {
  const flag = 'RUN_DESTRUCTIVE_TEST_FLOW';
  const originalFlag = process.env[flag];

  afterEach(() => {
    if (originalFlag === undefined) delete process.env[flag];
    else process.env[flag] = originalFlag;
  });

  test('blocks execution without explicit operator acknowledgement', () => {
    delete process.env[flag];

    expect(() =>
      assertSafeLiveDatabase({
        enableFlag: flag,
        expectedFlag: 'I_UNDERSTAND_THIS_WRITES_DATA',
        scriptName: 'test-flow',
        databaseName: 'erp_test',
        nodeEnv: 'test',
      })
    ).toThrow(flag);
  });

  test('blocks a production database even when the operator flag is set', () => {
    process.env[flag] = 'I_UNDERSTAND_THIS_WRITES_DATA';

    expect(() =>
      assertSafeLiveDatabase({
        enableFlag: flag,
        expectedFlag: 'I_UNDERSTAND_THIS_WRITES_DATA',
        scriptName: 'test-flow',
        databaseName: 'erp_production',
        nodeEnv: 'production',
      })
    ).toThrow(/DB_NAME must contain/);
  });

  test('allows an explicitly acknowledged test database', () => {
    process.env[flag] = 'I_UNDERSTAND_THIS_WRITES_DATA';

    expect(() =>
      assertSafeLiveDatabase({
        enableFlag: flag,
        expectedFlag: 'I_UNDERSTAND_THIS_WRITES_DATA',
        scriptName: 'test-flow',
        databaseName: 'erp_uat',
        nodeEnv: 'test',
      })
    ).not.toThrow();
  });
});
