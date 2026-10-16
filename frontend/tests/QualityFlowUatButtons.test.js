import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, inject, provide } from 'vue'
import ReviewDialog from '@/views/quality/components/ReviewDialog.vue'
import IncomingInspection from '@/views/quality/IncomingInspection.vue'
import NonconformingProducts from '@/views/quality/NonconformingProducts.vue'
import ReworkTasks from '@/views/quality/ReworkTasks.vue'

const mocks = vi.hoisted(() => ({
  incomingList: vi.fn(), incomingDetail: vi.fn(), incomingUpdate: vi.fn(), reworkStatus: vi.fn(),
  ncpList: vi.fn(), ncpDisposition: vi.fn(), ncpApprove: vi.fn(), ncpComplete: vi.fn(),
  reworkList: vi.fn(), reworkDetail: vi.fn(), assign: vi.fn(), complete: vi.fn(), reworkUpdate: vi.fn(),
  push: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
  permissions: new Set()
}))
vi.mock('@/api', () => ({ qualityApi: {
  getIncomingInspections: mocks.incomingList, getIncomingInspection: mocks.incomingDetail,
  updateIncomingInspection: mocks.incomingUpdate, getReworkStatusByInspectionIds: mocks.reworkStatus,
  getIncomingInspectionStats: async () => ({ data: {} })
}, baseDataApi: {}, purchaseApi: {} }))
vi.mock('@/api/quality', () => ({ qualityApi: { getIncomingInspection: mocks.incomingDetail, getReworkStatusByInspectionIds: mocks.reworkStatus, reworkTasks: {
  getList: mocks.reworkList, getDetail: mocks.reworkDetail, getStatistics: async () => ({ data: {} }),
  assign: mocks.assign, complete: mocks.complete, update: mocks.reworkUpdate
} } }))
vi.mock('@/api/nonconformingProductApi', () => ({ default: {
  getList: mocks.ncpList, getStatistics: async () => ({ data: {} }),
  updateDisposition: mocks.ncpDisposition, approveConcession: mocks.ncpApprove, completeHandling: mocks.ncpComplete
} }))
vi.mock('@/utils/optionLoaders', () => ({ searchSupplierOptions: async () => [] }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({
  isAdmin: false, user: { realName: 'UAT 检验员' }, hasPermission: permission => mocks.permissions.has(permission)
}) }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ groups: {}, getOptions: () => [] }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }), useRoute: () => ({ query: {} }) }))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: async () => 'confirm', alert: async () => {} } }))

