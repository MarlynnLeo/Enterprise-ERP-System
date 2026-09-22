import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import InspectDialog from '@/views/quality/components/InspectDialog.vue'

const { qualityApi, message } = vi.hoisted(() => ({
  qualityApi: {
    getAqlLevels: vi.fn(),
    getAqlStandards: vi.fn(),
    getIncomingInspection: vi.fn(),
    getTemplates: vi.fn(),
    calculateAqlSampling: vi.fn(),
    updateIncomingInspection: vi.fn(),
  },
  message: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

vi.mock('@/api', () => ({ qualityApi, baseDataApi: {}, purchaseApi: {} }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { realName: '检验员' } }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: message }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { alert: vi.fn(), confirm: vi.fn() } }))
vi.mock('@/components/AttachmentUpload.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/views/quality/components/TemplateSelectDialog.vue', () => ({ default: { template: '<div />' } }))

const Passthrough = defineComponent({ template: '<div><slot /></div>' })
const Dialog = defineComponent({ template: '<section><slot /><slot name="footer" /></section>' })
const Form = defineComponent({
  props: ['model'],
  setup: (_, { expose }) => { expose({ validate: async () => true }) },
  template: '<form @submit.prevent><slot /></form>',
})
const FormItem = defineComponent({
  props: ['label'],
  template: '<div :data-label="label"><slot /></div>',
})
const Table = defineComponent({ props: ['data'], template: '<div />' })
const Alert = defineComponent({
  props: ['title', 'type', 'closable'],
  template: '<div role="alert">{{ title }}</div>',
})
const Button = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  template: '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
})
const Select = defineComponent({
  props: ['modelValue', 'loading'],
  emits: ['update:modelValue', 'change'],
  template: '<div><slot /></div>',
})
const Switch = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue', 'change'],
  template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked); $emit(\'change\', $event.target.checked)" />',
})
const Option = defineComponent({ props: ['value'], template: '<span>{{ value }}</span>' })

