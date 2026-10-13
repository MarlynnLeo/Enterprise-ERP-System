import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { reactive } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DatePicker, Field, Picker, showConfirmDialog, showToast } from 'vant'
import { qualityApi } from '@/api'
import { permission } from '@/directives/permission'
import { extractApiPaginated } from '@/utils/apiHelper'
import { buildInspectionItemPayload } from '@/utils/inspectionItemPayload'
import IncomingDetail from '@/views/quality/IncomingDetail.vue'
import FinalList from '@/views/quality/Final.vue'
import ProcessList from '@/views/quality/Process.vue'
import FinalDetail from '@/views/quality/FinalDetail.vue'
import ProcessDetail from '@/views/quality/ProcessDetail.vue'
import CreateFinal from '@/views/quality/CreateFinal.vue'
import CreateProcess from '@/views/quality/CreateProcess.vue'
import ReworkDetail from '@/views/quality/ReworkDetail.vue'
import NonconformanceDetail from '@/views/quality/NonconformanceDetail.vue'

// Regression acceptance for repaired business flows; real Vue/Vant interactions.
// All Vue/Vant children and the permission directive are real; only the transport,
// route/auth session, and confirmation/toast service boundaries are mocked.
const session = vi.hoisted(() => ({ route: null, writable: true }))
const router = vi.hoisted(() => ({ go: vi.fn(), back: vi.fn(), replace: vi.fn(), push: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => session.route, useRouter: () => router }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({
  user: { id: 7, realName: '验收检验员' }, permissionsLoaded: true,
  hasPermission: () => session.writable, hasChildPermission: () => false
}) }))
vi.mock('@/api', () => ({ qualityApi: {
  getReworkTasks: vi.fn(), getReworkTask: vi.fn(), assignReworkTask: vi.fn(), completeReworkTask: vi.fn(), getAqlStandards: vi.fn(), applyConcession: vi.fn(), approveConcession: vi.fn(), getProductionSources: vi.fn(), getIncomingInspection: vi.fn(), getInspectionItems: vi.fn(),
  getInspectionTemplates: vi.fn(), getInspectionTemplate: vi.fn(),
  getFinalInspections: vi.fn(), getProcessInspections: vi.fn(), getFinalInspection: vi.fn(), getProcessInspection: vi.fn(),
  startInspection: vi.fn(), updateIncomingInspection: vi.fn(), completeInspection: vi.fn(),
  createFinalInspection: vi.fn(), createProcessInspection: vi.fn(),
  getNonconformanceRecord: vi.fn(), processNonconformance: vi.fn()
} }))
vi.mock('vant', async importOriginal => ({
  ...await importOriginal(), showToast: vi.fn(), showLoadingToast: vi.fn(),
  closeToast: vi.fn(), showConfirmDialog: vi.fn(async () => {})
}))

