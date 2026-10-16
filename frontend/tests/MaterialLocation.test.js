import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import ElementPlus, { ElCascader, ElMessage, ElMessageBox } from 'element-plus'
import MaterialFormDialog from '@/views/baseData/components/MaterialFormDialog.vue'
import MaterialViewDialog from '@/views/baseData/components/MaterialViewDialog.vue'
import { materialApi } from '@/api/material'

vi.mock('@/api/material', () => ({ materialApi: {
  getMaterialAttachments: vi.fn(),
  updateMaterial: vi.fn(),
  createMaterial: vi.fn(),
  getNextMaterialCode: vi.fn(),
  getLatestMaterialByCategory: vi.fn(),
} }))
vi.mock('@/stores/finance', () => ({ useFinanceStore: () => ({
  loadSettings() {}, defaultVATRate: 13, vatRateOptions: [13], formatTaxRate: rate => `${rate}%`,
}) }))

const AppDialog = defineComponent({
  props: ['modelValue'],
  template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>',
})
const global = { plugins: [ElementPlus], stubs: { AppDialog } }
const categoryOptions = [{ id: 1, code: '10', displayName: '物料', children: [
  { id: 2, code: '1001', displayName: '零件' },
] }]
const material = { id: 7, code: '1001001', name: '螺栓', categoryId: 2, unitId: 1, materialType: 'raw' }
let wrapper

beforeEach(() => {
  materialApi.getMaterialAttachments.mockResolvedValue({ data: [] })
  materialApi.updateMaterial.mockResolvedValue({ success: true })
  materialApi.createMaterial.mockResolvedValue({ data: { id: 8 } })
  materialApi.getNextMaterialCode.mockResolvedValue({ data: { nextSequence: 2 } })
  materialApi.getLatestMaterialByCategory.mockResolvedValue({ data: null })
  vi.spyOn(ElMessage, 'success').mockImplementation(() => {})
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm')
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => {
  wrapper?.unmount()
  vi.unstubAllGlobals()
})

async function openForm(editData) {
  wrapper = mount(MaterialFormDialog, {
    props: { modelValue: true, editData, productCategoryOptions: categoryOptions, unitOptions: [{ id: 1, name: '个' }] },
    global,
  })
  await flushPromises()
}
async function save() {
  await wrapper.findAll('button').find(button => button.text() === '确定').trigger('click')
  await flushPromises()
}

describe('material storage location', () => {
  test.each(['locationDetail', 'location_detail'])('loads %s and saves an edited location without rewriting the drawing number', async field => {
    const editData = { ...material, [field]: 'A-01-02', drawingNo: 'DRAWING-7' }
    await openForm(editData)
    const input = wrapper.get('input[placeholder="请输入库位"]')
    expect(input.element.value).toBe('A-01-02')
    await input.setValue('B-03-04')
    await save()
    expect(materialApi.updateMaterial).toHaveBeenCalledWith(7, expect.objectContaining({ locationDetail: 'B-03-04' }))
    expect(materialApi.updateMaterial.mock.calls[0][1]).not.toHaveProperty('drawingNo')
    expect(editData.drawingNo).toBe('DRAWING-7')
  })

  test('copies the previous material location while keeping the newly generated material code', async () => {
    materialApi.getLatestMaterialByCategory.mockResolvedValue({ data: {
      ...material, location_detail: 'C-02-08', drawingNo: 'DRAWING-7',
    } })
    await openForm()
    wrapper.findComponent(ElCascader).vm.$emit('change', 2)
    await flushPromises()
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(wrapper.get('input[placeholder="请输入库位"]').element.value).toBe('C-02-08')
    await save()
    expect(materialApi.createMaterial).toHaveBeenCalledWith(expect.objectContaining({ code: '1001002', locationDetail: 'C-02-08' }))
    expect(materialApi.createMaterial.mock.calls[0][0]).not.toHaveProperty('drawingNo')
  })

  test('shows the saved storage location in the material details', () => {
    wrapper = mount(MaterialViewDialog, {
      props: { modelValue: true, viewData: { ...material, locationDetail: 'A-01-02', drawingNo: 'DRAWING-7' } },
      global,
    })
    const locationLabel = wrapper.findAll('.el-descriptions__label').find(label => label.text() === '库位')
    expect(locationLabel).toBeTruthy()
    expect(locationLabel.element.nextElementSibling.textContent.trim()).toBe('A-01-02')
    expect(wrapper.text()).not.toContain('DRAWING-7')
  })
})
