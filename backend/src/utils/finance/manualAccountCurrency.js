const BusinessError = require('../BusinessError');

const MANUAL_TYPES = new Set([
  null,
  undefined,
  '',
  'manual',
  'manual_entry',
  '手工凭证',
  '记账凭证',
]);
const flag = (value) => value === true || value === 1 || value === '1';

// Legacy manual vouchers may have no type. Explicit business identity or a
// document link keeps automatic drafts on their existing validation path.
function isManualVoucherSource(entry) {
  return (
    MANUAL_TYPES.has(entry.document_type) &&
    MANUAL_TYPES.has(entry.transaction_type) &&
    !entry.transaction_id &&
    !flag(entry.has_business_links) &&
    entry.posting_method !== 'automatic'
  );
}

function assertManualAccountCurrency(items, accounts) {
  const byId = new Map(accounts.map((account) => [Number(account.id), account]));
  items.forEach((item, index) => {
    const account = byId.get(Number(item.account_id));
    if (
      String(account?.currency_code || '')
        .trim()
        .toUpperCase() !== 'USD'
    )
      return;
    if (
      String(item.currency_code || 'CNY')
        .trim()
        .toUpperCase() !== 'USD'
    ) {
      const code = account.account_code || item.account_id;
      throw new BusinessError(
        `第${index + 1}行科目 ${code} 为美元专户，请选择美元 USD 并填写原币金额与汇率`
      );
    }
  });
}

module.exports = { assertManualAccountCurrency, isManualVoucherSource };