// These adapters render the actual page's scoped row slots and native buttons.
// They replace layout only: page v-if, handler bindings and permission keys remain real.
const PassThrough = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
const Table = defineComponent({ props: ['data'], setup(props, { slots }) {
  provide('uatRows', () => props.data || [])
  return () => h('div', { class: 'uat-table' }, slots.default?.())
} })
const TableColumn = defineComponent({ props: ['prop'], setup(props, { slots }) {
  const rows = inject('uatRows', () => [])
  return () => h('div', rows().map((row, index) => h('div', slots.default
    ? slots.default({ row, $index: index }) : String(row[props.prop] ?? ''))))
} })
const Button = defineComponent({ props: ['disabled'], setup(props, { slots, attrs }) {
  return () => h('button', { ...attrs, disabled: props.disabled }, slots.default?.())
} })
const Dialog = defineComponent({ props: ['modelValue'], setup(props, { slots }) {
  return () => props.modelValue ? h('section', [slots.default?.(), slots.footer?.()]) : null
} })
const wrappers = []
const mountPage = async (component, props = {}, extraStubs = {}) => {
  const wrapper = mount(component, { props, global: {
    config: { warnHandler: () => {} },
    directives: { loading: () => {}, permission: (el, binding) => { el.hidden = !(Array.isArray(binding.value) ? binding.value : [binding.value]).some(p => mocks.permissions.has(p)) } },
    stubs: { AppDialog: Dialog, PageHeader: true, FinanceQueryCard: true,
      ElCard: PassThrough, ElTable: Table, ElTableColumn: TableColumn, ElButton: Button,
      ElDescriptions: PassThrough, ElForm: PassThrough,
      CreateInspectionDialog: true, InspectDialog: true, ReviewDialog: true, DetailDialog: true,
      ReportDialog: true, AttachmentUpload: true, ...extraStubs }
  } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
const visibleButtons = wrapper => wrapper.findAll('button').filter(button => !button.element.hidden).map(button => button.text().trim())
const click = async (wrapper, label) => {
  const button = wrapper.findAll('button').find(button => button.text().trim() === label && !button.element.hidden)
  expect(button, `visible button ${label}`).toBeTruthy()
  await button.trigger('click')
  await flushPromises()
}
const original = { isFullInspection: true, sampleQuantity: 100, id: 701, inspectionNo: 'IQC-UAT-701', status: 'failed', quantity: 100,
  qualifiedQuantity: 0, unqualifiedQuantity: 100, materialName: 'UAT零件', itemName: 'UAT零件', unit: '件' }
const ncp = { id: 801, ncpNo: 'NCP-UAT-801', status: 'pending', disposition: 'pending', quantity: 10 }
const rework = { id: 901, reworkNo: 'RW-UAT-901', status: 'pending', reworkCost: 0 }
beforeEach(() => {
  mocks.permissions = new Set(['quality:inspections:update', 'quality:nonconforming:update',
    'quality:nonconforming:delete', 'quality:nonconforming:approve', 'quality:rework:update'])
  mocks.incomingList.mockResolvedValue({ data: { list: [original], total: 1 } })
  mocks.incomingDetail.mockResolvedValue({ data: { ...original, items: [
    { id: 1, itemName: '外观', standard: '无划伤', actualValue: '×', type: 'appearance', result: 'failed' }
  ] } })
  mocks.incomingUpdate.mockResolvedValue({ data: { id: 701 } })
  mocks.reworkStatus.mockResolvedValue({ data: { 701: { hasNcp: true, hasRework: true,
    allowReinspection: true, reinspectionId: 702, reinspectionStatus: 'pending' } } })
  mocks.ncpList.mockResolvedValue({ data: { list: [ncp], total: 1 } })
  mocks.ncpDisposition.mockResolvedValue({ data: {} })
  mocks.ncpApprove.mockResolvedValue({ data: {} })
  mocks.ncpComplete.mockResolvedValue({ data: {} })
  mocks.reworkList.mockResolvedValue({ data: { list: [rework], total: 1 } })
  mocks.assign.mockResolvedValue({ data: {} })
  mocks.complete.mockResolvedValue({ data: { reinspectionId: 702 } })
  mocks.reworkUpdate.mockResolvedValue({ data: {} })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

describe('来料复检按钮与独立复检去向', () => {
  test('B01 failed且返工完成时复检按钮可用', async () => {
    const wrapper = await mountPage(IncomingInspection)
    expect(visibleButtons(wrapper)).toContain('复检')
  })
  test('B02 partial且返工完成时也必须提供复检按钮', async () => {
    mocks.incomingList.mockResolvedValue({ data: { list: [{ ...original, status: 'partial', qualifiedQuantity: 90, unqualifiedQuantity: 10 }], total: 1 } })
    const wrapper = await mountPage(IncomingInspection)
    expect(visibleButtons(wrapper)).toContain('复检')
  })
  test('B03 点击复检应转到独立复检单702而不是原单701', async () => {
    const wrapper = await mountPage(IncomingInspection)
    await click(wrapper, '复检')
    expect(wrapper.vm.currentRow.id).toBe(702)
  })
  test('B04 来料复检弹窗使用独立复检数量和单号', async () => {
    const wrapper = await mountPage(IncomingInspection, {}, { ReviewDialog: false })
    await click(wrapper, '复检')
    expect(mocks.incomingDetail).toHaveBeenCalledWith(702)
  })
  test('仅来料更新权限也可打开并看到独立复检提交按钮', async () => {
    mocks.permissions = new Set(['quality:incoming:update'])
    const wrapper = await mountPage(IncomingInspection, {}, { ReviewDialog: false })
    await click(wrapper, '复检')
    expect(visibleButtons(wrapper)).toContain('提交复检')
  })
  test('B05 来料复检状态403应显示读取失败而非待处置', async () => {
    mocks.reworkStatus.mockRejectedValue({ response: { status: 403, data: { message: '无返工查看权限' } } })
    const wrapper = await mountPage(IncomingInspection)
    expect(wrapper.vm.getReworkHintText(701)).toMatch(/权限|失败|无法/)
  })
  test('B06 无更新权限时不可见来料复检按钮', async () => {
    mocks.permissions.delete('quality:inspections:update')
    const wrapper = await mountPage(IncomingInspection)
    expect(visibleButtons(wrapper)).not.toContain('复检')
  })
})

describe('不合格品决策与审批按钮', () => {
  test('B07 待处理单提供处理决策和申请特采但没有完成处理', async () => {
    const wrapper = await mountPage(NonconformingProducts)
    expect(visibleButtons(wrapper)).toEqual(expect.arrayContaining(['处理决策', '申请特采', '删除']))
    expect(visibleButtons(wrapper)).not.toContain('完成处理')
    await click(wrapper, '处理决策')
    expect(wrapper.vm.disposeDialogVisible).toBe(true)
  })
  test('B08 未填写处置与原因点击提交应阻止API', async () => {
    const wrapper = await mountPage(NonconformingProducts)
    await click(wrapper, '处理决策')
    await click(wrapper, '提交处理决策')
    expect(mocks.ncpDisposition).not.toHaveBeenCalled()
    expect(mocks.warning).toHaveBeenCalledWith('请填写处理方式和处理原因')
  })
  test('B09 特采待审单只能审批不能完成处理或重复申请', async () => {
    mocks.ncpList.mockResolvedValue({ data: { list: [{ ...ncp, status: 'processing', concessionStatus: 'pending' }], total: 1 } })
    const wrapper = await mountPage(NonconformingProducts)
    expect(visibleButtons(wrapper)).toContain('特采审批')
    expect(visibleButtons(wrapper)).not.toContain('完成处理')
    expect(visibleButtons(wrapper)).not.toContain('申请特采')
    await click(wrapper, '特采审批')
    expect(wrapper.vm.approveConcessionDialogVisible).toBe(true)
  })
  test('B10 只有编辑权限没有批准权限时不显示特采审批', async () => {
    mocks.permissions.delete('quality:nonconforming:approve')
    mocks.ncpList.mockResolvedValue({ data: { list: [{ ...ncp, status: 'processing', concessionStatus: 'pending' }], total: 1 } })
    const wrapper = await mountPage(NonconformingProducts)
    expect(visibleButtons(wrapper)).not.toContain('特采审批')
  })
  test('B11 处置API业务原因应向操作员准确显示', async () => {
    mocks.ncpDisposition.mockRejectedValue({ response: { status: 400, data: { message: '可处置数量不足，已有10件在返工中' } } })
    const wrapper = await mountPage(NonconformingProducts)
    await click(wrapper, '处理决策')
    wrapper.vm.disposeForm.disposition = 'rework'
    wrapper.vm.disposeForm.disposition_reason = '修复划伤'
    await click(wrapper, '提交处理决策')
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('可处置数量不足'))
  })
})

describe('返工任务分配完成按钮', () => {
  test('B12 pending只允许分配和编辑，不能直接完成返工', async () => {
    const wrapper = await mountPage(ReworkTasks)
    expect(visibleButtons(wrapper)).toEqual(expect.arrayContaining(['分配任务', '编辑']))
    expect(visibleButtons(wrapper)).not.toContain('完成返工')
    await click(wrapper, '分配任务')
    expect(wrapper.vm.assignDialogVisible).toBe(true)
    await click(wrapper, '确认分配')
    expect(mocks.assign).not.toHaveBeenCalled()
    expect(mocks.warning).toHaveBeenCalledWith('请输入负责人')
  })
  test('B13 in_progress可完成返工并保留零成本', async () => {
    mocks.reworkList.mockResolvedValue({ data: { list: [{ ...rework, status: 'in_progress' }], total: 1 } })
    const wrapper = await mountPage(ReworkTasks)
    expect(visibleButtons(wrapper)).toContain('完成返工')
    expect(visibleButtons(wrapper)).not.toContain('分配任务')
    await click(wrapper, '完成返工')
    expect(wrapper.vm.completeForm.reworkCost).toBe(0)
    await click(wrapper, '确认完成')
    expect(mocks.complete).toHaveBeenCalledWith(901, expect.objectContaining({ reworkCost: 0 }))
  })
  test('B14 completed返工不再显示分配、编辑或完成操作', async () => {
    mocks.reworkList.mockResolvedValue({ data: { list: [{ ...rework, status: 'completed' }], total: 1 } })
    const wrapper = await mountPage(ReworkTasks)
    expect(visibleButtons(wrapper)).not.toEqual(expect.arrayContaining(['分配任务']))
    expect(visibleButtons(wrapper)).not.toContain('编辑')
    expect(visibleButtons(wrapper)).not.toContain('完成返工')
  })
})


test('完成返工后可从行按钮直接进入独立复检', async () => {
  mocks.reworkList.mockResolvedValue({ data: { list: [{ ...rework, status: 'completed' }], total: 1 } })
  mocks.reworkDetail.mockResolvedValue({ data: { ...rework, inspectionId: 701, reinspectionId: 702 } })
  mocks.incomingDetail.mockResolvedValue({ data: { id: 702, inspectionType: 'incoming', quantity: 10 } })
  const wrapper = await mountPage(ReworkTasks)
  await click(wrapper, '进入复检')
  expect(mocks.incomingDetail).toHaveBeenCalledWith(702)
  expect(mocks.push).toHaveBeenCalledWith({ path: '/quality/incoming', query: { inspectionId: 702 } })
})


test('incoming independent reinspection blocks missing AQL then carries the selected standard', async () => {
  mocks.incomingDetail.mockResolvedValue({ data: { ...original, id: 702, status: 'pending', isFullInspection: false, isAql: true, aqlStandardId: null, sampleQuantity: null, items: [{ id: 1, itemName: '外观', standard: '无划伤', type: 'appearance', actualValue: '', result: '' }] } })
  const wrapper = await mountPage(IncomingInspection, {}, { ReviewDialog: false })
  await click(wrapper, '复检')
  const review = wrapper.findComponent(ReviewDialog)
  review.vm.$.setupState.reviewFormRef = { validate: async () => true }
  Object.assign(review.vm.reviewForm, { qualifiedQuantity: 100, unqualifiedQuantity: 0, reviewReason: '返工复检' })
  Object.assign(review.vm.reviewForm.items[0], { actualValue: '√', result: 'passed' })
  await review.vm.handleSubmit()
  expect(mocks.incomingUpdate).not.toHaveBeenCalled()
  const sampling = { isFullInspection: false, isAql: true, aqlStandardId: 9, aqlLevel: 1, sampleQuantity: 20, acceptLimit: 1, rejectLimit: 2 }
  review.vm.inspectionSampling = sampling
  await flushPromises()
  review.vm.$.setupState.reviewFormRef = { validate: async () => true }
  await review.vm.handleSubmit()
  expect(mocks.incomingUpdate).toHaveBeenCalledWith(702, expect.objectContaining(sampling))
})
