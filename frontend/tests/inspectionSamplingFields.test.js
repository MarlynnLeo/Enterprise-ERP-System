import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import InspectionSamplingFields from '@/views/quality/components/InspectionSamplingFields.vue'
import { inspectionSamplingPayload, validateInspectionSampling } from '@/utils/inspectionSampling'
const { getAqlStandards } = vi.hoisted(() => ({ getAqlStandards: vi.fn() }))
vi.mock('@/api/quality', () => ({ qualityApi: { getAqlStandards } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { warning: vi.fn(), error: vi.fn() } }))
let wrapper
afterEach(() => wrapper?.unmount())
test('standard selection maps the real paginated response and authoritative sampling values', async () => {
  getAqlStandards.mockResolvedValue({ data: { list: [{ id: 9, name: 'AQL-1', batchMin: 51, batchMax: 150, sampleSize: 20, aqlLevel: 1, acceptLimit: 1, rejectLimit: 2 }], total: 1 } })
  wrapper = mount(InspectionSamplingFields, { props: { modelValue: { isFullInspection: false, isAql: true }, quantity: 100 }, global: { stubs: { ElSelect: { props: ['modelValue'], emits: ['update:modelValue', 'visible-change'], template: '<select @focus="$emit(\'visible-change\', true)" @change="$emit(\'update:modelValue\', Number($event.target.value))"><slot /></select>' }, ElOption: { props: ['value','label'], template: '<option :value="value">{{ label }}</option>' } } } })
  await wrapper.findAll('select')[1].trigger('focus')
  await flushPromises()
  await wrapper.findAll('select')[1].setValue('9')
  const sampling = wrapper.emitted('update:modelValue')[0][0]
  expect(sampling).toMatchObject({ aqlStandardId: 9, sampleQuantity: 20, acceptLimit: 1, rejectLimit: 2 })
  expect(validateInspectionSampling(sampling, 100)).toBe('')
  expect(inspectionSamplingPayload({ ...sampling, isFullInspection: true, isAql: false }, 100)).toEqual({ isFullInspection: true, isAql: false, aqlStandardId: null, aqlLevel: null, sampleQuantity: 100, acceptLimit: null, rejectLimit: null })
})
