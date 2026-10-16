import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, inject, provide, reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import PurchaseRequisitions from '@/views/purchase/PurchaseRequisitions.vue'
import { usePurchaseOrderForm } from '@/views/purchase/composables/usePurchaseOrderForm'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), fastGet: vi.fn(), post: vi.fn(), put: vi.fn(),
  success: vi.fn(), error: vi.fn(), warning: vi.fn(), confirm: vi.fn(),
}))

// Keep the real API wrapper so submission tests also verify the HTTP contract.
vi.mock('@/services/axiosInstance', () => ({
  api: { get: mocks.get, post: mocks.post, put: mocks.put },
  fastApi: { get: mocks.fastGet },
}))
vi.mock('@/api/baseData', () => ({ baseDataApi: {} }))
vi.mock('@/api', async () => ({
  purchaseApi: (await import('@/api/purchase')).purchaseApi,
  baseDataApi: {}, supplierApi: {}, financeApi: {},
}))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
const auth = reactive({
  user: { realName: '采购员' }, permissions: [],
  hasPermission: (permission) => auth.permissions.includes(permission),
  fetchUserProfile: async () => {},
})
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/utils/optionLoaders', () => ({ loadUserListOptions: async () => [] }))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: mocks.confirm } }))

const slotStub = { template: '<div><slot /></div>' }
const buttonStub = {
  props: ['loading', 'disabled'], emits: ['click'],
  template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot /></button>',
}
const tableStub = {
  props: ['data'],
  setup(props) {
    provide('tableRows', computed(() => props.data || []))
    return { clearSelection: () => {} }
  },
  template: '<div><slot /></div>',
}
const columnStub = {
  setup() { return { rows: inject('tableRows', []) } },
  template: '<div><template v-for="(row, index) in rows"><slot :row="row" :$index="index" /></template></div>',
}

let wrapper
let requisition
const submittedResult = () => ({ data: { id: 42, status: 'completed', generatedOrders: [{ orderNo: 'PO-0042' }] } })

beforeEach(() => {
  setActivePinia(createPinia())
  Object.values(mocks).forEach(mock => mock.mockReset())
  auth.permissions = ['purchase:requisitions:create', 'purchase:requisitions:update']
  requisition = {
    id: 42, requisitionNumber: 'PR-0042', status: 'draft',
    requestDate: '2026-09-30', materials: [{ materialId: 8, materialCode: 'MAT-8', quantity: 3 }],
  }
  mocks.fastGet.mockImplementation(async () => ({ data: { list: [structuredClone(requisition)], total: 1 } }))
  mocks.get.mockImplementation(async () => ({ data: structuredClone(requisition) }))
  mocks.post.mockResolvedValue({ data: { id: 42 } })
  mocks.put.mockImplementation(async (url) => {
    if (url.endsWith('/status')) {
      requisition.status = 'completed'
      requisition.isFullyOrdered = true
      return submittedResult()
    }
    return { data: structuredClone(requisition) }
  })
  mocks.confirm.mockResolvedValue('confirm')
})
afterEach(() => wrapper?.unmount())

const openPage = async () => {
  wrapper = mount(PurchaseRequisitions, {
    global: {
      stubs: {
        PageHeader: slotStub, FinanceQueryCard: true,
        AppDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
        ElTable: tableStub, ElTableColumn: columnStub, ElPagination: true,
        ElButton: buttonStub, ElCard: slotStub, ElRow: slotStub, ElCol: slotStub,
        ElForm: { methods: { validate: async () => true }, template: '<div><slot /></div>' },
        ElFormItem: slotStub, ElInput: true, ElAutocomplete: true, ElDatePicker: true,
        ElIcon: true, ElTag: slotStub, ElDivider: true, ElDescriptions: slotStub, ElDescriptionsItem: slotStub,
      },
      directives: { permission: () => {}, loading: () => {} },
    },
  })
  await flushPromises()
}

const clickButton = async (label) => {
  const button = wrapper.findAll('button').find(item => item.text() === label)
  expect(button, label).toBeDefined()
  await button.trigger('click')
  await flushPromises()
}

const openCreateForm = async () => {
  wrapper.vm.showCreateDialog()
  await flushPromises()
  Object.assign(wrapper.vm.requisitionForm.materials[0], requisition.materials[0])
}

