'use strict';

function validationError(message, code = 'VALIDATION_ERROR', statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function numeric(value) {
  return (
    ['number', 'string'].includes(typeof value) &&
    String(value).trim() !== '' &&
    Number.isFinite(Number(value))
  );
}

function integer(value, minimum) {
  return (
    numeric(value) &&
    Number.isInteger(Number(value)) &&
    Number(value) >= minimum &&
    Number(value) <= 2147483647
  );
}

function validateSamplingCounts(rule) {
  if (
    !integer(rule.sample_size, 1) ||
    !integer(rule.accept_limit, 0) ||
    !integer(rule.reject_limit, 1) ||
    Number(rule.accept_limit) >= Number(rule.sample_size) ||
    Number(rule.reject_limit) !== Number(rule.accept_limit) + 1
  ) {
    throw validationError(
      '一次抽样规则须配置正整数抽样数、非负整数 Ac，且 Ac 小于抽样数、Re 等于 Ac+1'
    );
  }
}

function isValidAqlLevel(value) {
  return (
    numeric(value) &&
    Number(value) > 0 &&
    Number(value) < 1000 &&
    Math.abs(Number(value) * 100000 - Math.round(Number(value) * 100000)) <= 1e-7
  );
}

function validateAqlRule(rule) {
  if (
    typeof rule.code !== 'string' ||
    !rule.code.trim() ||
    rule.code.length > 50 ||
    typeof rule.name !== 'string' ||
    !rule.name.trim() ||
    rule.name.length > 100
  ) {
    throw validationError('抽样标准代码和名称不能为空，且分别不能超过 50 和 100 个字符');
  }
  if (
    !integer(rule.batch_min, 1) ||
    !integer(rule.batch_max, 1) ||
    Number(rule.batch_min) > Number(rule.batch_max)
  ) {
    throw validationError('批量上下限须为正整数，且下限不能大于上限');
  }
  if (!isValidAqlLevel(rule.aql_level)) {
    throw validationError('AQL 须为大于 0、小于 1000 且最多五位小数的数值');
  }
  if (!['active', 'inactive'].includes(rule.status === undefined ? 'active' : rule.status)) {
    throw validationError('抽样标准状态无效');
  }
  validateSamplingCounts(rule);
}

module.exports = { validationError, validateAqlRule, validateSamplingCounts, isValidAqlLevel };
