import { parseListData } from '@/utils/responseParser'

export async function loadSettlementBankAccounts(api, isCurrent = () => true) {
  const accounts = new Map()
  for (let page = 1; ; page += 1) {
    if (!isCurrent()) return []
    const response = await api.getBankAccounts({ page, limit: 100 })
    if (!isCurrent()) return []
    const list = parseListData(response, { enableLog: false })
    const before = accounts.size
    for (const account of list) accounts.set(String(account.id), account)
    const total = Number(response.pagination?.total ?? response.data?.pagination?.total ?? response.data?.total ?? response.total ?? list.length)
    if (accounts.size >= total) return [...accounts.values()]
    if (!list.length || accounts.size === before) throw new Error('银行账户分页数据不完整，请重新加载')
  }
}
