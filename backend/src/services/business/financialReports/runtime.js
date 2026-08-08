/**
 * Shared runtime deps for FinancialReportsService mixins.
 */
const db = require('../../../config/db');
const { logger } = require('../../../utils/logger');
const { accountingConfig } = require('../../../config/accountingConfig');
const { toLocalDateString } = require('../../../utils/dateUtils');
const { financeConfig } = require('../../../config/financeConfig');

module.exports = {
  db,
  logger,
  accountingConfig,
  toLocalDateString,
  financeConfig,
};
