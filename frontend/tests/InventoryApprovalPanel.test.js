import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import InventoryApprovalPanel from '@/components/inventory/InventoryApprovalPanel.vue'

const mocks = vi.hoisted(() => ({
  getBySource: vi.fn(), approve: vi.fn(), reject: vi.fn(), reverse: vi.fn(),
  confirm: vi.fn(), prompt: vi.fn(), warning: vi.fn(), success: vi.fn(), error: vi.fn(),
}))
const auth = reactive({ user: null, canViewInventoryApproval: true, canApproveInventoryApproval: true, canReverseInventoryApproval: false })
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/api/finance', () => ({ financeApi: { inventoryPostings: mocks } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: mocks }))

const slotStub = { template: '<div><slot /></div>' }
const buttonStub = {
  props: ['loading', 'disabled'], emits: ['click'],
  template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot /></button>',
}
let wrapper
let payload

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  Object.assign(auth, {
    user: { id: 7, realName: '财务审核员', username: 'finance-reviewer' },
    canViewInventoryApproval: true, canApproveInventoryApproval: true, canReverseInventoryApproval: false,
  })
  payload = {
    movement: { id: 101, financeStatus: 'pending', businessApprovedById: 2, businessApprovedBy: '业务审核员', postingNo: 'POST-101' },
    reversal: null, events: [], postings: [],
  }
  mocks.getBySource.mockImplementation(async () => ({ data: structuredClone(payload) }))
  mocks.confirm.mockResolvedValue('confirm')
  mocks.prompt.mockResolvedValue({ value: '退回核实' })
  mocks.approve.mockResolvedValue({})
  mocks.reject.mockResolvedValue({})
})
afterEach(() => wrapper?.unmount())

const openPanel = async (props = {}) => {
  wrapper = mount(InventoryApprovalPanel, {
    props: { sourceType: 'outbound', sourceId: 101, ...props },
    global: {
      stubs: {
        ElButton: buttonStub, ElTag: slotStub, ElSteps: slotStub, ElTimeline: slotStub,
        ElTimelineItem: slotStub,
        ElStep: { props: ['title'], template: '<div>{{ title }}<slot name="description" /></div>' },
      },
      directives: { permission: () => {}, loading: () => {} },
    },
  })
  await flushPromises()
}
const reviewButtons = () => wrapper.findAll('button').filter(button => ['财务审核通过', '驳回'].includes(button.text()))
const expectApprovalHidden = () => {
  expect(wrapper.find('.inventory-approval-panel').exists()).toBe(false)
  expect(wrapper.find('.approval-panel__title').exists()).toBe(false)
  expect(reviewButtons()).toHaveLength(0)
  expect(wrapper.find('.approval-panel__actions').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('当前用户已完成该单据的业务审核')
  expect(mocks.warning).not.toHaveBeenCalled()
}

describe('inventory finance approval panel visibility', () => {
  test('hides the entire panel from readers without any approval action permission', async () => {
    auth.canApproveInventoryApproval = false
    await openPanel()
    expectApprovalHidden()
  })

  test('requires view permission even when the user has approval permission', async () => {
    auth.canViewInventoryApproval = false
    await openPanel()
    expectApprovalHidden()
    expect(mocks.getBySource).not.toHaveBeenCalled()
  })

  test.each([
    { businessApprovedById: '7', businessApprovedBy: '历史业务审核名称' },
    { businessApprovedById: null, businessApprovedBy: ' 财务审核员 ' },
    { businessApprovedById: null, businessApprovedBy: 'finance-reviewer' },
  ])('hides the entire panel for the business approver: %j', async (actor) => {
    Object.assign(payload.movement, actor)
    auth.canReverseInventoryApproval = true
    await openPanel()
    expectApprovalHidden()
  })

  test('normalizes legacy snake_case identities before deciding visibility', async () => {
    payload.movement = { id: 101, finance_status: 'pending', business_approved_by_id: 7, business_approved_by: '历史名称' }
    await openPanel()
    expectApprovalHidden()
  })

  test.each(['approved', 'rejected', 'reversed'])('hides the panel for %s records with no available action', async (status) => {
    payload.movement.financeStatus = status
    await openPanel()
    expectApprovalHidden()
  })

  test.each(['requester', 'businessApprover', 'financeApprover'])('hides reversal approval actions for the original %s', async (actor) => {
    Object.assign(payload.movement, { financeStatus: 'approved', financeApprovedBy: 3, financeApprovedLabel: '原财务审核员' })
    payload.reversal = { id: 102, financeStatus: 'pending', businessApprovedById: 4, businessApprovedBy: '反审核申请人' }
    auth.user.id = { requester: 4, businessApprover: 2, financeApprover: 3 }[actor]
    await openPanel()
    expectApprovalHidden()
  })

  test.each([['财务审核通过', 'approve'], ['驳回', 'reject']])('keeps %s usable for an eligible finance reviewer', async (label, action) => {
    await openPanel()
    expect(wrapper.get('.approval-panel__title').text()).toBe('财务审核')
    expect(wrapper.text()).toContain('待财务审核')
    expect(reviewButtons().map(button => button.text())).toEqual(['财务审核通过', '驳回'])
    await reviewButtons().find(button => button.text() === label).trigger('click')
    await flushPromises()
    expect(mocks[action]).toHaveBeenCalledWith(101, action === 'reject' ? { remark: '退回核实' } : undefined)
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  test('hides the entire panel immediately when approval permission is revoked', async () => {
    await openPanel()
    auth.canApproveInventoryApproval = false
    await nextTick()
    expectApprovalHidden()
  })

  test('does not send an approval after permission is revoked during confirmation', async () => {
    let confirm
    mocks.confirm.mockImplementation(() => new Promise(resolve => { confirm = resolve }))
    await openPanel()
    await reviewButtons()[0].trigger('click')
    auth.canApproveInventoryApproval = false
    await nextTick()
    confirm()
    await flushPromises()
    expectApprovalHidden()
    expect(mocks.approve).not.toHaveBeenCalled()
  })

  test('shows approved records to users who can request reversal', async () => {
    auth.canApproveInventoryApproval = false
    auth.canReverseInventoryApproval = true
    payload.movement.financeStatus = 'approved'
    await openPanel()
    expect(wrapper.get('.approval-panel__title').text()).toBe('财务审核')
    expect(wrapper.text()).toContain('已审核')
    expect(wrapper.findAll('button').map(button => button.text())).toContain('申请反审核')
    expect(reviewButtons()).toHaveLength(0)
  })

  test('keeps resubmission available when the document permits it', async () => {
    payload.movement.financeStatus = 'rejected'
    await openPanel({ resubmitStatus: 'completed' })
    expect(wrapper.get('.approval-panel__title').text()).toBe('财务审核')
    expect(wrapper.text()).toContain('已驳回')
    const resubmit = wrapper.findAll('button').find(button => button.text() === '重新提交审核')
    await resubmit.trigger('click')
    expect(wrapper.emitted('resubmit')).toEqual([['completed']])
  })

  test('keeps the eligible panel in place while refreshing its status', async () => {
    await openPanel()
    let finishRefresh
    mocks.getBySource.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve }))
    const refresh = wrapper.vm.refresh()
    await nextTick()
    expect(wrapper.find('.inventory-approval-panel').exists()).toBe(true)
    expect(reviewButtons()).toHaveLength(0)
    finishRefresh({ data: structuredClone(payload) })
    await refresh
    await nextTick()
    expect(reviewButtons()).toHaveLength(2)
  })
})
