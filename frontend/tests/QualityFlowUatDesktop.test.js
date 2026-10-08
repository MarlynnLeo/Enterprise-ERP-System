import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import FirstArticleInspection from '@/views/quality/FirstArticleInspection.vue'
import FirstArticleInspectDialog from '@/views/quality/components/FirstArticleInspectDialog.vue'
import FinalInspection from '@/views/quality/FinalInspection.vue'
import ProcessInspection from '@/views/quality/ProcessInspection.vue'

vi.mock('@/views/quality/components/FirstArticleRulesDialog.vue', () => ({ default: { name: 'FirstArticleRulesDialog', template: '<div />' } }))
vi.mock('@/views/quality/components/FirstArticleCreateDialog.vue', () => ({ default: { name: 'FirstArticleCreateDialog', template: '<div />' } }))
vi.mock('@/views/quality/components/FirstArticleViewDialog.vue', () => ({ default: { name: 'FirstArticleViewDialog', template: '<div />' } }))
vi.mock('@/views/quality/components/ProcessInspectionRulesDialog.vue', () => ({ default: { name: 'ProcessInspectionRulesDialog', template: '<div />' } }))

// UAT contracts intentionally assert the required business behavior. Failed
// contracts are retained as defects, not converted into tests of the bug.
// API boundaries are doubles; all action handlers and validators below are real.
const mocks = vi.hoisted(() => ({
  firstList: vi.fn(), firstDetail: vi.fn(), firstUpdate: vi.fn(),
  finalList: vi.fn(), finalDetail: vi.fn(), finalUpdate: vi.fn(), rework: vi.fn(),
  processList: vi.fn(), processDetail: vi.fn(), processUpdate: vi.fn(), punch: vi.fn(),
  confirm: vi.fn(), push: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
  allowed: true
}))
vi.mock('@/api/quality', () => ({ qualityApi: {
  getFirstArticleInspections: mocks.firstList, getFirstArticleInspection: mocks.firstDetail,
  updateFirstArticleResult: mocks.firstUpdate, getFirstArticleStats: async () => ({ data: {} }),
  getProcessInspections: mocks.processList, getProcessInspection: mocks.processDetail,
  updateProcessInspection: mocks.processUpdate, punchProcessInspection: mocks.punch,
  getProcessInspectionStats: async () => ({ data: {} })
} }))
vi.mock('@/api', () => ({
  qualityApi: { getFinalInspections: mocks.finalList, getFinalInspection: mocks.finalDetail,
    updateFinalInspection: mocks.finalUpdate, getReworkStatusByInspectionIds: mocks.rework,
    getFinalInspectionStats: async () => ({ data: {} }) },
  productionApi: { getProductionTasks: async () => ({ data: { list: [] } }) }, purchaseApi: {}
}))
vi.mock('@/api/production', () => ({ productionApi: {
  getProductionTasks: async () => ({ data: { list: [] } }),
  getProductionProcesses: async () => ({ data: { list: [] } })
} }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({
  userId: 42, realName: 'UAT 检验员', user: { realName: 'UAT 检验员' },
  isAdmin: false, hasPermission: () => mocks.allowed
}) }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ groups: {}, isLoaded: false, fetchDictionary: async () => {} }) }))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('@/components/AttachmentUpload.vue', () => ({ default: { template: '<div />' } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: mocks.confirm } }))