const record = (overrides = {}) => ({
  id: 42, inspectionNo: 'UAT-42', status: 'in_progress', quantity: 100,
  qualifiedQuantity: 100, unqualifiedQuantity: 0, sampleQuantity: 100,
  isFullInspection: true, itemName: '验收产品', referenceNo: 'TASK-UAT-42', attachments: [],
  items: [
    { id: 1, itemName: 'UAT尺寸项目', standard: '10±0.1', type: 'dimension', method: '卡尺',
      dimensionValue: 10, toleranceUpper: 0.1, toleranceLower: -0.1,
      actualValue: 10, measure1: 10, result: 'passed', isCritical: false },
    { id: 2, itemName: 'UAT外观项目', standard: '无破损', type: 'visual', method: '目视',
      actualValue: '√', result: 'passed', isCritical: false }
  ], ...overrides
})
const ncp = overrides => ({
  id: 52, ncpNo: 'NCP-UAT-52', quantity: 10, status: 'pending', disposition: 'pending',
  responsibleParty: 'internal', materialName: '验收物料', ...overrides
})
let wrapper
const observations = []
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  session.route = reactive({ params: { id: '42' }, query: {} })
  session.writable = true
  for (const fn of Object.values(qualityApi)) fn.mockReset().mockResolvedValue({ data: {} })
  qualityApi.getIncomingInspection.mockResolvedValue({ data: record() })
  qualityApi.getFinalInspection.mockResolvedValue({ data: record() })
  qualityApi.getProcessInspection.mockResolvedValue({ data: record() })
  qualityApi.getNonconformanceRecord.mockResolvedValue({ data: ncp() })
  qualityApi.getProductionSources.mockResolvedValue({ data: [{ id: 42, code: 'TASK-UAT-42', productId: 12, productName: '验收产品', productCode: 'PRODUCT-UAT', quantity: 100 }] })
  qualityApi.getInspectionTemplates.mockResolvedValue({ data: [{ id: 8, name: '验收模板' }] })
  qualityApi.getInspectionTemplate.mockResolvedValue({ data: { id: 8, items: record().items } })
  showConfirmDialog.mockReset().mockResolvedValue(undefined)
  showToast.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  observations.push({
    test: expect.getState().currentTestName,
    visibleText: wrapper?.text(),
    buttons: wrapper?.findAll('button').map(button => ({ text: button.text(), visible: button.isVisible(), disabled: button.attributes('disabled') !== undefined })),
    fields: wrapper?.findAllComponents(Field).map(field => ({ label: field.props('label'), value: field.props('modelValue'), readonly: field.props('readonly') })),
    calls: Object.fromEntries(Object.entries(qualityApi).filter(([, fn]) => fn.mock.calls.length).map(([key, fn]) => [key, fn.mock.calls])),
    toasts: showToast.mock.calls
  })
  wrapper?.unmount()
  wrapper = undefined
  vi.clearAllTimers()
  vi.useRealTimers()
})
afterAll(() => {
  const directory = resolve(process.cwd(), '../output/quality-flow-uat')
  mkdirSync(directory, { recursive: true })
  writeFileSync(`${directory}/mobile-repaired-observations.json`, JSON.stringify({
    scope: 'Real mounted Vue and Vant components; mocked transport/session/confirmation/toast, no business database writes',
    observations
  }, null, 2))
})
async function open(component) {
  if (component === NonconformanceDetail) session.route.params.id = '52'
  wrapper = mount(component, { global: { directives: { permission }, mocks: { $router: router } } })
  await flushPromises()
  return wrapper
}
function field(label) {
  const found = wrapper.findAllComponents(Field).find(component => component.props('label') === label)
  expect(found, `应存在 ${label} 输入控件`).toBeDefined()
  return found
}
async function input(label, value) {
  await field(label).find('input').setValue(String(value))
  await flushPromises()
}
async function click(text) {
  const button = wrapper.findAll('button').find(component => component.text().includes(text))
  expect(button, `应存在 ${text} 按钮`).toBeDefined()
  expect(button.isVisible(), `${text} 按钮应可见`).toBe(true)
  await button.trigger('click')
  await flushPromises()
}
async function fillCreate() {
  await input('批次号', 'BATCH-UAT')
  await input('产品名称', '验收产品')
  await input('产品编码', 'PRODUCT-UAT')
  await field('关联工单号').trigger('click')
  await flushPromises()
  const sourcePicker = wrapper.findAllComponents(Picker).find(p => p.props('title') === '选择生产任务')
  sourcePicker.vm.$emit('confirm', { selectedOptions: [sourcePicker.props('columns')[0]] })
  await flushPromises()
  const templatePicker = wrapper.findAllComponents(Picker).find(p => p.props('title') === '选择检验模板')
  templatePicker.vm.$emit('confirm', { selectedOptions: [templatePicker.props('columns')[0]] })
  await flushPromises()
  await input('检验数量', 100)
  await field('计划检验日期').trigger('click')
  await flushPromises()
  wrapper.findComponent(DatePicker).vm.$emit('confirm', { selectedValues: ['2026', '09', '30'] })
  await flushPromises()
}
async function submitCreate() {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('Mobile quality UAT / incoming', () => {
  test('M-I01 mixed 90 good and 10 bad must submit partial without changing counts', async () => {
    await open(IncomingDetail)
    await input('合格数量', 90)
    await wrapper.findAll('.inspect-item')[1].find('.btn-fail').trigger('click')
    await click('提交检验')
    expect(qualityApi.updateIncomingInspection).toHaveBeenCalledWith(42, expect.objectContaining({
      qualifiedQuantity: 90, unqualifiedQuantity: 10, status: 'partial'
    }))
  })
  test('M-I02 all good inspection submits actual item measurements with passed', async () => {
    await open(IncomingDetail)
    await click('提交检验')
    expect(qualityApi.updateIncomingInspection).toHaveBeenCalledWith(42, expect.objectContaining({
      qualifiedQuantity: 100, unqualifiedQuantity: 0, status: 'passed',
      items: expect.arrayContaining([expect.objectContaining({ itemName: 'UAT尺寸项目', actualValue: '10', method: '卡尺' })])
    }))
  })
  test('M-I03 unjudged item blocks submission with an actionable message', async () => {
    const data = record()
    Object.assign(data.items[0], { result: null, actualValue: '', measure1: null })
    qualityApi.getIncomingInspection.mockResolvedValue({ data })
    await open(IncomingDetail)
    await click('提交检验')
    expect(qualityApi.updateIncomingInspection).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('还有 1 项未判定')
  })
  test('M-I04 AQL without sampling evidence offers editable sampling configuration or an explicit desktop handoff', async () => {
    qualityApi.getIncomingInspection.mockResolvedValue({ data: record({ isFullInspection: false, sampleQuantity: null, samplingStandardId: null }) })
    await open(IncomingDetail)
    const editableSampling = wrapper.findAllComponents(Field).some(component => /抽样|抽检|AQL/.test(component.props('label') || '') && !component.props('readonly'))
    expect(editableSampling || /电脑.*配置|请先.*抽样|请选择.*抽样/.test(wrapper.text())).toBe(true)
  })
  test('M-I05 submission shows the concrete backend validation message', async () => {
    qualityApi.updateIncomingInspection.mockRejectedValue({ response: { status: 400, data: { message: '抽样标准未配置，请选择有效标准' } } })
    await open(IncomingDetail)
    await click('提交检验')
    expect(showToast).toHaveBeenCalledWith('抽样标准未配置，请选择有效标准')
  })
  test('M-I06 a read-only user cannot see the submit action', async () => {
    session.writable = false
    await open(IncomingDetail)
    expect(wrapper.find('.action-section').isVisible()).toBe(false)
  })
})

for (const [kind, component, getter, startText, submitText] of [
  ['final', FinalDetail, 'getFinalInspection', '开始检测', '提交入库评估并归档'],
  ['process', ProcessDetail, 'getProcessInspection', '开始检验', '提交并完成检验']
]) {
  describe(`Mobile quality UAT / ${kind}`, () => {
    test('M-D01 start button transitions pending to in progress and exposes completion', async () => {
      qualityApi[getter].mockResolvedValue({ data: record({ status: 'pending' }) })
      await open(component)
      await click(startText)
      expect(qualityApi.startInspection).toHaveBeenCalledWith(42)
      expect(wrapper.findAll('button').some(button => button.text().includes(submitText) && button.isVisible())).toBe(true)
    })
    test('M-D02 loaded inspection items and standards must be visible for recording', async () => {
      await open(component)
      expect(wrapper.text()).toContain('UAT尺寸项目')
      expect(wrapper.text()).toContain('10±0.1')
      expect(wrapper.text()).toContain('UAT外观项目')
    })
    test('M-D03 completing an inspection must carry its item and measurement evidence', async () => {
      await open(component)
      await click(submitText)
      expect(qualityApi.completeInspection).toHaveBeenCalledWith(42, expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ itemName: 'UAT尺寸项目', actualValue: '10', measure1: '10', method: '卡尺' })])
      }))
    })
    test('M-D04 entering 90 good and 10 bad must resolve to partial automatically', async () => {
      await open(component)
      await input('合格数量', 90)
      await input('不合格数量', 10)
      await click(submitText)
      expect(qualityApi.completeInspection).toHaveBeenCalledWith(42, expect.objectContaining({
        qualifiedQuantity: 90, unqualifiedQuantity: 10, status: 'partial'
      }))
    })
    test('M-D05 total mismatch is blocked before sending a completion request', async () => {
      await open(component)
      await input('合格数量', 90)
      await input('不合格数量', 9)
      await click(submitText)
      expect(qualityApi.completeInspection).not.toHaveBeenCalled()
    })
    test('M-D06 submission must show the concrete backend item validation message', async () => {
      qualityApi.completeInspection.mockRejectedValue({ response: { status: 400, data: { message: '还有 2 项检验项目未判定，不能完成检验' } } })
      await open(component)
      await click(submitText)
      expect(showToast).toHaveBeenCalledWith('还有 2 项检验项目未判定，不能完成检验')
      expect(wrapper.vm.inspection.status).toBe('in_progress')
    })
    test('M-D07 read-only users cannot see the completion action', async () => {
      session.writable = false
      await open(component)
      expect(wrapper.find('.action-section').isVisible()).toBe(false)
    })
    test('M-D08 failed detail renders retry and back without a completion action', async () => {
      qualityApi[getter].mockRejectedValue({ response: { status: 404 } })
      await open(component)
      expect(wrapper.text()).toContain('不存在或已被删除')
      expect(wrapper.text()).toContain('重试')
      expect(wrapper.text()).toContain('返回列表')
      expect(wrapper.find('.action-section').exists()).toBe(false)
    })
    test('M-D09 query data from a different document cannot override the route record', async () => {
      session.route.query.data = JSON.stringify(record({ id: 999, inspectionNo: 'OTHER-999' }))
      await open(component)
      expect(qualityApi[getter]).toHaveBeenCalledWith('42')
      expect(wrapper.vm.inspection?.id).toBe(42)
    })
    test('M-D10 completed partial status must display a Chinese business label', async () => {
      qualityApi[getter].mockResolvedValue({ data: record({ status: 'partial', qualifiedQuantity: 90, unqualifiedQuantity: 10 }) })
      await open(component)
      expect(wrapper.find('.status-badge').text()).toBe('部分合格')
    })
    test('M-D11 cancelling completion sends no write request', async () => {
      showConfirmDialog.mockRejectedValueOnce('cancel')
      await open(component)
      await click(submitText)
      expect(qualityApi.completeInspection).not.toHaveBeenCalled()
    })
  })
}
test('M-F12 final result picker can explicitly choose partial and preserve 90/10', async () => {
  await open(FinalDetail)
  await input('合格数量', 90)
  await input('不合格数量', 10)
  await field('综合判定').trigger('click')
  await flushPromises()
  // Emit the genuine Vant picker event to test the parent selection contract.
  wrapper.findComponent(Picker).vm.$emit('confirm', { selectedOptions: [{ text: '部分合格 (Partial)', value: 'partial' }] })
  await flushPromises()
  await click('提交入库评估并归档')
  expect(qualityApi.completeInspection).toHaveBeenCalledWith(42, expect.objectContaining({
    qualifiedQuantity: 90, unqualifiedQuantity: 10, status: 'partial'
  }))
})

