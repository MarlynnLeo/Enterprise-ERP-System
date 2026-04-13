/**
 * Validation Helper
 * Simple validation functions for controllers
 */


/**
 * Validate required fields
 */
function validateRequiredFields(data, requiredFields, fieldNames = {}) {
  const missingFields = [];

  for (const field of requiredFields) {
    const value = data[field];
    if (value === undefined || value === null || value === '') {
      const displayName = fieldNames[field] || field;
      missingFields.push(displayName);
    }
  }

  if (missingFields.length > 0) {
    return {
      error: true,
      message: 'Missing required fields: ' + missingFields.join(', '),
      fields: missingFields,
    };
  }

  return null;
}

/**
 * Validate enum value
 */
function validateEnum(value, allowedValues, fieldName = 'field') {
  if (!allowedValues.includes(value)) {
    return {
      error: true,
      message: fieldName + ' invalid value, allowed: ' + allowedValues.join(', '),
      allowedValues,
    };
  }

  return null;
}

/**
 * Validate number range
 */
function validateRange(value, min, max, fieldName = 'field') {
  const num = Number(value);

  if (isNaN(num)) {
    return {
      error: true,
      message: fieldName + ' must be a number',
    };
  }

  if (num < min || num > max) {
    return {
      error: true,
      message: fieldName + ' must be between ' + min + ' and ' + max,
    };
  }

  return null;
}

/**
 * Validate string length
 */
function validateLength(value, minLength, maxLength, fieldName = 'field') {
  if (typeof value !== 'string') {
    return {
      error: true,
      message: fieldName + ' must be a string',
    };
  }

  if (value.length < minLength || value.length > maxLength) {
    return {
      error: true,
      message: fieldName + ' length must be between ' + minLength + ' and ' + maxLength,
    };
  }

  return null;
}

/**
 * Validate date format
 */
function validateDate(value, fieldName = 'date') {
  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return {
      error: true,
      message: fieldName + ' invalid format',
    };
  }

  return null;
}

/**
 * Validate array
 */
function validateArray(value, minLength = 0, maxLength = Infinity, fieldName = 'array') {
  if (!Array.isArray(value)) {
    return {
      error: true,
      message: fieldName + ' must be an array',
    };
  }

  if (value.length < minLength || value.length > maxLength) {
    return {
      error: true,
      message: fieldName + ' length must be between ' + minLength + ' and ' + maxLength,
    };
  }

  return null;
}

module.exports = {
  validateRequiredFields,
  validateEnum,
  validateRange,
  validateLength,
  validateDate,
  validateArray,
};