const wrappers = []
const mountPage = async (component, props = {}) => {
  const wrapper = shallowMount(component, { props, global: {
    config: { warnHandler: () => {} }, directives: { permission: () => {}, loading: () => {} },
    stubs: { AppDialog: true, PageHeader: true, FinanceQueryCard: true, ElTable: true,
      ElDescriptions: true, ElForm: true, ElTableColumn: true,
      CreateDialog: true, InspectDialog: true, ViewDialog: true, RulesDialog: true }
  } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
const row = { isFullInspection: true, sampleQuantity: 100, id: 601, inspectionNo: 'UAT-601', quantity: 100, qualifiedQuantity: 90,
  unqualifiedQuantity: 10, status: 'partial', unit: '件', batchNo: 'UAT-BATCH' }
const dimension = (extra = {}) => ({ id: 1, itemName: '轴径', type: 'dimension', standard: '10 ± 0.1 mm',
  dimensionValue: 10, toleranceLower: -0.1, toleranceUpper: 0.1, isCritical: false,
  actualValue: '10', result: 'passed', ...extra })
const setFinalDetail = (items, extra = {}) => mocks.finalDetail.mockResolvedValue({ data: { ...row, items, ...extra } })

beforeEach(() => {
  mocks.allowed = true
  mocks.firstList.mockResolvedValue({ data: { list: [{ ...row, firstArticleResult: 'pending' }], total: 1 } })
  mocks.firstDetail.mockResolvedValue({ data: { ...row, items: [dimension()], firstArticleResult: 'pending' } })
  mocks.firstUpdate.mockResolvedValue({ data: {} })
  mocks.finalList.mockResolvedValue({ data: { list: [row], total: 1 } })
  setFinalDetail([dimension()])
  mocks.finalUpdate.mockResolvedValue({ data: {} })
  mocks.rework.mockResolvedValue({ data: { 601: { hasNcp: true, hasRework: true,
    reworkCompleted: true, allowReinspection: true, reinspectionId: 602, reinspectionStatus: 'pending' } } })
  mocks.processList.mockResolvedValue({ data: { list: [], total: 0 } })
  mocks.processDetail.mockResolvedValue({ data: { ...row, items: [dimension()] } })
  mocks.processUpdate.mockResolvedValue({ data: {} })
  mocks.punch.mockResolvedValue({ data: {} })
  mocks.confirm.mockResolvedValue('confirm')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  await flushPromises()
})

describe('首检列表到真实检验项目', () => {
  test('D01 检验按钮先读取详情并传入模板项目', async () => {
    const wrapper = await mountPage(FirstArticleInspection)
    await wrapper.vm.handleInspect({ ...row, firstArticleResult: 'pending' })
    expect(mocks.firstDetail).toHaveBeenCalledWith(601)
    expect(wrapper.vm.currentInspection.items).toHaveLength(1)
  })
  test('D02 查看详情读取详情而不是只传列表行', async () => {
    const wrapper = await mountPage(FirstArticleInspection)
    await wrapper.vm.handleView({ ...row, firstArticleResult: 'pending' })
    expect(mocks.firstDetail).toHaveBeenCalledWith(601)
    expect(wrapper.vm.currentInspection.items).toHaveLength(1)
  })
  test('D03 详情读取失败时不得打开空项目检验弹窗', async () => {
    mocks.firstDetail.mockRejectedValue({ response: { status: 403, data: { message: '无权读取该检验单' } } })
    const wrapper = await mountPage(FirstArticleInspection)
    await wrapper.vm.handleInspect({ ...row, firstArticleResult: 'pending' })
    expect(wrapper.vm.showInspectDialog).toBe(false)
    expect(mocks.error).toHaveBeenCalled()
  })
  test('D04 首检列表筛选与重置同步正确查询条件', async () => {
    const wrapper = await mountPage(FirstArticleInspection)
    wrapper.vm.searchKeyword = 'UAT-601'
    wrapper.vm.statusFilter = 'pending'
    wrapper.vm.dateRange = ['2026-09-01', '2026-09-30']
    wrapper.vm.currentPage = 4
    wrapper.vm.handleSearch()
    await flushPromises()
    expect(mocks.firstList).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1, keyword: 'UAT-601', status: 'pending', startDate: '2026-09-01', endDate: '2026-09-30'
    }))
    wrapper.vm.handleReset()
    await flushPromises()
    expect(mocks.firstList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, keyword: undefined, status: undefined }))
  })
  test('D05 首检标准值在编辑字段中可见', async () => {
    const wrapper = await mountPage(FirstArticleInspectDialog, {
      visible: true, inspection: { ...row, items: [dimension()], firstArticleResult: 'pending' }
    })
    expect(wrapper.vm.form.items[0].standardValue).toBe('10 ± 0.1 mm')
  })
  test('D06 首检必填规则绑定实际编辑的 camel 字段', async () => {
    const wrapper = await mountPage(FirstArticleInspectDialog, { visible: true, inspection: { ...row, items: [] } })
    expect(wrapper.vm.rules.firstArticleResult).toEqual(expect.arrayContaining([expect.objectContaining({ required: true })]))
    expect(wrapper.vm.rules.inspectorName).toEqual(expect.arrayContaining([expect.objectContaining({ required: true })]))
  })
})