for (const [kind, component, creator] of [
  ['final', CreateFinal, 'createFinalInspection'],
  ['process', CreateProcess, 'createProcessInspection']
]) {
  describe(`Mobile quality UAT / create ${kind}`, () => {
    test('M-C01 source should be chosen from actual production orders', async () => {
      await open(component)
      expect(field('关联工单号').props('readonly')).toBe(true)
      expect(field('关联工单号').props('isLink')).toBe(true)
    })
    test('M-C02 submitted inspection must have source, product and inspection basis identifiers', async () => {
      await open(component)
      await fillCreate()
      await submitCreate()
      expect(qualityApi[creator]).toHaveBeenCalledOnce()
      const body = qualityApi[creator].mock.calls[0][0]
      expect.soft(Boolean(body.referenceId || body.taskId), '缺少真实生产来源 ID').toBe(true)
      expect.soft(Boolean(body.materialId || body.productId), '缺少真实产品 ID').toBe(true)
      expect.soft(Boolean(body.templateId || body.items?.length), '缺少检验模板或项目依据').toBe(true)
    })
    test('M-C03 zero quantity must not create an inspection', async () => {
      await open(component)
      await fillCreate()
      await input('检验数量', 0)
      await submitCreate()
      expect(qualityApi[creator]).not.toHaveBeenCalled()
    })
    test('M-C04 missing-template response is shown and the submit button recovers', async () => {
      qualityApi[creator].mockRejectedValue({ response: { status: 400, data: { message: '未找到适用的检验模板，请先维护检验项目' } } })
      await open(component)
      await fillCreate()
      await submitCreate()
      expect(qualityApi[creator]).toHaveBeenCalledOnce()
      expect(showToast).toHaveBeenCalledWith('未找到适用的检验模板，请先维护检验项目')
      expect(wrapper.vm.submitting).toBe(false)
    })
  })
}

