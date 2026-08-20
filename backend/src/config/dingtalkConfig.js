const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseNonNegativeInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const normalizeApiBaseUrl = (value) => {
  const raw = String(value || 'https://oapi.dingtalk.com').trim().replace(/\/+$/, '');
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('DINGTALK_API_BASE_URL must use http or https');
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('DINGTALK_API_BASE_URL must use https in production');
  }
  return parsed.toString().replace(/\/+$/, '');
};

module.exports = {
  corpId: process.env.DINGTALK_CORP_ID || '',
  appKey: process.env.DINGTALK_APP_KEY || '',
  appSecret: process.env.DINGTALK_APP_SECRET || '',
  agentId: process.env.DINGTALK_AGENT_ID || '',
  processCode: process.env.DINGTALK_PROCESS_CODE || '',
  apiToken: process.env.DINGTALK_API_TOKEN || '',

  apiBaseUrl: normalizeApiBaseUrl(process.env.DINGTALK_API_BASE_URL),
  rootDeptId: parsePositiveInt(process.env.DINGTALK_ROOT_DEPT_ID, 1),
  defaultUserPageSize: Math.min(parsePositiveInt(process.env.DINGTALK_USER_PAGE_SIZE, 100), 100),
  requestTimeoutMs: parsePositiveInt(process.env.DINGTALK_REQUEST_TIMEOUT_MS, 10000),
  maxResponseBytes: parsePositiveInt(process.env.DINGTALK_MAX_RESPONSE_BYTES, 1024 * 1024),
  maxRetries: Math.min(parseNonNegativeInt(process.env.DINGTALK_MAX_RETRIES, 2), 3),
  rejectUnauthorized:
    process.env.NODE_ENV === 'production'
      ? true
      : process.env.DINGTALK_REJECT_UNAUTHORIZED !== 'false',

  defaultEmployee: {
    baseSalary: Number.parseFloat(process.env.DINGTALK_DEFAULT_BASE_SALARY || '3070'),
    splitBaseSalary: Number.parseFloat(process.env.DINGTALK_DEFAULT_SPLIT_BASE_SALARY || '1215'),
    insuranceType: process.env.DINGTALK_DEFAULT_INSURANCE_TYPE || '有社有公',
    monthlyWorkDays: Number.parseFloat(process.env.HR_MONTHLY_WORK_DAYS || '21.75'),
  },

  callback: {
    path: process.env.DINGTALK_CALLBACK_PATH || '/api/dingtalk/callback',
    token: process.env.DINGTALK_CALLBACK_TOKEN || '',
    aesKey: process.env.DINGTALK_CALLBACK_AES_KEY || '',
  },

  defaultApprover: {
    userId: process.env.DINGTALK_DEFAULT_APPROVER_USER_ID || '',
    deptId: parseNumber(process.env.DINGTALK_DEFAULT_DEPT_ID),
  },
};
