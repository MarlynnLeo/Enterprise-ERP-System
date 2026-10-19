const flag = value => value === true || value === 1 || value === '1'
const optionalNumber = value => value == null || value === '' ? null : Number(value)
const optionalText = value => String(value ?? '').trim() || null

// Exact nonnegative decimal arithmetic that also works with the app's ES2015
// browser target. Match server half-up rounding: 1 USD × 1.005 = 1.01 CNY.
const trimZeros = digits => digits.replace(/^0+(?=\d)/, '')
const addInteger = (left, right) => {
  let carry = 0
  let output = ''
  for (let i = left.length - 1, j = right.length - 1; i >= 0 || j >= 0 || carry; i--, j--) {
    const sum = Number(left[i] || 0) + Number(right[j] || 0) + carry
    output = String(sum % 10) + output
    carry = Math.floor(sum / 10)
  }
  return trimZeros(output)
}
const multiplyInteger = (left, right) => {
  const digits = Array(left.length + right.length).fill(0)
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      const position = i + j + 1
      const value = Number(left[i]) * Number(right[j]) + digits[position]
      digits[position] = value % 10
      digits[position - 1] += Math.floor(value / 10)
    }
  }
  return trimZeros(digits.join(''))
}
const decimalParts = value => {
  const [significand, exponent = '0'] = String(value).trim().toLowerCase().split('e')
  const [whole, fraction = ''] = significand.split('.')
  const scale = fraction.length - Number(exponent)
  const coefficient = trimZeros(`${whole || '0'}${fraction}`.replace(/^\+/, ''))
  return scale < 0
    ? { coefficient: coefficient + '0'.repeat(-scale), scale: 0 }
    : { coefficient, scale }
}
const roundedCents = ({ coefficient, scale }) => {
  if (scale <= 2) return trimZeros(coefficient + '0'.repeat(2 - scale))
  const digits = '0'.repeat(Math.max(0, scale + 1 - coefficient.length)) + coefficient
  const split = digits.length - scale + 2
  const cents = trimZeros(digits.slice(0, split))
  return digits[split] >= '5' ? addInteger(cents, '1') : cents
}
const amountCents = value => roundedCents(decimalParts(value))
const convertedCents = (amount, rate) => {
  const a = decimalParts(amount)
  const b = decimalParts(rate)
  return roundedCents({ coefficient: multiplyInteger(a.coefficient, b.coefficient), scale: a.scale + b.scale })
}

export const createManualItem = () => ({
  description: '', accountId: null, debitAmount: 0, creditAmount: 0,
  customerId: null, supplierId: null, employeeId: null, departmentId: null, costCenterId: null,
  projectName: '', currencyCode: 'CNY', exchangeRate: 1, foreignAmount: null,
  quantity: null, unitName: '', unitPrice: null, settlementMethod: '', invoiceNumber: '',
  _accountAux: {},
})

export const accountAuxiliary = account => Object.fromEntries(
  ['hasCustomer', 'hasSupplier', 'hasEmployee', 'hasDepartment', 'hasProject'].map(key => [key, flag(account?.[key])])
)

export function prepareAccountOptions(accounts) {
  const flatten = list => list.flatMap(account => [account, ...flatten(account.children || [])])
  const all = flatten(accounts)
  const byId = new Map(all.map(account => [String(account.id), account]))
  const enabled = (account, visited = new Set()) => {
    if (!account || !flag(account.isActive) || visited.has(String(account.id))) return false
    visited.add(String(account.id))
    return !account.parentId || enabled(byId.get(String(account.parentId)), visited)
  }
  const allowed = all.filter(account => enabled(account))
  const nodes = new Map(allowed.map(account => [String(account.id), {
    ...account, children: [], fullName: `${account.accountCode} - ${account.accountName}`,
  }]))
  const tree = []
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(String(node.parentId))) nodes.get(String(node.parentId)).children.push(node)
    else tree.push(node)
  }
  for (const node of nodes.values()) if (!node.children.length) delete node.children
  return { tree, flat: [...nodes.values()] }
}