describe('成品检验快捷按钮及保存保真', () => {
  test('D07 全部合格不得替空白尺寸生成名义实测值', async () => {
    setFinalDetail([dimension({ actualValue: '', result: '' })])
    const wrapper = await mountPage(FinalInspection)
    await wrapper.vm.handleInspect(row)
    wrapper.vm.handleAllPassed()
    expect(wrapper.vm.inspectForm.items[0].actualValue).toBe('')
    expect(wrapper.vm.inspectForm.items[0].result).not.toBe('passed')
  })
  test('D08 全部合格不得将已超差实测改判为通过', async () => {
    setFinalDetail([dimension({ actualValue: '12', result: 'failed' })])
    const wrapper = await mountPage(FinalInspection)
    await wrapper.vm.handleInspect(row)
    wrapper.vm.handleAllPassed()
    expect(wrapper.vm.inspectForm.items[0]).toMatchObject({ actualValue: '12', result: 'failed' })
  })
  test('D09 全部合格不得抹去已记录的不良数量', async () => {
    setFinalDetail([dimension({ actualValue: '12', result: 'failed' })])
    const wrapper = await mountPage(FinalInspection)
    await wrapper.vm.handleInspect(row)
    wrapper.vm.handleAllPassed()
    expect(wrapper.vm.inspectForm.unqualifiedQuantity).toBe(10)
  })
  test('D10 保存保留六次测量、零样本、测量方法与扩展样本', async () => {
    const samples = { method: '数显卡尺', measure1: 0, measure2: 10, measure3: 10.01,
      measure4: 10.02, measure5: 9.99, measure6: 10, measurements: [{ sampleIndex: 7, measuredValue: 10.03 }] }
    setFinalDetail([dimension(samples)], { qualifiedQuantity: 100, unqualifiedQuantity: 0 })
    const wrapper = await mountPage(FinalInspection)
    await wrapper.vm.handleInspect(row)
    wrapper.vm.$.setupState.inspectFormRef = { validate: async () => true }
    await wrapper.vm.submitInspection()
    expect(mocks.finalUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.finalUpdate.mock.calls[0][1].items[0]).toMatchObject(samples)
  })
  test('D11 实测数值零载入后不会被转为空值', async () => {
    setFinalDetail([dimension({ actualValue: 0, dimensionValue: 0 })])
    const wrapper = await mountPage(FinalInspection)
    await wrapper.vm.handleInspect(row)
    expect(wrapper.vm.inspectForm.items[0].actualValue).toBe(0)
  })
  test('D12 名义值零的超差仍参与尺寸判定', async () => {
    const wrapper = await mountPage(FinalInspection)
    const item = dimension({ actualValue: '1', dimensionValue: 0, result: '' })
    wrapper.vm.checkFqcTolerance(item)
    expect(item.result).toBe('failed')
  })
  test('D13 返工状态403应明确显示权限错误而非待处置', async () => {
    mocks.rework.mockRejectedValue({ response: { status: 403, data: { message: '缺少返工查看权限' } } })
    const wrapper = await mountPage(FinalInspection)
    expect(wrapper.vm.getReworkHintText(601)).toMatch(/权限|失败|无法/)
  })
  test('D14 详情403不得打开成品检验弹窗并保留错误原因', async () => {
    mocks.finalDetail.mockRejectedValue({ response: { status: 403, data: { message: '无权读取该检验单' } } })
    const wrapper = await mountPage(FinalInspection)
    await wrapper.vm.handleInspect(row)
    expect(wrapper.vm.inspectDialogVisible).toBe(false)
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('无权读取该检验单'))
  })
  test('D15 普通提交遇到空实测必须阻止API写入', async () => {
    setFinalDetail([dimension({ actualValue: '', result: 'passed' })])
    const wrapper = await mountPage(FinalInspection)
    await wrapper.vm.handleInspect(row)
    wrapper.vm.$.setupState.inspectFormRef = { validate: async () => true }
    await wrapper.vm.submitInspection()
    expect(mocks.finalUpdate).not.toHaveBeenCalled()
    expect(mocks.warning).toHaveBeenCalledWith('请填写所有检验项的实际值')
  })
  test('D16 提交中重复点击只发出一次请求', async () => {
    setFinalDetail([dimension()], { qualifiedQuantity: 100, unqualifiedQuantity: 0 })
    const wrapper = await mountPage(FinalInspection)
    await wrapper.vm.handleInspect(row)
    wrapper.vm.$.setupState.inspectFormRef = { validate: async () => true }
    let finish
    mocks.finalUpdate.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const first = wrapper.vm.submitInspection()
    await flushPromises()
    await wrapper.vm.submitInspection()
    expect(mocks.finalUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.warning).toHaveBeenCalledWith('正在提交中，请勿重复操作')
    finish({ data: {} })
    await first
  })
})

