/** Shared P&L classification for reports, closing previews and closing entries. */

const TYPES = {
  收入: 'income',
  revenue: 'income',
  成本: 'cost',
  cost: 'cost',
  费用: 'expense',
  expense: 'expense',
  资产: 'asset',
  asset: 'asset',
};
const codeOf = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase();

function profitLossAccountRules(accountingConfig) {
  return {
    costCodes: [
      accountingConfig.getAccountCode('SALES_COST'),
      accountingConfig.getAccountCode('COST_OF_GOODS_SOLD'),
      accountingConfig.getAccountCode('OTHER_COST'),
      '6401',
      '6402',
    ].filter(Boolean),
    productionCodes: [
      accountingConfig.getAccountCode('PRODUCTION_COST'),
      accountingConfig.getAccountCode('MANUFACTURING_EXPENSE'),
      '4101',
      '5001',
      '5101',
    ].filter(Boolean),
  };
}

function classifyProfitLossAccounts(accounts, { costCodes, productionCodes }) {
  const byId = new Map(accounts.map((account) => [Number(account.id), account]));
  const byCode = new Map(accounts.map((account) => [codeOf(account.account_code), account]));
  const costRoots = new Set(costCodes.map(codeOf));
  const productionRoots = new Set(productionCodes.map(codeOf));
  const typeOf = (account) => TYPES[account.account_type] || null;
  const anchor = (account) => {
    const type = typeOf(account);
    const code = codeOf(account.account_code);
    // A legacy code can mean revenue in another chart. Never reinterpret its type.
    if (!['cost', 'expense', 'asset'].includes(type)) return null;
    if (productionRoots.has(code)) return 'production';
    if (costRoots.has(code) && type !== 'asset') return 'cost';
    return null;
  };
  const legacyRoots = [...new Set([...costRoots, ...productionRoots])]
    .map((code) => ({
      code,
      category: byCode.has(code)
        ? anchor(byCode.get(code))
        : productionRoots.has(code)
          ? 'production'
          : 'cost',
    }))
    .filter((root) => root.category)
    .sort((left, right) => right.code.length - left.code.length);

  const categories = new Map();
  for (const account of accounts) {
    const type = typeOf(account);
    let category = type === 'income' ? 'income' : null;
    if (type === 'cost' || type === 'expense') {
      let current = account;
      let unlinkedRoot = null;
      const visited = new Set();
      while (current && !visited.has(Number(current.id))) {
        visited.add(Number(current.id));
        category = anchor(current);
        if (category) break;
        const parent = byId.get(Number(current.parent_id));
        if (!parent) unlinkedRoot = current;
        current = parent;
      }
      // Old imported subaccounts sometimes have no parent link. Use their code
      // at the root of the real chain, so their descendants inherit the same
      // category without a child's prefix overriding its explicit parentage.
      if (!category && unlinkedRoot) {
        category = legacyRoots.find((root) =>
          codeOf(unlinkedRoot.account_code).startsWith(root.code)
        )?.category;
      }
      category ||= type;
    }
    categories.set(Number(account.id), category);
  }
  return categories;
}

async function loadProfitLossAccountCategories(connection, accountingConfig, db) {
  await accountingConfig.loadFromDatabase(db);
  // Include inactive parents: historical postings retain their original branch.
  const [accounts] = await connection.execute(
    'SELECT id, account_code, account_type, parent_id FROM gl_accounts'
  );
  return classifyProfitLossAccounts(accounts, profitLossAccountRules(accountingConfig));
}

module.exports = {
  profitLossAccountRules,
  classifyProfitLossAccounts,
  loadProfitLossAccountCategories,
};
