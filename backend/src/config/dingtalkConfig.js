const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  corpId: process.env.DINGTALK_CORP_ID || '',
  appKey: process.env.DINGTALK_APP_KEY || '',
  appSecret: process.env.DINGTALK_APP_SECRET || '',
  agentId: process.env.DINGTALK_AGENT_ID || '',
  processCode: process.env.DINGTALK_PROCESS_CODE || '',
  apiToken: process.env.DINGTALK_API_TOKEN || '',

  apiBaseUrl: (process.env.DINGTALK_API_BASE_URL || 'https://oapi.dingtalk.com').replace(/\/+$/, ''),
  rootDeptId: parsePositiveInt(process.env.DINGTALK_ROOT_DEPT_ID, 1),
  defaultUserPageSize: parsePositiveInt(process.env.DINGTALK_USER_PAGE_SIZE, 100),
  rejectUnauthorized: process.env.DINGTALK_REJECT_UNAUTHORIZED !== 'false',

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
