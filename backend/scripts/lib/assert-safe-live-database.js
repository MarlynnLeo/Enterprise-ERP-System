'use strict';

const SAFE_DATABASE_NAME = /(test|uat)/i;

function assertSafeLiveDatabase({
  enableFlag,
  expectedFlag,
  scriptName,
  databaseName = process.env.DB_NAME,
  nodeEnv = process.env.NODE_ENV,
}) {
  const failures = [];

  if (nodeEnv !== 'test') {
    failures.push(`NODE_ENV must be "test" (received ${nodeEnv || '<empty>'})`);
  }
  if (!SAFE_DATABASE_NAME.test(String(databaseName || ''))) {
    failures.push(`DB_NAME must contain "test" or "uat" (received ${databaseName || '<empty>'})`);
  }
  if (process.env[enableFlag] !== expectedFlag) {
    failures.push(`${enableFlag} must be explicitly set to "${expectedFlag}"`);
  }

  if (failures.length) {
    throw new Error(
      `${scriptName} can write business data and is blocked by the database safety guard:\n- ${failures.join('\n- ')}`
    );
  }
}

module.exports = { assertSafeLiveDatabase };