describe('Mobile quality UAT / nonconformance disposition', () => {
  test('M-N01 pending record starts processing through its visible action', async () => {
    await open(NonconformanceDetail)
    await click('开始处理')
    expect(qualityApi.processNonconformance).toHaveBeenCalledWith(52, 'start', {})
    expect(wrapper.vm.record.status).toBe('processing')
    expect(wrapper.text()).toContain('完成处理')
  })
  test('M-N02 pending disposition offers a decision control or explicit desktop handoff', async () => {
    await open(NonconformanceDetail)
    const decisionFields = wrapper.findAllComponents(Field).filter(component => /处置|责任|原因/.test(component.props('label') || ''))
    expect(decisionFields.length > 0 || /电脑.*处置|请.*电脑/.test(wrapper.text())).toBe(true)
  })
  test('M-N03 cannot send complete while disposition is still pending', async () => {
    qualityApi.getNonconformanceRecord.mockResolvedValue({ data: ncp({ status: 'processing' }) })
    await open(NonconformanceDetail)
    const complete = wrapper.findAll('button').find(button => button.text().includes('完成处理'))
    if (complete?.isVisible() && complete.attributes('disabled') === undefined) await click('完成处理')
    expect(qualityApi.processNonconformance).not.toHaveBeenCalled()
  })
  test.each(['pending', 'processing'])('M-N04 read-only user cannot see writing buttons for %s records', async status => {
    session.writable = false
    qualityApi.getNonconformanceRecord.mockResolvedValue({ data: ncp({ status }) })
    await open(NonconformanceDetail)
    expect(wrapper.findAll('button').filter(button => /开始处理|完成处理/.test(button.text()) && button.isVisible())).toHaveLength(0)
  })
  test('M-N05 failed complete retains processing state and explains missing disposition', async () => {
    qualityApi.getNonconformanceRecord.mockResolvedValue({ data: ncp({ status: 'processing' }) })
    qualityApi.processNonconformance.mockRejectedValue({ response: { status: 400, data: { message: '请先选择处置方式，不能直接完成处理' } } })
    await open(NonconformanceDetail)
    await click('完成处理')
    expect(wrapper.vm.record.status).toBe('processing')
    expect(showToast).toHaveBeenCalledWith('请先选择处置方式，不能直接完成处理')
  })
  test('M-N06 camelCase responsible party should display its business label', async () => {
    await open(NonconformanceDetail)
    const row = wrapper.findAll('.van-cell').find(cell => cell.find('.van-cell__title').text() === '责任方')
    expect(row.text()).toContain('内部')
  })
})


