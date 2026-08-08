/**
 * PeriodEndService — facade
 * Implementation split into ./periodEnd/*Methods.js
 * Public API unchanged (Object.assign mixins).
 *
 * Modules:
 * - helpersMethods: money/date/account helpers, entry numbers
 * - controlsMethods: closing controls, integrity, bank recon, unposted
 * - closingMethods: preview/close/reopen/lock/P&L transfer
 * - yearEndMethods: year-end transfer & status
 */

const helpersMethods = require('./periodEnd/helpersMethods');
const controlsMethods = require('./periodEnd/controlsMethods');
const closingMethods = require('./periodEnd/closingMethods');
const yearEndMethods = require('./periodEnd/yearEndMethods');

/**
 * 期末处理服务
 * 处理期末结账、结转等功能
 */
class PeriodEndService {}

Object.assign(
  PeriodEndService,
  helpersMethods,
  controlsMethods,
  closingMethods,
  yearEndMethods
);

module.exports = PeriodEndService;