describe('过程检验结束判定与操作错误', () => {
  test('D17 全部合格不得覆盖原有一个项目不合格的事实', async () => {
    const wrapper = await mountPage(ProcessInspection)
    await wrapper.vm.handleJudge({ ...row, items: [dimension(), dimension({ id: 2, actualValue: '12', result: 'failed' })] })
    const payload = mocks.processUpdate.mock.calls[0]?.[1]
    expect(payload?.items?.[1]?.result === 'failed' || !payload).toBe(true)
  })
  test('D18 数值项目未测量不得点击合格完成', async () => {
    const wrapper = await mountPage(ProcessInspection)
    await wrapper.vm.handleJudge({ ...row, items: [dimension({ actualValue: null, result: '' })] })
    expect(mocks.processUpdate).not.toHaveBeenCalled()
  })
  test('D19 关闭判定弹窗不会等同不合格提交', async () => {
    mocks.confirm.mockRejectedValue('close')
    const wrapper = await mountPage(ProcessInspection)
    await wrapper.vm.handleJudge({ ...row, items: [dimension()] })
    expect(mocks.processUpdate).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })
  test('D20 没有检验项目时不允许快捷结案', async () => {
    mocks.processDetail.mockResolvedValue({ data: { ...row, items: [] } })
    const wrapper = await mountPage(ProcessInspection)
    await wrapper.vm.handleJudge(row)
    expect(mocks.processUpdate).not.toHaveBeenCalled()
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('没有检验项目'))
  })
  test('D21 打卡429向操作员显示频次限制', async () => {
    mocks.punch.mockRejectedValue({ response: { status: 429, data: { message: '10分钟内不允许重复打卡' } } })
    const wrapper = await mountPage(ProcessInspection)
    await wrapper.vm.handlePunchIn(row)
    expect(mocks.warning).toHaveBeenCalledWith('10分钟内不允许重复打卡')
    expect(mocks.success).not.toHaveBeenCalled()
  })
  test('D22 无检验权限用户的新建和执行能力均关闭', async () => {
    mocks.allowed = false
    const wrapper = await mountPage(ProcessInspection)
    expect(wrapper.vm.canCreate).toBe(false)
    expect(wrapper.vm.canInspect).toBe(false)
  })
})