describe('Mobile quality repaired flow regressions', () => {
  test('qualitative and blank fixed measurements serialize to null without losing evidence beyond sample six', () => {
    const payload = buildInspectionItemPayload({ itemName: '外观', actualValue: '', measure2: ' ', measurements: [{ sampleNo: 7, measuredValue: 10.02, measuredBy: 7 }] })
    expect(payload.measure1).toBeNull()
    expect(payload.measure2).toBeNull()
    expect(payload.measurements).toEqual([{ sampleNo: 7, measuredValue: 10.02, measuredBy: 7 }])
    expect(buildInspectionItemPayload({ actualValue: '√' }).measure1).toBeNull()
  })
  test.each([['final', FinalDetail, 'getFinalInspection', '提交入库评估并归档'], ['process', ProcessDetail, 'getProcessInspection', '提交并完成检验']])('%s cannot mark an out of tolerance actual value passed', async (_kind, component, getter, submit) => {
    const data = record()
    data.items[0].actualValue = 12
    qualityApi[getter].mockResolvedValue({ data })
    await open(component)
    await click(submit)
    expect(qualityApi.completeInspection).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('存在不合格检验项目，请核实不合格数量')
  })
  test('AQL selection carries authoritative sampling basis with the inspection', async () => {
    qualityApi.getIncomingInspection.mockResolvedValue({ data: record({ isFullInspection: false }) })
    qualityApi.getAqlStandards.mockResolvedValue({ data: [{ id: 8, name: 'AQL抽样', batchMin: 51, batchMax: 150, sampleSize: 20, aqlLevel: 1, acceptLimit: 1, rejectLimit: 2 }] })
    await open(IncomingDetail)
    await field('AQL标准').trigger('click')
    await flushPromises()
    const picker = wrapper.findComponent(Picker)
    picker.vm.$emit('confirm', { selectedOptions: [picker.props('columns')[0]] })
    await flushPromises()
    await click('提交检验')
    expect(qualityApi.updateIncomingInspection).toHaveBeenCalledWith(42, expect.objectContaining({ aqlStandardId: 8, sampleQuantity: 20, acceptLimit: 1, rejectLimit: 2, isAql: true }))
  })
  test('NCP decision records responsibility and reason before completing handling', async () => {
    qualityApi.getNonconformanceRecord.mockResolvedValue({ data: ncp({ status: 'processing' }) })
    await open(NonconformanceDetail)
    for (const [label,value] of [['处置方式','rework'],['责任方','internal']]) {
      await field(label).trigger('click')
      await flushPromises()
      const picker = wrapper.findComponent(Picker)
      if (label === '责任方') expect(picker.props('columns')).toEqual([{ value: 'internal', text: '内部' }, { value: 'supplier', text: '供应商' }, { value: 'unknown', text: '未知' }])
      const option = picker.props('columns').find(option => option.value === value)
      expect(option).toBeDefined()
      picker.vm.$emit('confirm', { selectedOptions: [option] })
      await flushPromises()
    }
    await field('处置原因').find('textarea').setValue('尺寸不良返工后复检')
    qualityApi.getNonconformanceRecord.mockResolvedValue({ data: ncp({ status: 'processing', disposition: 'rework', dispositionReason: '尺寸不良返工后复检' }) })
    await click('保存处置决定')
    expect(qualityApi.processNonconformance).toHaveBeenCalledWith(52, 'disposition', { disposition: 'rework', responsibleParty: 'internal', dispositionReason: '尺寸不良返工后复检', supplierId: undefined })
    await click('完成处理')
    expect(qualityApi.processNonconformance).toHaveBeenCalledWith(52, 'complete', { handledQuantity: 10 })
  })
  test('NCP rejects a responsibility outside the persisted enum before sending a decision', async () => {
    qualityApi.getNonconformanceRecord.mockResolvedValue({ data: ncp({ status: 'processing', disposition: 'rework', responsibleParty: 'production', dispositionReason: '返工后复检' }) })
    await open(NonconformanceDetail)
    await click('保存处置决定')
    expect(qualityApi.processNonconformance).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('请选择有效的责任方')
  })
  test('concession request is separate from ordinary completion', async () => {
    qualityApi.getNonconformanceRecord.mockResolvedValue({ data: ncp({ status: 'processing', disposition: 'use_as_is' }) })
    await open(NonconformanceDetail)
    await click('完成处理')
    expect(qualityApi.processNonconformance).not.toHaveBeenCalled()
    await input('申请理由', '不影响装配且经客户确认')
    await click('提交特采申请')
    expect(qualityApi.applyConcession).toHaveBeenCalledWith(52, { reason: '不影响装配且经客户确认' })
  })
})


