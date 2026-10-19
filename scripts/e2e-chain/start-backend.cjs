'use strict';
const path = require('node:path');
const { DATABASE } = require('./config.cjs');
Object.assign(process.env, {
  DB_NAME:DATABASE, NODE_ENV:'development', PORT:'3510', API_HOST:'127.0.0.1',
  PUBLIC_API_BASE_URL:'http://127.0.0.1:3510', AUTO_MIGRATE:'true',
  DISABLE_CRON:'true', DISABLE_DLQ_RETRY:'true', REDIS_ENABLED:'false', ENABLE_RATE_LIMIT:'false',
  DINGTALK_APP_KEY:'', DINGTALK_APP_SECRET:'', DINGTALK_API_TOKEN:'',
  WEATHER_ENABLE_WTTR_FALLBACK:'false',
});
process.chdir(path.resolve(__dirname,'../../backend'));
require('../../backend/src/index.js');