const deferred = () => {
  let resolve
  const promise = new Promise(accept => { resolve = accept })
  return { promise, resolve }
}
const matched = (overrides = {}) => ({ data: { matched: true, data: {
  aqlStandardId: 24, sampleSize: 200, acceptLimit: 5, rejectLimit: 6, ...overrides,
} } })
const inspection = (overrides = {}) => ({
  id: 7,
  inspectionNo: 'QC-007',
  quantity: 4000,
  qualifiedQuantity: 4000,
  unqualifiedQuantity: 0,
  isAql: true,
  aqlLevel: 1,
  aqlStandardId: 9,
  acceptLimit: 3,
  rejectLimit: 4,
  items: [{ id: 1, itemName: '外观', standard: '无破损', method: '目视' }],
  ...overrides,
})
let wrapper
const openInspection = async () => {
  wrapper = mount(InspectDialog, {
    props: { visible: false, row: { id: 7, inspectionNo: 'QC-007' } },
    global: {
      stubs: {
        AppDialog: Dialog,
        ElForm: Form,
        ElFormItem: FormItem,
        ElAlert: Alert,
        ElTable: Table,
        ElTableColumn: true,
        ElRow: Passthrough,
        ElCol: Passthrough,
        ElInput: true,
        ElDatePicker: true,
        ElSelect: Select,
        ElOption: Option,
        ElSwitch: Switch,
        ElButton: Button,
      },
      directives: { permission: () => {} },
    },
  })
  await wrapper.setProps({ visible: true })
  await flushPromises()
}
const form = () => wrapper.findComponent(Form).props('model')
const submitButton = () => wrapper.findAllComponents(Button).find(button => button.text() === '提交检验')
const submit = async () => {
  // Emit at the component boundary as well as inspecting disabled state so the handler must enforce the guard.
  submitButton().vm.$emit('click')
  await flushPromises()
}
const selectLevel = async (level) => {
  const select = wrapper.get('[data-label="AQL 级别"]').findComponent(Select)
  select.vm.$emit('update:modelValue', String(level))
  select.vm.$emit('change', String(level))
  await flushPromises()
}
const completeMeasurements = () => {
  form().items[0].measurements = Array(6).fill('√')
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  qualityApi.getAqlLevels.mockResolvedValue({ data: [1, 1.5] })
  qualityApi.getAqlStandards.mockResolvedValue({ data: [] })
  qualityApi.getIncomingInspection.mockResolvedValue({ data: inspection() })
  qualityApi.getTemplates.mockResolvedValue({ data: [] })
  qualityApi.calculateAqlSampling.mockResolvedValue(matched())
  qualityApi.updateIncomingInspection.mockResolvedValue({ data: { receipt_auto_created: true } })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('incoming inspection AQL selection', () => {
  test('shows a persistent missing-standard warning and blocks submission without retaining the previous plan', async () => {
    const warning = '未找到批量 4000、AQL 1 对应的启用抽样标准，请维护 AQL 标准。'
    qualityApi.calculateAqlSampling.mockResolvedValue({ data: { matched: false, message: warning } })
    await openInspection()

    const alert = wrapper.findAllComponents(Alert).find(component => component.props('type') === 'warning')
    expect(alert?.text()).toContain(warning)
    expect(alert?.props('closable')).toBe(false)
    expect(form().aql_standard_id).toBeNull()
    expect(form().acceptLimit).toBe(0)
    expect(form().rejectLimit).toBe(1)
    expect(console.error).not.toHaveBeenCalled()
    expect(message.error).not.toHaveBeenCalled()
    expect(message.success).not.toHaveBeenCalled()
    completeMeasurements()
    await submit()
    expect(qualityApi.updateIncomingInspection).not.toHaveBeenCalled()
    expect(wrapper.emitted('success')).toBeUndefined()
    expect(wrapper.text()).toContain(warning)
  })

  test('uses the complete AQL level list and submits a matched plan with at most six measurement columns', async () => {
    qualityApi.getAqlLevels.mockResolvedValue({ data: [1, '1.0', 1.5, '1.5'] })
    qualityApi.getIncomingInspection.mockResolvedValue({ data: inspection({ aqlLevel: '1.0' }) })
    await openInspection()

    expect(qualityApi.getAqlLevels).toHaveBeenCalledTimes(1)
    expect(qualityApi.getAqlStandards).not.toHaveBeenCalled()
    expect(wrapper.get('[data-label="AQL 级别"]').findAllComponents(Option).map(option => Number(option.props('value'))))
      .toEqual([1, 1.5])
    expect(qualityApi.calculateAqlSampling).toHaveBeenCalledTimes(1)
    expect(qualityApi.calculateAqlSampling).toHaveBeenCalledWith({ batchSize: 4000, aqlLevel: '1' })
    expect(form()).toMatchObject({ aql_standard_id: 24, acceptLimit: 5, rejectLimit: 6 })
    expect(wrapper.findComponent(Table).props('data')[0].measurements).toHaveLength(6)
    completeMeasurements()
    await submit()
    expect(qualityApi.updateIncomingInspection).toHaveBeenCalledWith(7, expect.objectContaining({
      is_aql: true, aql_standard_id: 24, accept_limit: 5, reject_limit: 6,
      items: [expect.objectContaining({ measurements: Array.from({ length: 6 }, (_, index) => ({
        sample_no: index + 1, measured_value: '√',
      })) })],
    }))
    expect(wrapper.emitted('success')).toHaveLength(1)
  })

  test('fills all qualitative measurement values when an item is marked as passed', async () => {
    await openInspection()

    const item = form().items[0]
    item.result = 'passed'
    wrapper.vm.handleResultChange(item)

    expect(item.measurements).toEqual(Array(6).fill('√'))
    expect(item.actualValue).toBe('√6 / ×0')
    expect(item.isQualified).toBe(true)
  })

  test('blocks submission while a replacement standard is being calculated', async () => {
    await openInspection()
    const pending = deferred()
    qualityApi.calculateAqlSampling.mockReturnValueOnce(pending.promise)
    await selectLevel(1.5)

    completeMeasurements()
    expect(submitButton().find('button').element.disabled).toBe(true)
    await submit()
    expect(qualityApi.updateIncomingInspection).not.toHaveBeenCalled()

    pending.resolve(matched({ aqlStandardId: 30, acceptLimit: 7, rejectLimit: 8 }))
    await flushPromises()
    await submit()
    expect(qualityApi.updateIncomingInspection).toHaveBeenCalledWith(7, expect.objectContaining({
      aql_standard_id: 30, aqlLevel: '1.5', accept_limit: 7, reject_limit: 8,
    }))
  })

  test('honors camelCase AQL fields on an automatically selected template and calculates only once', async () => {
    qualityApi.getIncomingInspection.mockResolvedValue({ data: inspection({
      materialId: 5, specs: '规格', isAql: false, aqlLevel: null, items: [],
    }) })
    qualityApi.getTemplates.mockResolvedValue({ data: [{
      id: 15, templateName: '物料检验模板', isAql: true, aqlLevel: 1.5,
      items: [{ id: 1, itemName: '外观', standard: '无破损', method: '目视' }],
    }] })
    await openInspection()

    expect(wrapper.findComponent(Switch).props('modelValue')).toBe(true)
    expect(Number(form().aqlLevel)).toBe(1.5)
    expect(qualityApi.calculateAqlSampling).toHaveBeenCalledTimes(1)
    expect(Number(qualityApi.calculateAqlSampling.mock.calls[0][0].aqlLevel)).toBe(1.5)
    expect(form().aql_standard_id).toBe(24)
    expect(wrapper.findComponent(Table).props('data')[0].measurements).toHaveLength(6)
  })

  test.each([null, 9])('keeps saved measurements and recalculates only when the saved standard id is %s', async (standardId) => {
    const savedMeasurements = ['√', '×', '√']
    qualityApi.getIncomingInspection.mockResolvedValue({ data: inspection({
      aqlStandardId: standardId,
      items: [{ id: 1, itemName: '外观', standard: '无破损', measurements: savedMeasurements }],
    }) })
    await openInspection()

    expect(qualityApi.calculateAqlSampling).toHaveBeenCalledTimes(standardId ? 0 : 1)
    expect(form().aql_standard_id).toBe(standardId || 24)
    expect(wrapper.findComponent(Table).props('data')[0].measurements.slice(0, 3)).toEqual(savedMeasurements)
  })

  test('retains all saved measurements when initial matching finds a smaller sample size', async () => {
    const savedMeasurements = ['√', '×', '√', '×', '√', '√']
    qualityApi.getIncomingInspection.mockResolvedValue({ data: inspection({
      aqlStandardId: null,
      items: [{ id: 1, itemName: '外观', standard: '无破损', measurements: savedMeasurements }],
    }) })
    qualityApi.calculateAqlSampling.mockResolvedValue(matched({ sampleSize: 2 }))
    await openInspection()

    expect(qualityApi.calculateAqlSampling).toHaveBeenCalledTimes(1)
    expect(form().aql_standard_id).toBe(24)
    expect(wrapper.findComponent(Table).props('data')[0].measurements).toEqual(savedMeasurements)
  })

  test.each([0, 'invalid'])('warns before making an AQL request for invalid batch size %s', async (quantity) => {
    qualityApi.getIncomingInspection.mockResolvedValue({ data: inspection({ quantity }) })
    await openInspection()

    expect(qualityApi.calculateAqlSampling).not.toHaveBeenCalled()
    expect(wrapper.findAllComponents(Alert).find(alert => alert.props('type') === 'warning')?.text()).toContain('检验数量')
    expect(form().aql_standard_id).toBeNull()
    await submit()
    expect(qualityApi.updateIncomingInspection).not.toHaveBeenCalled()
  })

  test('does not restore an obsolete standard when an earlier level request finishes last', async () => {
    await openInspection()
    const first = deferred()
    qualityApi.calculateAqlSampling.mockReturnValueOnce(first.promise).mockResolvedValueOnce(matched({ aqlStandardId: 30 }))
    await selectLevel(1.5)
    await selectLevel(1)
    first.resolve(matched({ aqlStandardId: 19, acceptLimit: 1, rejectLimit: 2 }))
    await flushPromises()

    expect(form()).toMatchObject({ aql_standard_id: 30, aqlLevel: '1', acceptLimit: 5, rejectLimit: 6 })
  })

  test('turning AQL off discards an in-flight plan and allows ordinary inspection submission', async () => {
    await openInspection()
    const pending = deferred()
    qualityApi.calculateAqlSampling.mockReturnValueOnce(pending.promise)
    await selectLevel(1.5)
    await wrapper.findComponent(Switch).get('input').setValue(false)
    pending.resolve(matched({ aqlStandardId: 30 }))
    await flushPromises()

    expect(form()).toMatchObject({ is_aql: false, aql_standard_id: null })
    expect(wrapper.findAllComponents(Alert).filter(alert => alert.props('type') === 'warning')).toHaveLength(0)
    completeMeasurements()
    await submit()
    expect(qualityApi.updateIncomingInspection).toHaveBeenCalledWith(7, expect.objectContaining({
      is_aql: false, aql_standard_id: null,
    }))
  })
})