describe('Mobile rework execution and independent reinspection', () => {
  const task = overrides => ({ id: 42, reworkNo: 'RW-42', ncpId: 52, ncpNo: 'NCP-52', inspectionId: 142, inspectionNo: 'QC-142', quantity: 10, status: 'pending', ...overrides })
  test('NCP opens its exact rework task list', async () => {
    qualityApi.getNonconformanceRecord.mockResolvedValue({ data: ncp({ status: 'completed', disposition: 'rework' }) })
    await open(NonconformanceDetail)
    await click('查看返工任务')
    expect(router.push).toHaveBeenCalledWith({ path: '/quality/rework', query: { ncpId: 52 } })
  })
  test('pending task must have an assignee before it can progress', async () => {
    qualityApi.getReworkTask.mockResolvedValue({ data: task() })
    await open(ReworkDetail)
    await click('分配并开始返工')
    expect(qualityApi.assignReworkTask).not.toHaveBeenCalled()
    await input('负责人', '返工员甲')
    qualityApi.getReworkTask.mockResolvedValue({ data: task({ status: 'in_progress', assignedTo: '返工员甲' }) })
    await click('分配并开始返工')
    expect(qualityApi.assignReworkTask).toHaveBeenCalledWith(42, { assignedTo: '返工员甲' })
    expect(wrapper.text()).toContain('完成返工并生成复检')
  })
  test('completing an assigned task refreshes and exposes the generated reinspection', async () => {
    qualityApi.getReworkTask.mockResolvedValue({ data: task({ status: 'in_progress', assignedTo: '返工员甲' }) })
    await open(ReworkDetail)
    qualityApi.getReworkTask.mockResolvedValue({ data: task({ status: 'completed', reinspectionId: 242 }) })
    await click('完成返工并生成复检')
    expect(qualityApi.completeReworkTask).toHaveBeenCalledWith(42, expect.objectContaining({ actualDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }))
    expect(wrapper.text()).toContain('打开独立复检单')
  })
  test.each(['incoming','final','process'])('opens a new %s reinspection, never the original inspection', async inspectionType => {
    qualityApi.getReworkTask.mockResolvedValue({ data: task({ status: 'completed', reinspectionId: 242 }) })
    qualityApi.getIncomingInspection.mockResolvedValue({ data: record({ id: 242, inspectionType }) })
    await open(ReworkDetail)
    await click('打开独立复检单')
    expect(qualityApi.getIncomingInspection).toHaveBeenCalledWith(242)
    expect(router.push).toHaveBeenCalledWith(`/quality/${inspectionType}/242`)
  })
  test('failed rework completion keeps task active and shows the backend reason', async () => {
    qualityApi.getReworkTask.mockResolvedValue({ data: task({ status: 'in_progress', assignedTo: '返工员甲' }) })
    qualityApi.completeReworkTask.mockRejectedValue({ response: { data: { message: '复检创建失败，请重试' } } })
    await open(ReworkDetail)
    await click('完成返工并生成复检')
    expect(wrapper.vm.task.status).toBe('in_progress')
    expect(showToast).toHaveBeenCalledWith('复检创建失败，请重试')
  })
  test.each(['pending','in_progress'])('read-only users cannot execute a %s task', async status => {
    session.writable = false
    qualityApi.getReworkTask.mockResolvedValue({ data: task({ status }) })
    await open(ReworkDetail)
    expect(wrapper.findAll('button').filter(b => /分配并开始返工|完成返工并生成复检/.test(b.text()) && b.isVisible())).toHaveLength(0)
  })
})


