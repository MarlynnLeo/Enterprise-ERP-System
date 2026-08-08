/**
 * FinancialReportsService — facade
 * Implementation split into ./financialReports/*Methods.js
 * Public API unchanged (Object.assign mixins).
 *
 * Modules:
 * - balanceMethods: account balances at date / period filters
 * - balanceSheetMethods: balance sheet generation & categorization
 * - incomeMethods: income statement & period amounts
 * - cashFlowMethods: cash flow statement & cash balances
 * - formatMethods: validation, formatting, empty results, account groups
 */

const balanceMethods = require('./financialReports/balanceMethods');
const balanceSheetMethods = require('./financialReports/balanceSheetMethods');
const incomeMethods = require('./financialReports/incomeMethods');
const cashFlowMethods = require('./financialReports/cashFlowMethods');
const formatMethods = require('./financialReports/formatMethods');

/**
 * 企业级财务报表服务
 * 提供符合会计准则的标准财务报表功能
 */
class FinancialReportsService {}

Object.assign(
  FinancialReportsService,
  balanceMethods,
  balanceSheetMethods,
  incomeMethods,
  cashFlowMethods,
  formatMethods
);

module.exports = FinancialReportsService;
