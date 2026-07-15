const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });

process.env.NODE_ENV = 'test';
process.env.DISABLE_CRON = 'true';
process.env.ENABLE_RATE_LIMIT = 'false';
process.env.REDIS_ENABLED = 'false';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'erp_test';
process.env.TEST_ADMIN_USERNAME = process.env.TEST_ADMIN_USERNAME || 'admin';
process.env.TEST_ADMIN_PASSWORD =
  process.env.TEST_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || '123456';

if (!/(test|uat)/i.test(process.env.DB_NAME)) {
  throw new Error(`Tests require an isolated test/UAT database, received: ${process.env.DB_NAME}`);
}