describe('purchase requisition direct submission', () => {
  test('submits a draft from the list and displays the generated order without an approval dialog', async () => {
    await openPage()
    expect(wrapper.text()).not.toMatch(/审核|驳回/)
    await clickButton('提交')
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith('/purchase/requisitions/42/status', { newStatus: 'submitted' })
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.success).toHaveBeenCalledWith('提交成功，已自动生成 1 个采购订单：PO-0042')
    expect(wrapper.text()).toContain('已生成订单')
    expect(wrapper.findAll('button').some(button => button.text() === '提交')).toBe(false)
  })

  test('creates and submits the form in one action while retaining a separate draft action', async () => {
    await openPage()
    await openCreateForm()
    expect(wrapper.text()).toContain('保存草稿')
    await clickButton('提交并生成采购订单')
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith('/purchase/requisitions/42/status', { newStatus: 'submitted' })
    expect(wrapper.vm.requisitionDialog.visible).toBe(false)
  })

  test('saving a draft never generates orders', async () => {
    await openPage()
    await openCreateForm()
    await clickButton('保存草稿')
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.put).not.toHaveBeenCalled()
    expect(mocks.success).toHaveBeenCalledWith('采购申请草稿已保存')
  })

  test('keeps the saved draft after generation fails and retries without creating a duplicate', async () => {
    mocks.put.mockRejectedValueOnce({ response: { data: { message: '物料未设置供应商' } } })
    await openPage()
    await openCreateForm()
    await clickButton('提交并生成采购订单')
    expect(wrapper.vm.requisitionDialog).toMatchObject({ visible: true, isEdit: true, loading: false })
    expect(wrapper.vm.requisitionForm.id).toBe(42)
    expect(mocks.error).toHaveBeenCalledWith('提交失败，草稿已保存：物料未设置供应商')
    await clickButton('提交并生成采购订单')
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.put.mock.calls.map(([url]) => url)).toEqual([
      '/purchase/requisitions/42/status', '/purchase/requisitions/42', '/purchase/requisitions/42/status',
    ])
  })

  test.each(['submitted', 'pending', 'rejected', 'approved'])('allows a legacy %s document to be edited or submitted directly', async (status) => {
    requisition.status = status
    await openPage()
    expect(wrapper.text()).toContain('待提交')
    expect(wrapper.text()).toContain('编辑')
    expect(wrapper.text()).not.toMatch(/审核|驳回/)
    await clickButton('提交')
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith('/purchase/requisitions/42/status', { newStatus: 'submitted' })
  })

  test('does not submit the same row twice while the first request is pending', async () => {
    await openPage()
    let complete
    mocks.put.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const first = wrapper.vm.submitRequisition(requisition)
    await wrapper.vm.submitRequisition(requisition)
    expect(mocks.put).toHaveBeenCalledTimes(1)
    complete(submittedResult())
    await first
    expect(wrapper.vm.submittingIds).toEqual([])
  })

  test('reports batch generation failures while continuing other selected requisitions', async () => {
    await openPage()
    wrapper.vm.handleSelectionChange([requisition, { ...requisition, id: 43, status: 'submitted' }])
    mocks.put.mockRejectedValueOnce({ response: { data: { message: '物料未设置供应商' } } })
    await wrapper.vm.handleBatchSubmit()
    expect(mocks.put).toHaveBeenCalledTimes(2)
    expect(mocks.warning).toHaveBeenCalledWith('已为 1 个申请单生成采购订单，1 个失败：物料未设置供应商')
    expect(wrapper.vm.selectedRequisitions).toEqual([])
    expect(wrapper.vm.batchLoading).toBe(false)
  })

  test('requires update permission for submission, without requiring approval permission', async () => {
    auth.permissions = ['purchase:requisitions:create']
    await openPage()
    await openCreateForm()
    expect(wrapper.text()).not.toContain('提交并生成采购订单')
    await wrapper.vm.submitForm(true)
    await wrapper.vm.submitRequisition(requisition)
    wrapper.vm.handleSelectionChange([requisition])
    await wrapper.vm.handleBatchSubmit()
    expect(mocks.post).not.toHaveBeenCalled()
    expect(mocks.put).not.toHaveBeenCalled()
  })

  test('lets partial orders be completed without editing the linked application', async () => {
    Object.assign(requisition, { status: 'submitted', isPartiallyOrdered: true })
    await openPage()
    expect(wrapper.text()).toContain('部分生成订单')
    expect(wrapper.text()).not.toContain('编辑')
    await clickButton('生成剩余订单')
    expect(mocks.put).toHaveBeenCalledTimes(1)
  })
})

describe('purchase order requisition selection after cancellation', () => {
  test('preserves later pages when the current page only contains fully ordered applications', async () => {
    mocks.get.mockResolvedValueOnce({ data: { list: [
      { ...requisition, status: 'completed', isFullyOrdered: true },
    ], total: 41 } })
    const form = usePurchaseOrderForm()
    await form.loadRequisitions()
    expect(form.requisitionList.value).toEqual([])
    expect(form.requisitionPagination.total).toBe(41)

    form.requisitionPagination.current = 2
    mocks.get.mockResolvedValueOnce({ data: { list: [
      { ...requisition, status: 'submitted' },
    ], total: 41 } })
    await form.loadRequisitions()
    expect(mocks.get).toHaveBeenLastCalledWith('/purchase/order-requisitions', {
      params: expect.objectContaining({ page: 2 }),
    })
    expect(form.requisitionList.value.map(row => row.id)).toEqual([42])
    expect(form.requisitionPagination.total).toBe(41)
  })

  test('includes submitted applications and only the quantity missing from valid orders', async () => {
    mocks.get.mockResolvedValueOnce({ data: { list: [
      { ...requisition, status: 'submitted', materials: [{ materialId: 8, quantity: 10, orderedQuantity: 4 }] },
      { ...requisition, id: 43, status: 'approved' },
      { ...requisition, id: 44, status: 'completed', isFullyOrdered: true },
      { ...requisition, id: 45, status: 'draft' },
    ] } })
    const form = usePurchaseOrderForm()
    await form.loadRequisitions()
    expect(mocks.get).toHaveBeenCalledWith('/purchase/order-requisitions', { params: expect.not.objectContaining({ status: 'approved' }) })
    expect(form.requisitionList.value.map(row => row.id)).toEqual([42, 43])
    expect(form.unorderedMaterialsList.value[0]).toMatchObject({ materialId: 8, quantity: 6, requisitionId: 42 })
  })
})