describe('Mobile sampling and paginated API contracts', () => {
  test.each([[FinalDetail, 'getFinalInspection', '提交入库评估并归档'], [ProcessDetail, 'getProcessInspection', '提交并完成检验']])('template AQL records can configure an actual sampling basis before completing', async (component, getter, submit) => {
    qualityApi[getter].mockResolvedValue({ data: record({ isFullInspection: false, isAql: true, sampleQuantity: null, aqlStandardId: null }) })
    qualityApi.getAqlStandards.mockResolvedValue({ data: { success: true, data: { list: [{ id: 8, name: 'AQL抽样', batchMin: 51, batchMax: 150, sampleSize: 20, aqlLevel: 1, acceptLimit: 1, rejectLimit: 2 }], total: 1 } } })
    await open(component)
    await click(submit)
    expect(qualityApi.completeInspection).not.toHaveBeenCalled()
    await field('AQL标准').trigger('click')
    await flushPromises()
    const picker = wrapper.findAllComponents(Picker).find(p => p.props('title') === '选择AQL标准')
    picker.vm.$emit('confirm', { selectedOptions: [picker.props('columns')[0]] })
    await flushPromises()
    await click(submit)
    expect(qualityApi.completeInspection).toHaveBeenCalledWith(42, expect.objectContaining({ aqlStandardId: 8, sampleQuantity: 20, isFullInspection: false, isAql: true }))
  })
  test('rework list HTTP envelope preserves rows and total', () => {
    const response = { data: { success: true, data: { data: [{ id: 9, ncpId: 52 }], pagination: { total: 21, current: 1, pageSize: 20 } } } }
    const result = extractApiPaginated(response)
    expect(result.list).toEqual([{ id: 9, ncpId: 52 }])
    expect(result.total).toBe(21)
  })
  test('creation offers general templates and accepts the exact production source paginated envelope', async () => {
    qualityApi.getProductionSources.mockResolvedValue({ data: { success: true, data: { list: [{ id: 42, code: 'TASK-UAT-42', productId: 12, productName: '验收产品', quantity: 100 }], total: 1, page: 1, pageSize: 100 } } })
    await open(CreateFinal)
    await fillCreate()
    await submitCreate()
    expect(qualityApi.getInspectionTemplates).toHaveBeenCalledWith(expect.objectContaining({ materialType: 12, inspectionType: 'final', includeGeneral: true }))
    expect(qualityApi.createFinalInspection).toHaveBeenCalledWith(expect.objectContaining({ referenceId: 42, productId: 12, templateId: 8 }))
  })
})