export function manualEntryError(form, accounts) {
  if (form.attachmentCount != null && (!Number.isSafeInteger(Number(form.attachmentCount)) || Number(form.attachmentCount) < 0)) return '附单据数必须为非负整数'
  let debitCents = '0'
  let creditCents = '0'
  let count = 0
  for (const [index, item] of form.items.entries()) {
    const debit = Number(item.debitAmount || 0)
    const credit = Number(item.creditAmount || 0)
    const prefix = `第 ${index + 1} 行：`
    if (![debit, credit].every(value => Number.isFinite(value) && value >= 0)) return `${prefix}借贷金额必须为非负数`
    if (debit === 0 && credit === 0) continue
    count++
    if (debit > 0 && credit > 0) return `${prefix}借方与贷方只能填写一项`
    const account = accounts.find(candidate => String(candidate.id) === String(item.accountId))
    if (!account) return `${prefix}请选择有效会计科目`
    if (account.currencyCode === 'USD' && item.currencyCode !== 'USD') return `${prefix}该科目原币为 USD，请使用美元并填写外币金额及汇率`
    const aux = accountAuxiliary(account)
    for (const [required, field, label] of [
      ['hasCustomer', 'customerId', '客户'], ['hasSupplier', 'supplierId', '供应商'],
      ['hasEmployee', 'employeeId', '员工'], ['hasDepartment', 'departmentId', '部门'], ['hasProject', 'projectName', '项目名称'],
    ]) if (aux[required] && !String(item[field] ?? '').trim()) return `${prefix}该科目必须填写${label}`
    if (!['CNY', 'USD'].includes(item.currencyCode)) return `${prefix}请选择人民币或美元`
    if (item.currencyCode === 'USD') {
      const rate = optionalNumber(item.exchangeRate)
      const foreign = optionalNumber(item.foreignAmount)
      if (!(rate > 0) || !Number.isFinite(rate)) return `${prefix}请填写美元汇率（1 USD = x CNY）`
      if (!(foreign > 0) || !Number.isFinite(foreign)) return `${prefix}请填写美元外币金额`
      if (convertedCents(item.foreignAmount, item.exchangeRate) !== amountCents(debit || credit)) return `${prefix}人民币金额应等于美元金额 × 汇率（保留两位小数）`
    }
    for (const [field, label] of [['quantity', '数量'], ['unitPrice', '单价']]) {
      const value = optionalNumber(item[field])
      if (value != null && (!Number.isFinite(value) || value < 0)) return `${prefix}${label}必须为非负数`
    }
    debitCents = addInteger(debitCents, amountCents(debit))
    creditCents = addInteger(creditCents, amountCents(credit))
  }
  if (count < 2) return '请录入至少两行有效分录'
  if (debitCents !== creditCents) return '凭证借贷不平，无法保存'
  return ''
}

export function manualEntryPayload(form) {
  return {
    entryDate: form.entryDate, postingDate: form.entryDate, voucherWord: form.voucherWord,
    attachmentCount: optionalNumber(form.attachmentCount), documentNumber: optionalText(form.documentNumber), description: form.description,
    items: form.items.filter(item => Number(item.debitAmount) > 0 || Number(item.creditAmount) > 0).map(item => ({
      accountId: item.accountId, description: item.description || form.description,
      debitAmount: Number(item.debitAmount || 0), creditAmount: Number(item.creditAmount || 0),
      customerId: item.customerId || null, supplierId: item.supplierId || null,
      employeeId: item.employeeId || null, employeeSource: item.employeeId ? 'user' : null,
      departmentId: item.departmentId || null, costCenterId: item.costCenterId || null,
      projectName: optionalText(item.projectName), currencyCode: item.currencyCode,
      exchangeRate: item.currencyCode === 'CNY' ? 1 : optionalNumber(item.exchangeRate),
      foreignAmount: item.currencyCode === 'USD' ? optionalNumber(item.foreignAmount) : null,
      quantity: optionalNumber(item.quantity), unitName: optionalText(item.unitName), unitPrice: optionalNumber(item.unitPrice),
      settlementMethod: optionalText(item.settlementMethod), invoiceNumber: optionalText(item.invoiceNumber),
    })),
  }
}
