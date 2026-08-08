/**
 * Shared runtime deps for CostAccountingService mixins.
 * Keeps a single require graph so helpers/actual/wip/etc. share the same instances.
 */

const { logger } = require('../../../utils/logger');
const db = require('../../../config/db');
const BusinessError = require('../../../utils/BusinessError');
const globalConfigManager = require('../../../config/globalConfig');
const businessConfig = require('../../../config/businessConfig');
const { currentDateString, toLocalDateString } = require('../../../utils/dateUtils');
const { resolveActorUserId } = require('../../../utils/userUtils');
const GLService = require('../../finance/GLService');
const InventoryService = require('../../InventoryService');
const Precision = require('../../../utils/precision');
const { financeConfig } = require('../../../config/financeConfig');
const { DOCUMENT_TYPES } = require('../../../constants/financeConstants');

module.exports = {
  logger,
  db,
  BusinessError,
  globalConfigManager,
  businessConfig,
  currentDateString,
  toLocalDateString,
  resolveActorUserId,
  GLService,
  InventoryService,
  Precision,
  financeConfig,
  DOCUMENT_TYPES,
};