describe('Mobile post-submit inspection display and accessible list actions', () => {
  test.each([[FinalDetail, 'getFinalInspection', '提交入库评估并归档'], [ProcessDetail, 'getProcessInspection', '提交并完成检验']])('full inspection label is factual and successful submission reloads persisted sampling', async (component, getter, submit) => {
    qualityApi[getter].mockResolvedValueOnce({ data: record({ isFullInspection: true, isAql: false, sampleQuantity: null, templateName: '尺寸外观模板' }) })
      .mockResolvedValue({ data: record({ status: 'partial', qualifiedQuantity: 90, unqualifiedQuantity: 10, isFullInspection: true, isAql: false, sampleQuantity: 100, templateName: '尺寸外观模板' }) })
    await open(component)
    const standard = wrapper.findAll('.van-cell').find(cell => cell.text().includes('检验标准'))
    expect(standard.text()).toContain('全数检验 · 尺寸外观模板')
    expect(standard.text()).not.toContain('AQL')
    const sample = wrapper.findAll('.van-cell').find(cell => cell.text().includes('全检数量'))
    expect(sample.text()).toContain('100')
    await input('合格数量', 90)
    await input('不合格数量', 10)
    await click(submit)
    expect(qualityApi[getter]).toHaveBeenCalledTimes(2)
    expect(wrapper.vm.inspection).toMatchObject({ status: 'partial', sampleQuantity: 100, qualifiedQuantity: 90, unqualifiedQuantity: 10 })
  })
  test.each([[FinalList, 'final'], [ProcessList, 'process']])('%s list actions are named native buttons with normal keyboard semantics', async (component, kind) => {
    await open(component)
    const scan = wrapper.get('button.nav-action[aria-label="扫码检验"]')
    const create = wrapper.get('button.nav-action[aria-label="新建检验"]')
    expect(scan.attributes('type')).toBe('button')
    expect(create.attributes('type')).toBe('button')
    await scan.trigger('click')
    expect(router.push).toHaveBeenCalledWith(`/scan?type=inspection_${kind}`)
    await create.trigger('click')
    expect(router.push).toHaveBeenCalledWith(`/quality/${kind}/create`)
  })
})
