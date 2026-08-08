/**
 * Shared runtime deps for PeriodEndService mixins.
 */
const { logger } = require('../../../utils/logger');
const db = require('../../../config/db');
const financeModel = require('../../../models/finance');
const { DOCUMENT_TYPE_MAPPING, TAX_RELATED_DOCUMENT_TYPES, taxRelatedDocumentTypeMatchList, } = require('../../../constants/financeConstants');
const { accountingConfig } = require('../../../config/accountingConfig');
const CostClosingService = require('../CostClosingService');
const { resolveActorUserId } = require('../../../utils/userUtils');

module.exports = {
  logger,
  db,
  financeModel,
  DOCUMENT_TYPE_MAPPING,
  TAX_RELATED_DOCUMENT_TYPES,
  taxRelatedDocumentTypeMatchList,
  accountingConfig,
  CostClosingService,
  resolveActorUserId,
};
