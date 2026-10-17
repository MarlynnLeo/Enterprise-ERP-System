const Precision = require('../../../utils/precision');
const BusinessError = require('../../../utils/BusinessError');

const REPORT_TITLES = Object.freeze({
  general: '总分类账',
  cash: '库存现金日记账',
  payable: '应付账款明细分类账',
  vat: '增值税多栏账',
  quantity: '数量金额明细账',
});

const MAX_SOURCE_ROWS = 10000;
const VAT_COLUMNS = Object.freeze([
  {
    key: 'inputTax',
    label: '进项税额',
    side: 'debit',
    pattern: /^(?:应交增值税[-—－])?进项税[额款]?$/,
  },
  { key: 'paidTax', label: '已交税金', side: 'debit', pattern: /已交税金/ },
  { key: 'taxRelief', label: '减免税款', side: 'debit', pattern: /减免税/ },
  { key: 'exportOffset', label: '出口抵减内销产品应纳税额', side: 'debit', pattern: /出口抵减/ },
  { key: 'unpaidTransfer', label: '转出未交增值税', side: 'debit', pattern: /转出未交/ },
  { key: 'pendingInputTax', label: '待抵扣进项税额', side: 'debit', pattern: /待抵扣进项税/ },
  {
    key: 'outputTax',
    label: '销项税额',
    side: 'credit',
    pattern: /^(?:应交增值税[-—－])?销项税[额款]?$/,
  },
  { key: 'exportRefund', label: '出口退税', side: 'credit', pattern: /出口退税/ },
  { key: 'inputTransfer', label: '进项税额转出', side: 'credit', pattern: /进项税.*转出/ },
  { key: 'overpaidTransfer', label: '转出多交增值税', side: 'credit', pattern: /转出多交/ },
]);

function invalid(message) {
  return new BusinessError(message, null, 'VALIDATION_ERROR', 400);
}

function validateType(type) {
  if (!Object.hasOwn(REPORT_TITLES, type)) throw invalid('不支持的账簿类型');
  return type;
}

function integer(value, label, fallback, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null || value === '') return fallback;
  if (
    !/^\d+$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1 ||
    Number(value) > max
  ) {
    throw invalid(`${label}必须为 1 至 ${max} 的整数`);
  }
  return Number(value);
}

