import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { computed, defineComponent, h, inject, provide, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import InventoryApprovalPanel from '@/components/inventory/InventoryApprovalPanel.vue'

const mocks = vi.hoisted(() => ({
  getBySource: vi.fn(), get: vi.fn(), approve: vi.fn(), reject: vi.fn(), reverse: vi.fn(),
  confirm: vi.fn(), prompt: vi.fn(), success: vi.fn(), error: vi.fn(),
}))
const auth = reactive({
  user: { id: 9, realName: '财务乙' },
  canViewInventoryApproval: true, canApproveInventoryApproval: true, canReverseInventoryApproval: true,
})
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/api/finance', () => ({ financeApi: { inventoryPostings: mocks } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: mocks }))

const slot = { template: '<div><slot /><slot name="description" /></div>' }
const button = { props: ['loading', 'disabled'], emits: ['click'], template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot /></button>' }
const table = defineComponent({
  props: ['data'],
  setup(props, { slots }) {
    provide('postingRows', computed(() => props.data))
    return () => h('div', { 'data-test': 'posting-lines' }, slots.default?.())
  },
})
const column = defineComponent({
  props: ['prop', 'label'],
  setup(props, { slots }) {
    const rows = inject('postingRows')
    return () => h('div', { 'data-column': props.label }, rows.value.map(row =>
      h('span', slots.default ? slots.default({ row }) : String(row[props.prop] ?? ''))
    ))
  },
})
const global = {
  directives: { loading: () => {}, permission: () => {} },
  stubs: {
    ElButton: button, ElTag: slot, ElSteps: slot, ElStep: slot, ElTooltip: slot,
    ElTimeline: slot, ElTimelineItem: slot,
    ElTable: table, ElTableColumn: column,
    ElAlert: { props: ['title'], template: '<aside role="alert">{{ title }}</aside>' },
  },
}
const posting = (id = 101, fields = {}) => ({
  id, postingNo: `PST-${id}`, sourceType: 'inbound', sourceNo: 'IN-11',
  financeStatus: 'pending', postingKind: 'movement', businessApprovedById: 2,
  businessApprovedBy: '业务甲', capabilities: { reversalSupported: true }, ...fields,
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
let wrapper
let payload
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  Object.assign(auth, { user: { id: 9, realName: '财务乙' }, canViewInventoryApproval: true, canApproveInventoryApproval: true, canReverseInventoryApproval: true })
  payload = {
    movement: posting(), reversal: null, postings: [],
    events: [{ postingDocumentId: 101, eventType: 'business_approved', actorLabel: '业务甲' }],
  }
  mocks.getBySource.mockImplementation(async () => ({ data: structuredClone(payload) }))
  mocks.get.mockImplementation(async id => ({ data: {
    ...structuredClone([payload.movement, payload.reversal, ...(payload.postings || [])].find(item => item?.id === id)),
    total_value: '20.246912', transaction_date: '2026-10-15', movement_direction: 'in',
    lines: [{ id: 1, line_no: 1, material_code: 'MAT-001', material_name: '物料甲',
      material_specs: 'SPEC-A', unit_name: '个', location_name: '成品仓', batch_number: 'BATCH-01',
      signed_quantity: 2, unit_cost: '10.123456', total_value: '20.246912' }],
  } }))
  mocks.approve.mockImplementation(async () => { payload.movement.financeStatus = 'approved' })
  mocks.reject.mockImplementation(async () => { payload.movement.financeStatus = 'rejected' })
  mocks.reverse.mockImplementation(async () => { payload.reversal = posting(102, { postingKind: 'reversal' }) })
  mocks.confirm.mockResolvedValue('confirm')
  mocks.prompt.mockResolvedValue({ value: '核对库存成本' })
})
afterEach(() => wrapper?.unmount())
async function openPanel(props = {}) {
  wrapper = mount(InventoryApprovalPanel, { props: { sourceType: 'inbound', sourceId: 11, sourceNo: 'IN-11', ...props }, global })
  await flushPromises()
}
const findButton = text => wrapper.findAll('button').find(item => item.text() === text)
async function click(text) {
  const target = findButton(text)
  expect(target).toBeDefined()
  await target.trigger('click')
  await flushPromises()
}

describe('inline inventory finance approval', () => {
  test('shows source history without mutation controls to a finance reader', async () => {
    auth.canApproveInventoryApproval = false
    auth.canReverseInventoryApproval = false
    await openPanel()
    expect(wrapper.text()).toContain('PST-101')
    expect(wrapper.text()).toContain('业务审核完成')
    expect(wrapper.findAll('button').map(item => item.text())).toEqual(['刷新'])
    expect(wrapper.emitted('loaded').at(-1)).toEqual(['pending'])
  })

  test('does not request financial data without view permission', async () => {
    auth.canViewInventoryApproval = false
    await openPanel()
    expect(mocks.getBySource).not.toHaveBeenCalled()
    expect(mocks.get).not.toHaveBeenCalled()
    expect(wrapper.find('section').exists()).toBe(false)
  })

  test('does not leave a placeholder for a source with no posting', async () => {
    payload.movement = null
    payload.events = []
    await openPanel()
    expect(wrapper.find('section').exists()).toBe(false)
    expect(mocks.get).not.toHaveBeenCalled()
  })

  test('loads the exact posting cost details before allowing approval', async () => {
    const details = deferred()
    mocks.get.mockReturnValueOnce(details.promise)
    await openPanel()
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(101)
    expect(findButton('财务审核')).toBeUndefined()
    details.resolve({ data: { ...posting(), totalValue: '20.246912', lines: [{
      material_code: 'FROZEN-001', material_name: '已提交物料', material_specs: 'SPEC-B',
      signed_quantity: -2, unit_cost: '10.123456', total_value: '20.246912', batch_number: 'LOT-9',
    }] } })
    await flushPromises()
    expect(wrapper.find('[data-test="posting-lines"]').text()).toContain('FROZEN-001')
    expect(wrapper.find('[data-column="批次"]').text()).toBe('LOT-9')
    expect(wrapper.find('[data-column="单位成本（元）"]').text()).toBe('10.123456')
    expect(wrapper.find('[data-column="变动金额（元）"]').text()).toBe('-20.25')
    expect(findButton('财务审核').attributes('disabled')).toBeUndefined()
  })

  test.each([
    { lines: [] },
    { totalValue: '***', lines: [{ signedQuantity: 2, unitCost: '***', totalValue: '***' }] },
    { totalValue: 20, lines: [{ signedQuantity: 2, unitCost: null, totalValue: 20 }] },
  ])('does not permit blind approval with unreviewable costs: %j', async fields => {
    mocks.get.mockResolvedValueOnce({ data: { ...posting(), totalValue: 20, ...fields } })
    await openPanel()
    expect(findButton('财务审核').attributes('disabled')).toBeDefined()
    expect(findButton('驳回').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').text()).toContain('不能通过审核')
    if (fields.totalValue === '***') {
      expect(wrapper.text()).toContain('无权限')
      expect(wrapper.find('[data-column="单位成本（元）"]').text()).toBe('无权限')
    }
    await click('财务审核')
    expect(mocks.approve).not.toHaveBeenCalled()
    await click('驳回')
    expect(mocks.reject).toHaveBeenCalledExactlyOnceWith(101, { remark: '核对库存成本' })
  })

  test('keeps actions unavailable after a detail failure and supports retry', async () => {
    mocks.get.mockRejectedValueOnce(new Error('成本明细读取失败'))
    await openPanel()
    expect(wrapper.find('[role="alert"]').text()).toContain('成本明细读取失败')
    expect(findButton('财务审核')).toBeUndefined()
    await click('刷新')
    expect(findButton('财务审核')).toBeDefined()
  })

  test.each([{ id: 999 }, { financeStatus: 'approved' }])('rejects stale or mismatched posting details: %j', async fields => {
    mocks.get.mockResolvedValueOnce({ data: { ...posting(), ...fields } })
    await openPanel()
    expect(wrapper.find('[role="alert"]').text()).toContain('审核状态已变化')
    expect(findButton('财务审核')).toBeUndefined()
    expect(wrapper.find('[data-test="posting-lines"]').exists()).toBe(false)
  })

  test('approves the displayed posting and refreshes its state and the parent document', async () => {
    await openPanel()
    await click('财务审核')
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith(101)
    expect(mocks.getBySource).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('changed')).toHaveLength(1)
    expect(wrapper.emitted('loaded').at(-1)).toEqual(['approved'])
    expect(findButton('财务审核')).toBeUndefined()
  })

  test('trims rejection reasons and exposes the rejected status after success', async () => {
    mocks.prompt.mockResolvedValue({ value: '  成本需要重核  ' })
    await openPanel()
    await click('驳回')
    expect(mocks.reject).toHaveBeenCalledExactlyOnceWith(101, { remark: '成本需要重核' })
    expect(wrapper.text()).toContain('已驳回')
    expect(wrapper.text()).not.toContain('重新提交审核')
  })

  test.each(['', '   ', 'x'.repeat(1001)])('does not submit an invalid reason', async reason => {
    mocks.prompt.mockResolvedValue({ value: reason })
    await openPanel()
    await click('驳回')
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  test.each(['cancel', 'close'])('treats dialog %s as cancellation', async reason => {
    mocks.confirm.mockRejectedValue(reason)
    await openPanel()
    await click('财务审核')
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
    expect(findButton('财务审核').attributes('disabled')).toBeUndefined()
  })

  test('records a reversal request without presenting it as a completed reversal', async () => {
    payload.movement.financeStatus = 'approved'
    await openPanel()
    await click('反审')
    expect(mocks.reverse).toHaveBeenCalledExactlyOnceWith(101, { remark: '核对库存成本' })
    expect(mocks.success).toHaveBeenCalledWith('反审核申请已提交，待独立财务审核')
    expect(wrapper.text()).toContain('反审待审核')
    expect(wrapper.text()).not.toContain('已反审')
    expect(wrapper.find('.approval-panel__meta').text()).toContain('反审待审核')
    expect(wrapper.find('.approval-panel__meta').text()).toContain('过账号：PST-102')
    expect(wrapper.find('.approval-panel__meta').text()).toContain('原过账号：PST-101')
    expect(mocks.get).toHaveBeenLastCalledWith(102)
  })

  test('reports the reversal actor and time even when the source has no reversal document', async () => {
    payload.movement = posting(101, { financeStatus: 'reversed', reversedLabel: '冲销人', reversedAt: '2026-10-15T08:30:00', financeApprovedAt: '2026-10-14T09:00:00' })
    await openPanel()
    expect(wrapper.text()).toContain('已反审')
    expect(wrapper.text()).not.toContain('未审核')
    expect(wrapper.text()).toContain('2026-10-15 08:30:00')
    expect(wrapper.text()).not.toContain('2026-10-14 09:00:00')
  })

  test('identifies historical reversal events and supplement sources with mixed id types', async () => {
    payload.postings = [
      posting(90, { postingKind: 'reversal', sourceNo: 'IN-11-REV-1', financeStatus: 'rejected' }),
      posting(91, { sourceType: 'outbound_supplement', sourceNo: 'OUT-11-S1' }),
    ]
    payload.events = [
      { postingDocumentId: '90', eventType: 'finance_rejected', fromStatus: 'pending', toStatus: 'rejected', actorLabel: '财务丙', remark: '原申请理由不符' },
      { postingDocumentId: '91', eventType: 'finance_approved', fromStatus: 'pending', toStatus: 'approved', actorLabel: '财务丁' },
    ]
    await openPanel()
    const history = wrapper.find('.approval-panel__events').text()
    expect(history).toContain('反审核驳回')
    expect(history).toContain('PST-90 · 仓库入库 IN-11-REV-1')
    expect(history).toContain('未审核 → 已驳回')
    expect(history).toContain('PST-91 · 出库补发 OUT-11-S1')
    expect(history).toContain('未审核 → 已审')
  })

  test('hides reversal when the backend does not support the source', async () => {
    payload.movement = posting(101, { financeStatus: 'approved', capabilities: { reversalSupported: false } })
    await openPanel()
    expect(findButton('反审')).toBeUndefined()
  })

  test.each([{ businessApprovedById: 9 }, { businessApprovedBy: '财务乙' }])('blocks self review: %j', async actor => {
    Object.assign(payload.movement, actor)
    await openPanel()
    expect(findButton('财务审核').attributes('disabled')).toBeDefined()
    await click('财务审核')
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.approve).not.toHaveBeenCalled()
  })

  test.each(['businessApprovedById', 'financeApprovedBy'])('blocks the original %s from reviewing a reversal', async field => {
    payload.movement[field] = 9
    payload.reversal = posting(102, { postingKind: 'reversal', businessApprovedById: 3 })
    await openPanel()
    expect(findButton('通过反审').attributes('disabled')).toBeDefined()
  })

  test('prevents double submission while confirmation is open', async () => {
    const confirmation = deferred()
    mocks.confirm.mockReturnValue(confirmation.promise)
    await openPanel()
    await click('财务审核')
    await click('财务审核')
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    confirmation.resolve('confirm')
    await flushPromises()
    expect(mocks.approve).toHaveBeenCalledTimes(1)
  })

  test.each(['财务审核', '驳回', '反审'])('cancels an unconfirmed %s after switching source documents', async label => {
    const confirmation = deferred()
    if (label === '反审') payload.movement.financeStatus = 'approved'
    if (label === '财务审核') mocks.confirm.mockReturnValue(confirmation.promise)
    else mocks.prompt.mockReturnValue(confirmation.promise)
    await openPanel()
    await click(label)
    payload.movement = posting(202)
    await wrapper.setProps({ sourceId: 22, sourceNo: 'IN-22' })
    await flushPromises()
    confirmation.resolve(label === '财务审核' ? 'confirm' : { value: '核对成本' })
    await flushPromises()
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(mocks.reverse).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('PST-202')
  })

  test('closing and reopening the same document invalidates the previous confirmation', async () => {
    const confirmation = deferred()
    mocks.confirm.mockReturnValue(confirmation.promise)
    await openPanel()
    await click('财务审核')
    await wrapper.setProps({ active: false })
    await wrapper.setProps({ active: true })
    await flushPromises()
    confirmation.resolve('confirm')
    await flushPromises()
    expect(mocks.approve).not.toHaveBeenCalled()
  })

  test('changing the signed-in reviewer invalidates an outstanding confirmation', async () => {
    const confirmation = deferred()
    mocks.confirm.mockReturnValue(confirmation.promise)
    await openPanel()
    await click('财务审核')
    auth.user = { id: 10, realName: '财务丙' }
    await flushPromises()
    confirmation.resolve('confirm')
    await flushPromises()
    expect(mocks.approve).not.toHaveBeenCalled()
  })

  test('ignores an older source response and emits only the current status', async () => {
    const first = deferred()
    mocks.getBySource.mockReturnValueOnce(first.promise)
    await openPanel()
    payload.movement = posting(202, { financeStatus: 'rejected' })
    await wrapper.setProps({ sourceId: 22, sourceNo: 'IN-22' })
    await flushPromises()
    first.resolve({ data: { movement: posting(101) } })
    await flushPromises()
    expect(wrapper.text()).toContain('PST-202')
    expect(wrapper.text()).not.toContain('PST-101')
    expect(wrapper.emitted('loaded').at(-1)).toEqual(['rejected'])
  })

  test('ignores frozen details returned after switching source documents', async () => {
    const details = deferred()
    mocks.get.mockReturnValueOnce(details.promise)
    await openPanel()
    payload.movement = posting(202)
    await wrapper.setProps({ sourceId: 22, sourceNo: 'IN-22' })
    await flushPromises()
    details.resolve({ data: { ...posting(101), lines: [{ materialCode: 'STALE-COST' }] } })
    await flushPromises()
    expect(wrapper.text()).toContain('PST-202')
    expect(wrapper.text()).not.toContain('STALE-COST')
    expect(findButton('财务审核').attributes('disabled')).toBeUndefined()
  })

  test.each(['财务审核', '驳回', '反审'])('refreshes committed state after a failed %s response before allowing another action', async label => {
    const kind = { 财务审核: 'approve', 驳回: 'reject', 反审: 'reverse' }[label]
    if (kind === 'reverse') payload.movement.financeStatus = 'approved'
    mocks[kind].mockImplementationOnce(async () => {
      payload.movement.financeStatus = 'reversed'
      throw Object.assign(new Error('当前单据已被处理'), { response: { status: 409 } })
    })
    await openPanel()
    await click(label)
    expect(mocks.getBySource).toHaveBeenCalledTimes(2)
    expect(mocks[kind]).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('已反审')
    expect(wrapper.findAll('button').map(item => item.text())).toEqual(['刷新'])
    expect(wrapper.emitted('changed')).toHaveLength(1)
    expect(mocks.success).not.toHaveBeenCalled()
  })

  test('clears stale actions after a read failure and allows retry', async () => {
    await openPanel()
    mocks.getBySource.mockRejectedValueOnce(new Error('读取失败'))
    await wrapper.setProps({ sourceId: 22 })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('读取失败')
    expect(wrapper.text()).not.toContain('PST-101')
    expect(wrapper.findAll('button').map(item => item.text())).toEqual(['刷新'])
    await click('刷新')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  test('a refresh failure does not misreport a committed approval as failed', async () => {
    await openPanel()
    mocks.getBySource.mockRejectedValueOnce(new Error('网络断开'))
    await click('财务审核')
    expect(mocks.success).toHaveBeenCalledWith('财务审核通过，已确认入账')
    expect(mocks.error).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toContain('网络断开')
    expect(findButton('财务审核')).toBeUndefined()
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  test('normalizes legacy fields and counts only the latest pending movement per outbound group', async () => {
    payload.movement = { id: 103, posting_no: 'PST-103', source_type: 'outbound_supplement', source_no: 'OUT-11-S1', finance_status: 'pending' }
    payload.postings = [
      { id: 100, posting_kind: 'movement', source_type: 'outbound', source_no: 'OUT-11', posting_sequence: 1, finance_status: 'pending' },
      { id: 101, posting_kind: 'movement', source_type: 'outbound', source_no: 'OUT-11', posting_sequence: 2, finance_status: 'pending' },
      { id: 103, posting_kind: 'movement', source_type: 'outbound_supplement', source_no: 'OUT-11-S1', finance_status: 'pending' },
    ]
    await openPanel({ sourceType: 'outbound', sourceNo: 'OUT-11' })
    expect(wrapper.text()).toContain('PST-103')
    expect(wrapper.text()).toContain('补发单号：OUT-11-S1')
    expect(wrapper.text()).toContain('待审核：2 笔')
  })
})
