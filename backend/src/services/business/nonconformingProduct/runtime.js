/**
 * Shared runtime deps for NonconformingProductService mixins.
 */

const NonconformingProduct = require('../../../models/nonconformingProduct');
const { logger } = require('../../../utils/logger');
const businessConfig = require('../../../config/businessConfig');
const { firstValidUserId } = require('../../../utils/userUtils');
const QualityIntegrationService = require('../QualityIntegrationService');
const NotificationService = require('../../NotificationService');
const { resolveActorLabel, resolveActorUserId } = require('../../../utils/userUtils');
const {
  STATUS,
  VALID_DISPOSITIONS,
  SUPPLIER_REQUIRED_DISPOSITIONS,
  normalizeNumber,
  validateDispositionPayload,
  AUTO_DISPOSITION_RULES,
  AUTO_DISPOSITION_CONFIG,
} = require('./shared');

module.exports = {
  NonconformingProduct,
  logger,
  businessConfig,
  firstValidUserId,
  QualityIntegrationService,
  NotificationService,
  resolveActorLabel,
  resolveActorUserId,
  STATUS,
  VALID_DISPOSITIONS,
  SUPPLIER_REQUIRED_DISPOSITIONS,
  normalizeNumber,
  validateDispositionPayload,
  AUTO_DISPOSITION_RULES,
  AUTO_DISPOSITION_CONFIG,
};
