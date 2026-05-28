const { logger } = require('../utils/logger');
const {
  SENSITIVE_FIELDS,
  desensitizeDataForUser,
  hasPricePermission,
  isSensitiveFieldName,
} = require('../utils/desensitizer');
const { ResponseHandler } = require('../utils/responseHandler');

const PRICE_MUTATION_FIELDS = new Set([
  ...SENSITIVE_FIELDS,
  'cost_pool',
  'costPool',
  'cost_impact',
  'costImpact',
  'estimated_fee',
  'estimatedFee',
  'field_value',
  'fieldValue',
]);
const SENSITIVE_FIELD_DESCRIPTORS = new Set([
  'field',
  'fieldName',
  'field_name',
  'fieldKey',
  'field_key',
  'column',
  'columnName',
  'column_name',
  'key',
]);
const CONTEXTUAL_FIELD_VALUE_KEYS = new Set([
  'value',
  'old_value',
  'oldValue',
  'new_value',
  'newValue',
  'field_value',
  'fieldValue',
]);
const NON_PRICE_MUTATION_FIELDS = new Set([
  'is_included_in_cost',
  'isIncludedInCost',
  'included_in_cost',
  'includedInCost',
]);

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isBlankSensitiveValue(value) {
  return value === null || value === undefined || value === '';
}

function isSensitiveMutationKey(key, hasSensitiveDescriptor = false) {
  if (NON_PRICE_MUTATION_FIELDS.has(key)) {
    return false;
  }

  return (
    PRICE_MUTATION_FIELDS.has(key) ||
    isSensitiveFieldName(key) ||
    (hasSensitiveDescriptor && CONTEXTUAL_FIELD_VALUE_KEYS.has(key))
  );
}

function containsPriceMutation(value) {
  if (!value || typeof value !== 'object') return false;

  if (Array.isArray(value)) {
    return value.some((item) => containsPriceMutation(item));
  }

  const hasSensitiveDescriptor = Object.entries(value).some(([key, childValue]) =>
    SENSITIVE_FIELD_DESCRIPTORS.has(key) && isSensitiveFieldName(childValue)
  );

  return Object.entries(value).some(([key, childValue]) => {
    if (isSensitiveMutationKey(key, hasSensitiveDescriptor)) return true;
    return containsPriceMutation(childValue);
  });
}

function stripBlankSensitiveValues(value) {
  if (!value || typeof value !== 'object') {
    return { hasForbiddenMutation: false, stripped: false };
  }

  if (Array.isArray(value)) {
    return value.reduce(
      (result, item) => {
        const child = stripBlankSensitiveValues(item);
        return {
          hasForbiddenMutation: result.hasForbiddenMutation || child.hasForbiddenMutation,
          stripped: result.stripped || child.stripped,
        };
      },
      { hasForbiddenMutation: false, stripped: false }
    );
  }

  const hasSensitiveDescriptor = Object.entries(value).some(([key, childValue]) =>
    SENSITIVE_FIELD_DESCRIPTORS.has(key) && isSensitiveFieldName(childValue)
  );

  let hasForbiddenMutation = false;
  let stripped = false;

  Object.entries(value).forEach(([key, childValue]) => {
    if (isSensitiveMutationKey(key, hasSensitiveDescriptor)) {
      if (isBlankSensitiveValue(childValue)) {
        delete value[key];
        stripped = true;
        return;
      }

      hasForbiddenMutation = true;
      return;
    }

    const child = stripBlankSensitiveValues(childValue);
    hasForbiddenMutation = hasForbiddenMutation || child.hasForbiddenMutation;
    stripped = stripped || child.stripped;
  });

  return { hasForbiddenMutation, stripped };
}

function desensitizeSensitiveResponse(action = 'view') {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (payload) => {
      Promise.resolve()
        .then(async () => {
          if (!payload || res.headersSent) {
            return originalJson(payload);
          }

          const sanitized = await desensitizeDataForUser(
            payload,
            req.user,
            action,
            req.userPermissions
          );
          return originalJson(sanitized);
        })
        .catch((error) => {
          logger.error('[priceAccessControl] response desensitization failed:', error);
          return originalJson(payload);
        });
      return res;
    };

    next();
  };
}

function requirePriceMutationPermission(action = 'update') {
  return async (req, res, next) => {
    try {
      if (!MUTATING_METHODS.has(req.method)) {
        return next();
      }

      if (!containsPriceMutation(req.body)) {
        return next();
      }

      const allowed = await hasPricePermission(req.user, action, req.userPermissions);
      if (allowed) {
        return next();
      }

      const { hasForbiddenMutation } = stripBlankSensitiveValues(req.body);
      if (!hasForbiddenMutation) {
        return next();
      }

      return ResponseHandler.error(
        res,
        '价格、金额、税率属于内部核心数据，请先分配价格维护权限',
        'PRICE_PERMISSION_REQUIRED',
        403
      );
    } catch (error) {
      logger.error('[priceAccessControl] price mutation permission check failed:', error);
      return ResponseHandler.error(
        res,
        '价格权限检查失败',
        'PRICE_PERMISSION_CHECK_FAILED',
        500,
        error
      );
    }
  };
}

module.exports = {
  containsPriceMutation,
  desensitizeSensitiveResponse,
  requirePriceMutationPermission,
  stripBlankSensitiveValues,
};