describe('过程逐项表单修复回归', () => {
  test('读取详情后仅开表单，不在打开时提交判定', async () => {
    const wrapper = await mountPage(ProcessInspection)
    await wrapper.vm.handleJudge(row)
    expect(wrapper.vm.judgeDialogVisible).toBe(true)
    expect(wrapper.vm.judgeForm.items[0].actualValue).toBe('10')
    expect(mocks.processUpdate).not.toHaveBeenCalled()
  })
  test('保留不同项目结论并以90/10提交partial', async () => {
    mocks.processDetail.mockResolvedValue({ data: { ...row, items: [dimension(), dimension({ id: 2, actualValue: '12', result: 'failed', method: '卡尺' })] } })
    const wrapper = await mountPage(ProcessInspection)
    await wrapper.vm.handleJudge(row)
    await wrapper.vm.submitJudge()
    expect(mocks.processUpdate).toHaveBeenCalledWith(601, expect.objectContaining({
      status: 'partial', qualifiedQuantity: 90, unqualifiedQuantity: 10,
      items: [expect.objectContaining({ result: 'passed' }), expect.objectContaining({ actualValue: '12', result: 'failed', method: '卡尺' })]
    }))
  })
  test('缺实测时点击提交仍不能发请求', async () => {
    mocks.processDetail.mockResolvedValue({ data: { ...row, items: [dimension({ actualValue: '' })] } })
    const wrapper = await mountPage(ProcessInspection)
    await wrapper.vm.handleJudge(row)
    await wrapper.vm.submitJudge()
    expect(mocks.processUpdate).not.toHaveBeenCalled()
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('实测值'))
  })
  test('超差改判合格提交时重新校验，100/0不能通过', async () => {
    mocks.processDetail.mockResolvedValue({ data: { ...row, qualifiedQuantity: 100, unqualifiedQuantity: 0, items: [dimension({ actualValue: '12', result: 'passed' })] } })
    const wrapper = await mountPage(ProcessInspection)
    await wrapper.vm.handleJudge(row)
    await wrapper.vm.submitJudge()
    expect(mocks.processUpdate).not.toHaveBeenCalled()
    expect(wrapper.vm.judgeForm.items[0].result).toBe('failed')
  })
  test('返工操作进入本检验的不良处置页面', async () => {
    const wrapper = await mountPage(ProcessInspection)
    wrapper.vm.handleRework(row)
    expect(mocks.push).toHaveBeenCalledWith({ path: '/quality/nonconforming', query: { inspection_id: 601 } })
  })
})


const aqlSnapshot = { isFullInspection: false, isAql: true, aqlStandardId: 9, sampleQuantity: 20, aqlLevel: 1, acceptLimit: 1, rejectLimit: 2 }
describe('inspection sampling completion contracts', () => {
  test.each([['final', FinalInspection], ['process', ProcessInspection]])('%s cannot complete missing AQL and submits selected standard snapshot', async (kind, component) => {
    const detail = { ...row, qualifiedQuantity: 100, unqualifiedQuantity: 0, isFullInspection: false, isAql: true, aqlStandardId: null, sampleQuantity: null, items: [dimension()] }
    const api = kind === 'final' ? mocks.finalUpdate : mocks.processUpdate
    ;(kind === 'final' ? mocks.finalDetail : mocks.processDetail).mockResolvedValue({ data: detail })
    const wrapper = await mountPage(component)
    if (kind === 'final') { await wrapper.vm.handleInspect(row); wrapper.vm.$.setupState.inspectFormRef = { validate: async () => true } }
    else await wrapper.vm.handleJudge(row)
    const submit = kind === 'final' ? wrapper.vm.submitInspection : wrapper.vm.submitJudge
    await submit()
    expect(api).not.toHaveBeenCalled()
    wrapper.vm.inspectionSampling = { ...aqlSnapshot }
    await flushPromises()
    await submit()
    expect(api).toHaveBeenCalledWith(601, expect.objectContaining(aqlSnapshot))
  })
  test('first article carries selected sampling fields to its dedicated result API', async () => {
    const wrapper = await mountPage(FirstArticleInspectDialog, { visible: true, inspection: { ...row, qualifiedQuantity: 100, unqualifiedQuantity: 0, items: [dimension()], firstArticleResult: 'passed', isFullInspection: false, isAql: true } })
    wrapper.vm.$.setupState.formRef = { validate: async () => true }
    await wrapper.vm.handleSubmit()
    expect(mocks.firstUpdate).not.toHaveBeenCalled()
    wrapper.vm.inspectionSampling = { ...aqlSnapshot }
    await flushPromises()
    await wrapper.vm.handleSubmit()
    expect(mocks.firstUpdate).toHaveBeenCalledWith(601, expect.objectContaining(aqlSnapshot))
  })
})
