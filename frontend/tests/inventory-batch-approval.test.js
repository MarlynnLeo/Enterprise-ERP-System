import { describe, expect, test, vi } from 'vitest'
import { applyBatchResults, pendingBatchPostings, prepareBatchApproval } from '@/components/inventory/inventoryBatchApproval'

vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: {} }))

const reviewer = { id: 9, username: 'finance', realName: '财务乙' }
const posting = (id = 101, fields = {}) => ({
  id, postingNo: `PST-${id}`, sourceType: 'inbound', sourceId: 11, sourceNo: 'IN-11',
  postingKind: 'movement', postingSequence: 1, financeStatus: 'pending',
  businessApprovedById: 2, businessApprovedBy: '业务甲', totalValue: 20,
  lines: [{ signedQuantity: 2, unitCost: 10, totalValue: 20 }], ...fields,
})
const source = { sourceId: 11, sourceNo: 'IN-11' }
const deferred = () => {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}

describe('pending postings for a batch approval', () => {
  test('collects all current outbound supplements and excludes superseded submissions', () => {
    const outbound = fields => posting(fields.id, { sourceType: 'outbound', sourceNo: 'OUT-11', ...fields })
    const supplement = fields => outbound({ sourceType: 'outbound_supplement', sourceNo: 'OUT-11-S1', ...fields })
    const payload = {
      movement: supplement({ id: 103 }),
      postings: [
        outbound({ id: 100 }), outbound({ id: 101, postingSequence: 2, financeStatus: 'approved' }),
        supplement({ id: 102, financeStatus: 'rejected' }), supplement({ id: 103 }),
        supplement({ id: 104, sourceNo: 'OUT-11-S2' }),
        supplement({ id: 105, sourceNo: 'OUT-11-S3' }),
        supplement({ id: 106, sourceNo: 'OUT-11-S3', postingSequence: 2, financeStatus: 'rejected' }),
        posting(107), supplement({ id: 108, postingKind: 'reversal' }),
      ],
    }
    expect(pendingBatchPostings(payload, 'outbound').postings.map(row => row.id)).toEqual([103, 104])
  })

  test('normalizes legacy fields and deduplicates the movement repeated in postings', () => {
    const movement = {
      id: '103', source_type: 'outbound_supplement', source_no: 'OUT-11-S1', source_id: 11,
      posting_kind: 'movement', posting_sequence: 2, finance_status: 'pending',
    }
    expect(pendingBatchPostings({ movement, postings: [movement, { ...movement, id: 99, posting_sequence: 1 }] }, 'outbound').postings)
      .toEqual([expect.objectContaining({ id: '103', sourceType: 'outbound_supplement', sourceNo: 'OUT-11-S1' })])
  })

  test('uses only the current movement for inbound sources', () => {
    expect(pendingBatchPostings({ movement: posting(101), postings: [posting(99)] }, 'inbound').postings.map(row => row.id)).toEqual([101])
  })

  test.each(['pending', 'approved'])('blocks an active or completed reversal: %s', financeStatus => {
    const result = pendingBatchPostings({ movement: posting(), reversal: posting(202, { postingKind: 'reversal', financeStatus }) }, 'inbound')
    expect(result.postings).toEqual([])
    expect(result.reason).toContain('反审核')
  })

  test('allows a pending movement after a rejected reversal request', () => {
    expect(pendingBatchPostings({ movement: posting(), reversal: posting(202, { postingKind: 'reversal', financeStatus: 'rejected' }) }, 'inbound').postings)
      .toHaveLength(1)
  })

  test.each([null, { movement: posting(101, { financeStatus: 'approved' }) }, { movement: posting(101, { sourceType: 'sales_outbound' }) }])(
    'skips absent, already processed or unrelated movements: %j', payload => {
      expect(pendingBatchPostings(payload, 'inbound')).toMatchObject({ postings: [], reason: expect.stringContaining('没有待财务审核') })
    },
  )
})

