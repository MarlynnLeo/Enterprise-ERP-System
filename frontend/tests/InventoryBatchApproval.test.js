import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { computed, defineComponent, h, inject, provide, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import InventoryBatchApproval from '@/components/inventory/InventoryBatchApproval.vue'

const mocks = vi.hoisted(() => ({ getBySource: vi.fn(), get: vi.fn(), batchApprove: vi.fn(), warning: vi.fn() }))
const auth = reactive({ user: { id: 9, username: 'finance', realName: '财务乙' }, canViewInventoryApproval: true, canApproveInventoryApproval: true })
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/api/finance', () => ({ financeApi: { inventoryPostings: mocks } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))

const slot = { template: '<div><slot /></div>' }
const button = { props: ['loading', 'disabled'], emits: ['click'], template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot /></button>' }
const dialog = { props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<section v-if="modelValue" role="dialog"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>' }
const table = defineComponent({
  props: ['data'],
  setup(props, { slots }) {
    provide('batchRows', computed(() => props.data))
    return () => h('div', { 'data-test': 'posting-table' }, slots.default?.())
  },
})
const column = defineComponent({
  props: ['prop', 'label'],
  setup(props, { slots }) {
    const rows = inject('batchRows')
    return () => h('div', { 'data-column': props.label }, rows.value.map(row => h('div', slots.default ? slots.default({ row }) : String(row[props.prop] ?? ''))))
  },
})
const global = { stubs: {
  AppDialog: dialog, ElButton: button, ElTag: slot, ElTable: table, ElTableColumn: column,
  ElAlert: { props: ['title'], template: '<aside role="alert">{{ title }}</aside>' },
} }
const posting = (id = 101, fields = {}) => ({
  id, postingNo: `PST-${id}`, sourceType: 'inbound', sourceId: 11, sourceNo: 'IN-11',
  financeStatus: 'pending', postingKind: 'movement', businessApprovedById: 2, businessApprovedBy: '业务甲',
  totalValue: '20.246912', movementDirection: 'in', transactionDate: '2026-10-16',
  lines: [{ materialCode: 'FROZEN-001', materialName: '已提交物料', materialSpecs: 'SPEC-A',
    locationName: '成品仓', batchNumber: 'LOT-9', unitName: '个', signedQuantity: 2,
    unitCost: '10.123456', totalValue: '20.246912' }], ...fields,
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
let wrapper
beforeEach(() => {
  vi.resetAllMocks()
  auth.user = { id: 9, username: 'finance', realName: '财务乙' }
  auth.canViewInventoryApproval = true
  auth.canApproveInventoryApproval = true
  mocks.getBySource.mockResolvedValue({ data: { movement: posting() } })
  mocks.get.mockResolvedValue({ data: posting() })
  mocks.batchApprove.mockResolvedValue({ data: { results: [{ id: 101, success: true }] } })
})
afterEach(() => { wrapper?.unmount(); wrapper = null })
const mountBatch = (props = {}) => {
  wrapper = mount(InventoryBatchApproval, { props: { selectedRows: [{ id: 11, inboundNo: 'IN-11' }], sourceType: 'inbound', sourceNoKey: 'inboundNo', ...props }, global })
  return wrapper
}
const findButton = text => wrapper.findAll('button').find(item => item.text() === text)
async function click(text) {
  const target = findButton(text)
  expect(target).toBeDefined()
  await target.trigger('click')
  await flushPromises()
}
async function openPreview(props = {}) {
  mountBatch(props)
  await click('批量财务审批')
}

describe('inventory batch approval interaction', () => {
  test.each(['canViewInventoryApproval', 'canApproveInventoryApproval'])('hides the action without %s and makes no request', async permission => {
    auth[permission] = false
    mountBatch()
    await flushPromises()
    expect(wrapper.find('button').exists()).toBe(false)
    expect(mocks.getBySource).not.toHaveBeenCalled()
    expect(mocks.batchApprove).not.toHaveBeenCalled()
  })

  test('hides the toolbar until rows are selected and hides it again when cleared', async () => {
    mountBatch({ selectedRows: [] })
    expect(wrapper.find('.inventory-batch-approval').exists()).toBe(false)
    expect(findButton('批量财务审批')).toBeUndefined()
    await wrapper.setProps({ selectedRows: [{ id: 11, inboundNo: 'IN-11' }] })
    expect(findButton('批量财务审批')).toBeDefined()
    expect(wrapper.text()).toContain('已选 1 张单据')
    await wrapper.setProps({ selectedRows: [] })
    expect(wrapper.find('.inventory-batch-approval').exists()).toBe(false)
    expect(mocks.getBySource).not.toHaveBeenCalled()
    expect(mocks.batchApprove).not.toHaveBeenCalled()
  })

  test('disables preview while the selected page is loading', async () => {
    mountBatch({ disabled: true })
    expect(findButton('批量财务审批').attributes('disabled')).toBeDefined()
    await click('批量财务审批')
    expect(mocks.getBySource).not.toHaveBeenCalled()
  })

  test('keeps approval results visible after the refreshed list clears its selection', async () => {
    await openPreview()
    await click('确认通过 1 笔')
    await wrapper.setProps({ selectedRows: [] })
    expect(findButton('批量财务审批')).toBeUndefined()
    expect(wrapper.find('.inventory-batch-approval__toolbar').exists()).toBe(false)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('成功 1 笔')
    await click('关闭')
    expect(wrapper.find('.inventory-batch-approval').exists()).toBe(false)
    expect(mocks.batchApprove).toHaveBeenCalledTimes(1)
  })

  test('emits clear without approving any selected document', async () => {
    mountBatch()
    await click('清空选择')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(mocks.batchApprove).not.toHaveBeenCalled()
  })

  test('previews exact frozen posting values and only submits after explicit confirmation', async () => {
    const detail = deferred()
    mocks.get.mockReturnValueOnce(detail.promise)
    await openPreview()
    expect(wrapper.text()).toContain('正在核对')
    expect(findButton('确认通过 0 笔').attributes('disabled')).toBeDefined()
    expect(mocks.getBySource).toHaveBeenCalledExactlyOnceWith({ sourceType: 'inbound', sourceId: 11, sourceNo: 'IN-11' })
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(101)
    expect(mocks.batchApprove).not.toHaveBeenCalled()
    detail.resolve({ data: posting() })
    await flushPromises()
    expect(wrapper.text()).toContain('PST-101')
    expect(wrapper.text()).toContain('FROZEN-001')
    expect(wrapper.find('[data-column="单位成本（元）"]').text()).toBe('10.123456')
    expect(wrapper.find('[data-column="批次"]').text()).toBe('LOT-9')
    await click('确认通过 1 笔')
    expect(mocks.batchApprove).toHaveBeenCalledExactlyOnceWith({ ids: [101] })
    expect(wrapper.text()).toContain('成功 1 笔')
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  test('deduplicates repeated selected business ids before preview or submission', async () => {
    await openPreview({ selectedRows: [{ id: 11, inboundNo: 'IN-11' }, { id: '11', inboundNo: 'IN-11' }] })
    expect(mocks.getBySource).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('已选择 1 张业务单据')
    await click('确认通过 1 笔')
    expect(mocks.batchApprove).toHaveBeenCalledExactlyOnceWith({ ids: [101] })
  })

  test.each([
    [{ businessApprovedById: 9 }, '必须分离'],
    [{ totalValue: '***' }, '无权查看完整存货成本'],
    [{ financeStatus: 'approved' }, '已变化'],
    [{ id: 999 }, '已变化'],
  ])('shows why an unreviewable posting is skipped: %j', async (fields, reason) => {
    mocks.get.mockResolvedValue({ data: posting(101, fields) })
    await openPreview()
    expect(wrapper.text()).toContain(reason)
    expect(wrapper.text()).toContain('跳过 1 项')
    expect(findButton('确认通过 0 笔').attributes('disabled')).toBeDefined()
    await click('确认通过 0 笔')
    expect(mocks.batchApprove).not.toHaveBeenCalled()
    if (fields.totalValue === '***') expect(wrapper.text()).toContain('无权限')
  })

  test('skips a reversal request without fetching or approving its lines', async () => {
    mocks.getBySource.mockResolvedValue({ data: { movement: posting(), reversal: posting(202, { postingKind: 'reversal' }) } })
    await openPreview()
    expect(wrapper.text()).toContain('正在反审核或已冲销')
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.batchApprove).not.toHaveBeenCalled()
  })

  test('previews and submits every latest pending supplement exactly once', async () => {
    const outbound = (id, fields = {}) => posting(id, { sourceType: 'outbound_supplement', sourceNo: `OUT-11-S${id}`, ...fields })
    const current = [outbound(102), outbound(103)]
    mocks.getBySource.mockResolvedValue({ data: { movement: current[0], postings: [
      outbound(99, { sourceType: 'outbound', sourceNo: 'OUT-11', financeStatus: 'approved' }),
      outbound(100, { sourceNo: 'OUT-11-S102', financeStatus: 'rejected' }), ...current,
    ] } })
    mocks.get.mockImplementation(async id => ({ data: current.find(row => row.id === id) }))
    await openPreview({ sourceType: 'outbound', sourceNoKey: 'outboundNo', selectedRows: [{ id: 11, outboundNo: 'OUT-11' }] })
    expect(mocks.get.mock.calls).toEqual([[102], [103]])
    await click('确认通过 2 笔')
    expect(mocks.batchApprove).toHaveBeenCalledExactlyOnceWith({ ids: [102, 103] })
  })

  test('keeps partial success, explicit failure, and missing results separate', async () => {
    const records = [101, 102, 103].map(id => posting(id, { sourceType: 'outbound_supplement', sourceNo: `OUT-11-S${id}` }))
    mocks.getBySource.mockResolvedValue({ data: { movement: records[0], postings: records } })
    mocks.get.mockImplementation(async id => ({ data: records.find(row => row.id === id) }))
    mocks.batchApprove.mockResolvedValue({ data: { successCount: 3, results: [
      { id: 101, success: true }, { id: 102, success: false, error: '库存不足' },
    ] } })
    await openPreview({ sourceType: 'outbound', sourceNoKey: 'outboundNo', selectedRows: [{ id: 11, outboundNo: 'OUT-11' }] })
    await click('确认通过 3 笔')
    expect(wrapper.text()).toContain('成功 1 笔，失败 1 笔，结果待核对 1 笔')
    expect(wrapper.text()).toContain('库存不足')
    expect(findButton('确认通过 3 笔')).toBeUndefined()
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  test('marks a network failure unknown, never retries automatically, and requires a fresh preview', async () => {
    mocks.batchApprove.mockRejectedValueOnce(new Error('network disconnected'))
    await openPreview()
    await click('确认通过 1 笔')
    expect(wrapper.text()).toContain('成功 0 笔，失败 0 笔，结果待核对 1 笔')
    expect(mocks.batchApprove).toHaveBeenCalledTimes(1)
    expect(findButton('确认通过 1 笔')).toBeUndefined()
    expect(wrapper.emitted('changed')).toHaveLength(1)
    await click('关闭')
    await click('批量财务审批')
    expect(mocks.getBySource).toHaveBeenCalledTimes(2)
    expect(mocks.get).toHaveBeenCalledTimes(2)
    expect(mocks.batchApprove).toHaveBeenCalledTimes(1)
  })

  test('submits only once while the response is pending and locks dialog cancellation', async () => {
    const result = deferred()
    mocks.batchApprove.mockReturnValueOnce(result.promise)
    await openPreview()
    const confirm = findButton('确认通过 1 笔')
    await confirm.trigger('click')
    await confirm.trigger('click')
    expect(mocks.batchApprove).toHaveBeenCalledTimes(1)
    expect(findButton('取消').attributes('disabled')).toBeDefined()
    expect(findButton('清空选择').attributes('disabled')).toBeDefined()
    result.resolve({ results: [{ id: 101, success: true }] })
    await flushPromises()
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  test('cancels a ready preview without submitting', async () => {
    await openPreview()
    await click('取消')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(mocks.batchApprove).not.toHaveBeenCalled()
  })

  test.each(['cancel', 'selection', 'unmount'])('ignores details that resolve after %s invalidates a preview', async action => {
    const detail = deferred()
    mocks.get.mockReturnValueOnce(detail.promise)
    await openPreview()
    if (action === 'cancel') await click('取消')
    if (action === 'selection') await wrapper.setProps({ selectedRows: [{ id: 22, inboundNo: 'IN-22' }] })
    if (action === 'unmount') { wrapper.unmount(); wrapper = null }
    detail.resolve({ data: posting() })
    await flushPromises()
    if (wrapper) expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(mocks.batchApprove).not.toHaveBeenCalled()
  })

  test('selection change closes a completed preview before its old confirmation can submit', async () => {
    await openPreview()
    const confirm = findButton('确认通过 1 笔')
    await wrapper.setProps({ selectedRows: [{ id: 22, inboundNo: 'IN-22' }] })
    await confirm.trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(mocks.batchApprove).not.toHaveBeenCalled()
  })

  test('reopening after cancellation cannot reuse the first preview response', async () => {
    const oldDetail = deferred()
    mocks.get.mockReturnValueOnce(oldDetail.promise)
    await openPreview()
    await click('取消')
    mocks.getBySource.mockResolvedValue({ data: { movement: posting(202) } })
    mocks.get.mockResolvedValue({ data: posting(202) })
    await click('批量财务审批')
    oldDetail.resolve({ data: posting(101) })
    await flushPromises()
    expect(wrapper.text()).toContain('PST-202')
    expect(wrapper.text()).not.toContain('PST-101')
    await click('确认通过 1 笔')
    expect(mocks.batchApprove).toHaveBeenCalledExactlyOnceWith({ ids: [202] })
  })

  test.each(['canViewInventoryApproval', 'canApproveInventoryApproval', 'id', 'username', 'realName', 'name'])(
    'invalidates a ready preview when reviewer %s changes', async field => {
      await openPreview()
      const confirm = findButton('确认通过 1 笔')
      if (field.startsWith('can')) auth[field] = false
      else auth.user[field] = field === 'id' ? 10 : '业务甲'
      await flushPromises()
      await confirm.trigger('click')
      expect(mocks.batchApprove).not.toHaveBeenCalled()
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    },
  )

  test('does not publish a stale result after the signed-in user changes during submission', async () => {
    const result = deferred()
    mocks.batchApprove.mockReturnValueOnce(result.promise)
    await openPreview()
    await click('确认通过 1 笔')
    auth.user = { id: 10, username: 'another-finance', realName: '财务丙' }
    await flushPromises()
    result.resolve({ results: [{ id: 101, success: true }] })
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.emitted('changed')).toBeUndefined()
    expect(mocks.batchApprove).toHaveBeenCalledTimes(1)
  })

  test('does not submit a prepared approval while the parent becomes disabled', async () => {
    await openPreview()
    await wrapper.setProps({ disabled: true })
    expect(findButton('确认通过 1 笔').attributes('disabled')).toBeDefined()
    await click('确认通过 1 笔')
    expect(mocks.batchApprove).not.toHaveBeenCalled()
  })

  test('rejects an oversized selection before requesting any financial data', async () => {
    mountBatch({ selectedRows: Array.from({ length: 101 }, (_, index) => ({ id: index + 1, inboundNo: `IN-${index + 1}` })) })
    await click('批量财务审批')
    expect(mocks.warning).toHaveBeenCalledWith('每次最多选择 100 张单据')
    expect(mocks.getBySource).not.toHaveBeenCalled()
  })

  test.each([100, 101])('enforces the %s posting boundary even for a single business document', async count => {
    const records = Array.from({ length: count }, (_, index) => posting(index + 101, {
      sourceType: 'outbound_supplement', sourceNo: `OUT-11-S${index + 1}`,
    }))
    mocks.getBySource.mockResolvedValue({ data: { movement: records[0], postings: records } })
    mocks.get.mockImplementation(async id => ({ data: records.find(row => row.id === id) }))
    await openPreview({ sourceType: 'outbound', sourceNoKey: 'outboundNo', selectedRows: [{ id: 11, outboundNo: 'OUT-11' }] })
    const confirm = findButton(`确认通过 ${count} 笔`)
    if (count === 101) {
      expect(wrapper.text()).toContain('每次最多审批 100 笔过账')
      expect(confirm.attributes('disabled')).toBeDefined()
      await confirm.trigger('click')
      expect(mocks.batchApprove).not.toHaveBeenCalled()
    } else {
      expect(confirm.attributes('disabled')).toBeUndefined()
      await confirm.trigger('click')
      expect(mocks.batchApprove).toHaveBeenCalledExactlyOnceWith({ ids: records.map(row => row.id) })
      await flushPromises()
    }
  })
})
