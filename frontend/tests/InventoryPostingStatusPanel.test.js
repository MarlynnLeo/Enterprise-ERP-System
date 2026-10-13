import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import InventoryPostingStatusPanel from '@/components/inventory/InventoryPostingStatusPanel.vue'

const mocks = vi.hoisted(() => ({ getBySource: vi.fn(), push: vi.fn() }))
const auth = reactive({ canViewInventoryApproval: true, canApproveInventoryApproval: false })
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/api/finance', () => ({ financeApi: { inventoryPostings: { getBySource: mocks.getBySource } } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))

let wrapper
let payload
const slotStub = { template: '<div><slot /></div>' }
beforeEach(() => {
  vi.clearAllMocks()
  auth.canViewInventoryApproval = true
  auth.canApproveInventoryApproval = false
  payload = {
    movement: { id: 101, postingNo: 'POST-101', financeStatus: 'pending', businessApprovedBy: '制单人' },
    reversal: null, postings: [],
    events: [{ id: 1, postingDocumentId: 101, eventType: 'business_approved', actorLabel: '制单人', createdAt: '2026-10-12 09:00:00' }],
  }
  mocks.getBySource.mockImplementation(async () => ({ data: structuredClone(payload) }))
})
afterEach(() => wrapper?.unmount())

async function openPanel(props = {}) {
  wrapper = mount(InventoryPostingStatusPanel, {
    props: { sourceType: 'outbound', sourceId: 11, sourceNo: 'OUT-11', ...props },
    global: {
      directives: { loading: () => {} },
      stubs: {
        ElButton: { props: ['loading'], template: '<button :disabled="loading"><slot /></button>' },
        ElTag: slotStub, ElTimeline: slotStub, ElTimelineItem: slotStub,
        ElAlert: { props: ['title'], template: '<div role="alert">{{ title }}</div>' },
      },
    },
  })
  await flushPromises()
}

describe('source document inventory posting status', () => {
  test('shows immutable posting history to a finance reader without action permissions', async () => {
    payload.movement.financeStatus = 'approved'
    await openPanel()
    expect(wrapper.text()).toContain('POST-101')
    expect(wrapper.text()).toContain('业务审核完成')
    expect(wrapper.findAll('button').map(button => button.text())).toEqual(['刷新', '查看存货过账'])
    expect(wrapper.emitted('loaded').at(-1)).toEqual(['approved'])
  })

  test('sends the selected posting and source identity to the single workbench', async () => {
    payload.reversal = { id: 102, postingNo: 'REV-11', financeStatus: 'pending' }
    await openPanel()
    expect(wrapper.text()).toContain('冲销待审核')
    await wrapper.findAll('button')[1].trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({
      name: 'finance-inventory-postings',
      query: { sourceType: 'outbound', sourceId: '11', sourceNo: 'OUT-11', postingId: '102' },
    })
  })

  test('does not read finance data or render an empty panel without view permission', async () => {
    auth.canViewInventoryApproval = false
    await openPanel()
    expect(mocks.getBySource).not.toHaveBeenCalled()
    expect(wrapper.find('section').exists()).toBe(false)
  })

  test('does not leave a placeholder when a source has no posting', async () => {
    payload.movement = null
    payload.events = []
    await openPanel()
    expect(wrapper.find('section').exists()).toBe(false)
  })

  test('ignores stale source responses when a different document is selected', async () => {
    let finishFirst
    mocks.getBySource.mockReturnValueOnce(new Promise(resolve => { finishFirst = resolve }))
    await openPanel()
    payload.movement = { id: 202, postingNo: 'POST-202', financeStatus: 'rejected' }
    await wrapper.setProps({ sourceId: 22, sourceNo: 'OUT-22' })
    await flushPromises()
    finishFirst({ data: { movement: { id: 101, postingNo: 'OLD', financeStatus: 'approved' } } })
    await flushPromises()
    expect(wrapper.text()).toContain('POST-202')
    expect(wrapper.text()).not.toContain('OLD')
    expect(wrapper.emitted('loaded').at(-1)).toEqual(['rejected'])
  })

  test('clears old records and exposes a retry after a read failure', async () => {
    await openPanel()
    mocks.getBySource.mockRejectedValueOnce(new Error('读取失败'))
    await wrapper.setProps({ sourceId: 22 })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('POST-101')
    expect(wrapper.findAll('button').map(button => button.text())).toEqual(['刷新'])
  })

  test('normalizes snake fields and counts only the newest movement in each outbound group', async () => {
    payload.movement = { id: 103, posting_no: 'P-103', source_type: 'outbound_supplement', source_no: 'OUT-11-S1', finance_status: 'pending' }
    payload.postings = [
      { id: 100, posting_kind: 'movement', source_type: 'outbound', source_no: 'OUT-11', posting_sequence: 1, finance_status: 'pending' },
      { id: 101, posting_kind: 'movement', source_type: 'outbound', source_no: 'OUT-11', posting_sequence: 2, finance_status: 'pending' },
      { id: 103, posting_kind: 'movement', source_type: 'outbound_supplement', source_no: 'OUT-11-S1', finance_status: 'pending' },
    ]
    await openPanel()
    expect(wrapper.text()).toContain('P-103')
    expect(wrapper.text()).toContain('补发单号：OUT-11-S1')
    expect(wrapper.text()).toContain('待审核：2 笔')
  })
})
