const BANK_METHODS = ['bank_transfer', 'credit_card', 'check']

export const settlementCurrency = (source) => String(
  typeof source === 'string' ? source : source?.currencyCode ?? source?.currency ?? source?.currency_code ?? 'CNY'
).trim().toUpperCase() || 'CNY'

export const settlementCurrencyFields = invoice => ({
  currencyCode: settlementCurrency(invoice),
  exchangeRate: settlementCurrency(invoice) === 'CNY' ? 1 : invoice.exchangeRate ?? invoice.exchange_rate ?? null
})

export const formatSettlementAmount = (amount, source = 'CNY') => {
  if (amount === '***') return amount
  if (amount === null || amount === undefined || amount === '' || !Number.isFinite(Number(amount))) return '-'
  const currency = settlementCurrency(source)
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? 'US$' : `${currency} `
  return symbol + Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const matchingSettlementBanks = (accounts, source) => accounts.filter(
  account => settlementCurrency(account) === settlementCurrency(source)
)

// The invoice's confirmed rate is immutable during settlement. The server performs
// final base-currency allocation, including the last partial settlement's rounding.
export const settlementValidationError = (form, accounts) => {
  const currency = settlementCurrency(form)
  if (!['CNY', 'USD'].includes(currency)) return '当前收付款仅支持人民币和美元'
  if (currency === 'USD') {
    if (!Number.isFinite(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0) return '美元发票缺少有效的确认汇率，请先确认发票汇率'
    if (!BANK_METHODS.includes(form.paymentMethod)) return '美元收付款请选择银行转账、支票或信用卡'
  }
  if (BANK_METHODS.includes(form.paymentMethod)) {
    const account = accounts.find(item => String(item.id) === String(form.bankAccountId))
    if (!account || settlementCurrency(account) !== currency) return `请选择 ${currency} 同币种银行账户`
  }
  return ''
}
