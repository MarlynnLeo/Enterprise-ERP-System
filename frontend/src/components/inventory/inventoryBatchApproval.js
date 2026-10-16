import { normalizePosting, postingReviewIssue, separationReason } from '@/views/finance/inventoryPostingModel'
import { getApiErrorMessage } from '@/utils/errorHandler'

export const MAX_BATCH_APPROVAL = 100
const unwrap = response => response?.data ?? response

export function pendingBatchPostings(payload, sourceType) {
  const reversal = normalizePosting(payload?.reversal)
  if (reversal && ['pending', 'approved'].includes(reversal.financeStatus)) {
    return { postings: [], reason: '该单据正在反审核或已冲销，请在详情中处理' }
  }
  const movement = normalizePosting(payload?.movement)
  // Warehouse outbounds can have independently submitted supplements. Only the
  // latest submission for each source is eligible, never historical attempts.
  const records = sourceType === 'outbound'
    ? [...(payload?.postings || []).map(normalizePosting), movement]
    : [movement]
  const latest = new Map()
  for (const posting of records) {
    if (!posting || posting.postingKind !== 'movement') continue
    const verifiedPurchaseAlias = sourceType === 'purchase_receipt' && posting.sourceContext?.sourceType === 'purchase_receipt' &&
      ['inbound', 'purchase_inbound', 'batch_create'].includes(posting.sourceType)
    if (posting.sourceType !== sourceType && !verifiedPurchaseAlias && !(sourceType === 'outbound' && posting.sourceType === 'outbound_supplement')) continue
    const key = `${posting.sourceType}:${posting.sourceNo}`
    const previous = latest.get(key)
    const sequence = Number(posting.postingSequence || 1)
    const previousSequence = Number(previous?.postingSequence || 1)
    if (!previous || sequence > previousSequence || (sequence === previousSequence && Number(posting.id) > Number(previous.id))) latest.set(key, posting)
  }
  const postings = [...latest.values()].filter(posting => posting.financeStatus === 'pending')
    .sort((a, b) => Number(a.id) - Number(b.id))
  return { postings, reason: postings.length ? '' : '没有待财务审核的过账记录，请刷新列表核对状态' }
}

export async function prepareBatchApproval(sources, { sourceType, user, api, isCurrent = () => true }) {
  const prepared = new Array(sources.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < sources.length && isCurrent()) {
      const index = cursor++
      const source = sources[index]
      const base = { sourceNo: source.sourceNo, key: `source-${source.sourceId}`, status: 'skipped' }
      try {
        const payload = unwrap(await api.getBySource({ sourceType, ...source }))
        if (!isCurrent()) return
        const { postings, reason } = pendingBatchPostings(payload, sourceType)
        if (!postings.length) {
          prepared[index] = [{ ...base, message: reason }]
          continue
        }
        prepared[index] = []
        for (const posting of postings) {
          if (!isCurrent()) return
          const entry = { ...base, ...posting, key: `posting-${posting.id}` }
          try {
            const detail = normalizePosting(unwrap(await api.get(posting.id)))
            if (!isCurrent()) return
            if (!detail || String(detail.id) !== String(posting.id) || detail.financeStatus !== 'pending' ||
                detail.postingKind !== 'movement' || detail.sourceType !== posting.sourceType ||
                detail.sourceNo !== posting.sourceNo || String(detail.sourceId ?? '') !== String(posting.sourceId ?? '')) {
              throw new Error('过账记录已变化，请刷新列表后重新选择')
            }
            const issue = separationReason(detail, user) || postingReviewIssue(detail)
            prepared[index].push({ ...entry, ...detail, status: issue ? 'skipped' : 'ready', message: issue || '待确认审批' })
          } catch (error) {
            prepared[index].push({ ...entry, message: getApiErrorMessage(error, '获取过账明细失败，请重新选择后再试') })
          }
        }
      } catch (error) {
        prepared[index] = [{ ...base, message: getApiErrorMessage(error, '获取审核记录失败，请重新选择后再试') }]
      }
    }
  }
  // Bound read concurrency to avoid issuing hundreds of requests at once.
  await Promise.all(Array.from({ length: Math.min(4, sources.length) }, worker))
  const seen = new Set()
  return prepared.flat().filter(entry => {
    if (!entry || seen.has(entry.key)) return false
    seen.add(entry.key)
    return true
  })
}

export function applyBatchResults(entries, response) {
  const results = unwrap(response)?.results
  return entries.map(entry => {
    if (entry.status !== 'ready') return entry
    const matches = Array.isArray(results) ? results.filter(result => String(result.id) === String(entry.id)) : []
    if (matches.length !== 1 || typeof matches[0].success !== 'boolean') {
      return { ...entry, status: 'unknown', message: '审批结果未确认，请刷新列表核对后再操作' }
    }
    const result = matches[0]
    return {
      ...entry,
      status: result.success ? 'succeeded' : 'failed',
      message: result.success ? '财务审批通过' : result.error || '审批失败，请刷新列表后重试',
    }
  })
}