describe('preparing reviewable approval entries', () => {
  const prepare = (api, sources = [source], options = {}) => prepareBatchApproval(sources, { sourceType: 'inbound', user: reviewer, api, ...options })
  const apiFor = (detail = posting()) => ({ getBySource: vi.fn().mockResolvedValue({ data: { movement: posting() } }), get: vi.fn().mockResolvedValue({ data: detail }) })

  test('reads frozen details using the posting id instead of the business source id', async () => {
    const api = apiFor()
    const result = await prepare(api)
    expect(api.getBySource).toHaveBeenCalledExactlyOnceWith({ sourceType: 'inbound', sourceId: 11, sourceNo: 'IN-11' })
    expect(api.get).toHaveBeenCalledExactlyOnceWith(101)
    expect(result).toEqual([expect.objectContaining({
      id: 101, key: 'posting-101', status: 'ready', lines: [expect.objectContaining(posting().lines[0])],
    })])
  })

  test.each([
    [{ businessApprovedById: 9 }, '必须分离'],
    [{ businessApprovedBy: '财务乙' }, '必须分离'],
    [{ totalValue: '***' }, '无权查看完整存货成本'],
    [{ lines: [{ signedQuantity: 2, unitCost: '***', totalValue: 20 }] }, '无权查看完整存货成本'],
    [{ lines: [] }, '缺少过账明细'],
    [{ lines: [{ signedQuantity: 2, unitCost: null, totalValue: 20 }] }, '数据不完整'],
    [{ lines: [{ signedQuantity: 0, unitCost: 10, totalValue: 20 }] }, '数据不完整'],
  ])('skips an entry that cannot be independently reviewed: %j', async (fields, reason) => {
    expect(await prepare(apiFor(posting(101, fields)))).toEqual([expect.objectContaining({ id: 101, status: 'skipped', message: expect.stringContaining(reason) })])
  })

  test.each([
    { id: 102 }, { financeStatus: 'approved' }, { postingKind: 'reversal' },
    { sourceType: 'outbound' }, { sourceNo: 'IN-22' }, { sourceId: 22 },
  ])('skips stale or mismatched detail without using its values: %j', async fields => {
    expect(await prepare(apiFor(posting(101, fields)))).toEqual([expect.objectContaining({ id: 101, status: 'skipped', message: expect.stringContaining('已变化') })])
  })

  test('retains readable errors per source or posting while preparing other entries', async () => {
    const api = {
      getBySource: vi.fn().mockRejectedValueOnce(new Error('来源读取失败')).mockResolvedValueOnce({ movement: posting(102) }),
      get: vi.fn().mockRejectedValueOnce(new Error('成本读取失败')),
    }
    const result = await prepare(api, [source, { sourceId: 12, sourceNo: 'IN-12' }])
    expect(result.map(row => [row.status, row.message])).toEqual([['skipped', '来源读取失败'], ['skipped', '成本读取失败']])
  })

  test('never loads detail for a reversal or an already approved source', async () => {
    const api = apiFor()
    api.getBySource.mockResolvedValueOnce({ movement: posting(), reversal: posting(202, { postingKind: 'reversal' }) })
      .mockResolvedValueOnce({ movement: posting(102, { financeStatus: 'approved' }) })
    expect((await prepare(api, [source, { sourceId: 12, sourceNo: 'IN-12' }])).every(row => row.status === 'skipped')).toBe(true)
    expect(api.get).not.toHaveBeenCalled()
  })

  test('deduplicates a posting returned for multiple selected business sources', async () => {
    const result = await prepare(apiFor(), [source, { sourceId: 12, sourceNo: 'IN-12' }])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 101, status: 'ready' })
  })

  test('bounds concurrent source reads and stops queued work after cancellation', async () => {
    const pending = deferred()
    let active = true
    const api = { getBySource: vi.fn().mockReturnValue(pending.promise), get: vi.fn() }
    const sources = Array.from({ length: 7 }, (_, index) => ({ sourceId: index + 1, sourceNo: `IN-${index + 1}` }))
    const result = prepare(api, sources, { isCurrent: () => active })
    expect(api.getBySource).toHaveBeenCalledTimes(4)
    active = false
    pending.resolve({ movement: posting() })
    expect(await result).toEqual([])
    expect(api.getBySource).toHaveBeenCalledTimes(4)
    expect(api.get).not.toHaveBeenCalled()
  })

  test('ignores details resolved after the preview has been invalidated', async () => {
    const pending = deferred()
    let active = true
    const api = apiFor()
    api.get.mockReturnValue(pending.promise)
    const result = prepare(api, [source], { isCurrent: () => active })
    await Promise.resolve()
    expect(api.get).toHaveBeenCalledTimes(1)
    active = false
    pending.resolve(posting())
    expect(await result).toEqual([])
  })
})

describe('batch approval outcomes', () => {
  const entries = [101, 102, 103].map(id => ({ id, status: 'ready', key: `posting-${id}` }))

  test('shows success, failure and missing outcomes independently while keeping skipped rows', () => {
    const skipped = { id: 104, status: 'skipped', message: '自审跳过' }
    const result = applyBatchResults([...entries, skipped], { data: { successCount: 99, results: [
      { id: '101', success: true }, { id: 102, success: false, error: '库存不足' }, { id: 999, success: true },
    ] } })
    expect(result.map(row => row.status)).toEqual(['succeeded', 'failed', 'unknown', 'skipped'])
    expect(result[1].message).toBe('库存不足')
    expect(result[2].message).toContain('核对')
    expect(result[3]).toBe(skipped)
    expect(entries.every(row => row.status === 'ready')).toBe(true)
  })

  test.each([
    null, {}, { results: [] }, { results: [{ id: 101, success: 'true' }] },
    { results: [{ id: 101, success: true }, { id: '101', success: false }] },
  ])('never reports success from a missing or ambiguous response: %j', response => {
    expect(applyBatchResults(entries, response).every(row => row.status === 'unknown')).toBe(true)
  })

  test('provides a failure message when the server supplies only a failure code', () => {
    expect(applyBatchResults(entries, { results: [{ id: 101, success: false, code: 'INVALID_STATUS' }] })[0])
      .toMatchObject({ status: 'failed', message: expect.stringContaining('审批失败') })
  })
})