function normalizeFilters(type, query = {}) {
  validateType(type);
  const startMonth = String(query.startMonth || '');
  const endMonth = String(query.endMonth || '');
  const monthPattern = /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/;
  if (!monthPattern.test(startMonth) || !monthPattern.test(endMonth)) {
    throw invalid('请选择起止会计月份，格式为 YYYY-MM');
  }
  if (startMonth > endMonth) throw invalid('开始月份不能晚于结束月份');
  const monthIndex = (value) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5));
  if (monthIndex(endMonth) - monthIndex(startMonth) >= 24)
    throw invalid('单次查询最多支持 24 个月，请缩小期间');
  const [year, month] = endMonth.split('-').map(Number);
  const endDate = `${endMonth}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
  if (query.export !== undefined && !['true', 'false', '1', '0'].includes(String(query.export))) {
    throw invalid('导出参数无效');
  }
  const accountId = integer(query.accountId, '科目', null);
  const supplierId = integer(query.supplierId, '供应商', null);
  const materialId = integer(query.materialId, '物料', null);
  if (supplierId && type !== 'payable') throw invalid('只有应付账款明细分类账支持供应商筛选');
  if (materialId && type !== 'quantity') throw invalid('只有数量金额明细账支持物料筛选');
  return {
    startMonth,
    endMonth,
    startDate: `${startMonth}-01`,
    endDate,
    yearStartDate: `${startMonth.slice(0, 4)}-01-01`,
    accountId,
    supplierId,
    materialId,
    page: integer(query.page, '页码', 1, 100000),
    pageSize: integer(query.pageSize, '每页行数', 50, 200),
    exportAll: ['true', '1'].includes(String(query.export)),
  };
}

function accountTree(accounts, root) {
  if (!root) return [];
  const ids = new Set([Number(root.id)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const account of accounts) {
      if (!ids.has(Number(account.id)) && ids.has(Number(account.parent_id))) {
        ids.add(Number(account.id));
        changed = true;
      }
    }
  }
  return accounts.filter((account) => ids.has(Number(account.id)));
}

function availableAccounts(type, accounts, codes) {
  if (type === 'general') return accounts;
  if (type === 'quantity') return [];
  const key = { cash: 'CASH', payable: 'ACCOUNTS_PAYABLE', vat: 'VAT_PAYABLE' }[type];
  const root = accounts.find((account) => account.account_code === codes[key]);
  const selected = accountTree(accounts, root);
  if (type === 'vat') {
    const extra = accounts.filter(
      (account) =>
        /待抵扣进项税/.test(account.account_name) ||
        [codes.VAT_INPUT_TAX, codes.VAT_OUTPUT_TAX].includes(account.account_code)
    );
    for (const account of extra) {
      if (!selected.some((item) => Number(item.id) === Number(account.id))) selected.push(account);
    }
  }
  return selected;
}

function balanceParts(net) {
  if (net === null) return { balance: null, direction: '—' };
  const amount = Precision.round(net);
  return { balance: Math.abs(amount), direction: amount > 0 ? '借' : amount < 0 ? '贷' : '平' };
}

function monthList(filters) {
  const months = [];
  let [year, month] = filters.startMonth.split('-').map(Number);
  while (`${year}-${String(month).padStart(2, '0')}` <= filters.endMonth) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }
  return months;
}

function vatColumnFor(account, codes) {
  if (account.account_code === codes.VAT_INPUT_TAX) return VAT_COLUMNS[0];
  if (account.account_code === codes.VAT_OUTPUT_TAX) return VAT_COLUMNS[6];
  return (
    VAT_COLUMNS.find((column) =>
      column.pattern.test(
        String(account.account_name)
          .split(/[—－-]/)
          .pop()
          .trim()
      )
    ) || null
  );
}

function columnsFor(type) {
  const text = (key, label, width = 130) => ({ key, label, width });
  const number = (key, label, decimals = 2) => ({ key, label, decimals, width: 130 });
  const balance = {
    label: '余额',
    children: [text('direction', '方向', 65), number('balance', '金额')],
  };
  const base = [
    text('date', '凭证日期', 115),
    text('voucherNumber', '凭证字号', 150),
    text('description', '摘要', 240),
  ];
  if (type === 'general')
    return [
      text('accountCode', '科目代码'),
      text('accountName', '科目名称', 190),
      text('period', '期间', 95),
      text('description', '摘要', 180),
      number('debit', '借方'),
      number('credit', '贷方'),
      balance,
    ];
  if (type === 'quantity')
    return [
      text('materialCode', '物料代码'),
      text('materialName', '物料名称', 180),
      text('unit', '单位', 70),
      ...base.map((column) =>
        column.key === 'voucherNumber' ? { ...column, label: '来源单号' } : column
      ),
      {
        label: '借方（入库）',
        children: [
          number('debitQuantity', '数量', 4),
          number('debitUnitPrice', '单价', 6),
          number('debit', '金额'),
        ],
      },
      {
        label: '贷方（出库）',
        children: [
          number('creditQuantity', '数量', 4),
          number('creditUnitPrice', '单价', 6),
          number('credit', '金额'),
        ],
      },
      {
        label: '余额',
        children: [
          text('direction', '方向', 65),
          number('balanceQuantity', '数量', 4),
          number('balanceUnitPrice', '单价', 6),
          number('balance', '金额'),
        ],
      },
    ];
  if (type === 'vat')
    return [
      ...base,
      number('debit', '借方合计'),
      number('credit', '贷方合计'),
      ...['debit', 'credit'].map((side) => ({
        label: side === 'debit' ? '借方税额' : '贷方税额',
        children: VAT_COLUMNS.filter((column) => column.side === side).map((column) =>
          number(column.key, column.label)
        ),
      })),
      number('unclassifiedTax', '其他明细（借减贷）'),
      balance,
    ];
  return [
    ...base,
    ...(type === 'payable' ? [text('supplierName', '供应商', 180)] : []),
    text('accountCode', '科目代码'),
    text('accountName', '科目名称', 150),
    number('debit', '借方'),
    number('credit', '贷方'),
    balance,
  ];
}

module.exports = {
  REPORT_TITLES,
  MAX_SOURCE_ROWS,
  VAT_COLUMNS,
  invalid,
  validateType,
  normalizeFilters,
  accountTree,
  availableAccounts,
  balanceParts,
  monthList,
  vatColumnFor,
  columnsFor,
};
