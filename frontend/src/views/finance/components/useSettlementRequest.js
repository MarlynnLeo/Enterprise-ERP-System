import { ref } from 'vue'

// One key belongs to one form submission. Unknown outcomes must be replayed with
// the exact original payload so the server can return its existing record.
export function useSettlementRequest(kind = 'payment') {
  const retryNotice = ref('')
  const pending = ref(null)
  let key = ''
  let submittedPayload = null
  let canRevise = false
  let owner = null
  const currentOwner = () => typeof window !== 'undefined' && window.__erpUserId != null ? String(window.__erpUserId) : null
  const storageKey = (userId = owner) => userId ? `erp:settlement-pending:v1:${userId}:${kind}` : null
  const readStored = (userId = owner) => {
    if (!storageKey(userId)) return null
    try {
      const record = JSON.parse(sessionStorage.getItem(storageKey(userId)) || 'null')
      if (!record) return null
      if (record.version !== 1 || record.kind !== kind || record.userId !== userId || !record.key || !record.payload || !record.payload.invoiceId) throw new Error('invalid')
      return record
    } catch { throw new Error('未确认登记记录无法读取，请先核对收付款记录，勿重复登记') }
  }
  const persist = record => {
    if (!storageKey()) return
    try { sessionStorage.setItem(storageKey(), JSON.stringify(record)) }
    catch { throw new Error('浏览器无法保存登记恢复记录，请恢复浏览器存储后重试；本次尚未发送') }
  }
  const clearStored = record => {
    if (storageKey(record.userId) && readStored(record.userId)?.key === record.key) sessionStorage.removeItem(storageKey(record.userId))
  }
  const restore = () => {
    const nextOwner = currentOwner()
    if (owner !== nextOwner) {
      owner = nextOwner
      key = ''; submittedPayload = null; canRevise = false; pending.value = null; retryNotice.value = ''
    }
    const record = readStored()
    if (record) {
      key = record.key
      submittedPayload = JSON.stringify(record.payload)
      pending.value = record
      canRevise = false
      retryNotice.value = '上次登记结果尚未确认。请保持原内容重试，系统会核对是否已登记；修改前请先核对收付款记录。'
    }
    return pending.value
  }

  const begin = () => {
    restore()
    if (submittedPayload !== null && !canRevise && retryNotice.value) return JSON.parse(submittedPayload)
    key = crypto.randomUUID()
    submittedPayload = null
    canRevise = false
    retryNotice.value = ''
    pending.value = null
    return null
  }

  const submit = async (data, create, form = {}, accounts = []) => {
    if (!key) throw new Error('请重新打开收付款登记表单')
    if (!owner) throw new Error('登录状态尚未就绪，请重新登录后登记收付款')
    if (owner !== currentOwner()) throw new Error('登录用户已变化，请重新打开收付款登记')
    const stored = readStored()
    if (stored && stored.key !== key) throw new Error('存在另一笔尚未确认的登记，请重新打开窗口核对原记录')
    const payload = JSON.stringify(data)
    if (submittedPayload !== null && payload !== submittedPayload) {
      if (!canRevise) throw new Error('上次登记结果尚未确认，不能更改内容后重发。请恢复原内容重试，或先核对收付款记录再重新登记。')
      key = crypto.randomUUID()
    }
    submittedPayload = payload
    canRevise = false
    const bank = accounts.find(account => String(account.id) === String(data.bankAccountId))
    const summary = pending.value?.key === key ? pending.value.summary : {
      invoiceNumber: form.invoiceNumber,
      partnerName: form.customerName || form.supplierName,
      bankAccountName: bank ? [bank.bankName, bank.accountName, bank.accountNumber].filter(Boolean).join(' / ') : '',
    }
    const record = { version: 1, kind, userId: owner, key, payload: JSON.parse(payload), summary }
    const isCurrent = () => owner === record.userId && key === record.key && currentOwner() === record.userId
    persist(record)
    pending.value = record
    try {
      const response = await create(JSON.parse(submittedPayload), { headers: { 'Idempotency-Key': key } })
      clearStored(record)
      if (!isCurrent()) throw new Error('登录用户已变化，请在原账号查看登记结果')
      retryNotice.value = ''
      pending.value = null
      return response
    } catch (error) {
      const status = error?.response?.status ?? error?.status
      if (status === 400) clearStored(record)
      if (!isCurrent()) throw error
      canRevise = status === 400
      if (canRevise) pending.value = null
      retryNotice.value = status === 409
        ? '请求内容发生冲突，请先核对收付款记录，避免重复登记。'
        : canRevise
          ? '本次登记未成功，可修正内容后重试。'
          : '上次登记结果尚未确认。请保持原内容重试，系统会核对是否已登记；修改前请先核对收付款记录。'
      throw error
    }
  }

  const replay = create => {
    if (!pending.value) throw new Error('没有待核对的收付款登记')
    return submit(pending.value.payload, create)
  }
  return { begin, restore, submit, replay, retryNotice, pending }
}
