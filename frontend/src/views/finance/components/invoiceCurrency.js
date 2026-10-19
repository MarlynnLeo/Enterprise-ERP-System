import { settlementCurrency } from './settlementCurrency'

export const invoiceCurrencyLocked = form => Boolean(form.id && form.status && !['草稿', 'draft', '未确认'].includes(form.status))

export const invoiceCurrencyError = form => {
  const currency = settlementCurrency(form)
  if (!['CNY', 'USD'].includes(currency)) return '请选择人民币或美元'
  if (currency === 'CNY') return Number(form.exchangeRate) === 1 ? '' : '人民币汇率必须为 1'
  const rate = String(form.exchangeRate ?? '').trim()
  const parts = rate.match(/^\d+(?:\.(\d+))?(?:e([+-]?\d+))?$/i)
  const decimalPlaces = parts ? (parts[1]?.length || 0) - Number(parts[2] || 0) : Infinity
  if (decimalPlaces > 8 || !Number.isFinite(Number(rate)) || Number(rate) <= 0) return '请填写大于 0、最多 8 位小数的美元汇率'
  return ''
}

export const invoiceCurrencyRules = getForm => ({
  currencyCode: [{ required: true, message: '请选择币种', trigger: 'change' }],
  exchangeRate: [{ validator: (_rule, _value, callback) => {
    const error = invoiceCurrencyError(getForm())
    callback(error ? new Error(error) : undefined)
  }, trigger: 'change' }]
})
