import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { BOM_DIALOG_WIDTH as SHARED_WIDTH_SENTINEL } from '@/constants/bom'
import Boms from '@/views/baseData/Boms.vue'
import BomViewDialog from '@/views/baseData/components/BomViewDialog.vue'
import BomFormDialog from '@/views/baseData/components/BomFormDialog.vue'
import BomLocateResultsDialog from '@/views/baseData/components/BomLocateResultsDialog.vue'

vi.mock('@/constants/bom', () => ({
  BOM_DIALOG_WIDTH: 'shared-bom-dialog-width-test',
}))

const exportToExcel = vi.fn()
const getBoms = vi.fn()
const getBomStats = vi.fn()
const exportBoms = vi.fn()
const locatePart = vi.fn()
const prompt = vi.fn()

vi.mock('element-plus/es/components/message-box/index', () => ({
  ElMessageBox: { prompt: (...args) => prompt(...args) },
}))

vi.mock('@/composables/useExportExcel', () => ({
  useExportExcel: () => ({
    exportLoading: false,
    exportToExcel,
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    hasPermission: () => true,
  }),
}))

vi.mock('@/api', () => ({
  materialApi: {
    getMaterials: vi.fn(async () => ({ data: [] })),
  },
  bomApi: {
    getBoms: (...args) => getBoms(...args),
    getBomStats: (...args) => getBomStats(...args),
    exportBoms: (...args) => exportBoms(...args),
    locatePart: (...args) => locatePart(...args),
  },
  commonApi: {
    downloadResource: vi.fn(),
  },
}))

vi.mock('@/api/material', () => ({
  materialApi: {
    getMaterials: vi.fn(async () => ({ data: [] })),
    getMaterial: vi.fn(),
  },
}))

vi.mock('@/api/bom', () => ({
  bomApi: {
    getBoms: vi.fn(async () => ({ data: [] })),
    getBom: vi.fn(),
    getBomStats: vi.fn(async () => ({ data: {} })),
  },
}))

vi.mock('@/api/common', () => ({
  commonApi: {
    downloadResource: vi.fn(),
    uploadFile: vi.fn(),
  },
}))

vi.mock('@/utils/optionLoaders', () => ({
  normalizeBomOption: (value) => value,
  searchBomOptions: vi.fn(async () => []),
}))

vi.mock('@/utils/attachmentPreview', () => ({
  isPreviewableAttachmentImage: () => false,
}))

vi.mock('@/utils/responseParser', async () => {
  const actual = await vi.importActual('@/utils/responseParser')
  return actual
})

const AppDialogStub = defineComponent({
  name: 'AppDialogStub',
  inheritAttrs: false,
  props: {
    modelValue: Boolean,
    title: String,
    width: [String, Number],
  },
  template: '<section class="app-dialog-stub"><div class="app-dialog-body"><slot/></div><footer class="app-dialog-footer"><slot name="footer"/></footer></section>',
})

const ButtonStub = defineComponent({
  name: 'ElButtonStub',
  inheritAttrs: false,
  props: {
    disabled: Boolean,
    loading: Boolean,
    type: String,
  },
  emits: ['click'],
  setup(_props, { emit, slots }) {
    return () => h('button', { type: 'button', onClick: () => emit('click') }, slots.default?.())
  },
})

const PassthroughStub = defineComponent({
  inheritAttrs: false,
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const AlertStub = defineComponent({
  props: { title: String, type: String },
  template: '<div role="alert">{{ title }}</div>',
})

const TableStub = defineComponent({
  props: { data: Array },
  template: '<div class="table-stub"><slot/></div>',
})

const BomsChildStub = defineComponent({
  inheritAttrs: false,
  setup() {
    return () => h('div')
  },
})

const globalStubs = {
  AppDialog: AppDialogStub,
  FinanceQueryCard: PassthroughStub,
  PageHeader: PassthroughStub,
  BomTable: BomsChildStub,
  BomStatCards: BomsChildStub,
  BomFormDialog: BomsChildStub,
  BomViewDialog: BomsChildStub,
  BomCompareDialog: BomsChildStub,
  'el-button': ButtonStub,
  'el-icon': PassthroughStub,
  'el-alert': AlertStub,
  'el-table': TableStub,
  'el-table-column': BomsChildStub,
  'el-card': PassthroughStub,
  'el-form': PassthroughStub,
  'el-form-item': PassthroughStub,
  'el-input': PassthroughStub,
  'el-select': PassthroughStub,
  'el-option': PassthroughStub,
  'el-dropdown': PassthroughStub,
  'el-dropdown-menu': PassthroughStub,
  'el-dropdown-item': PassthroughStub,
  'el-text': PassthroughStub,
  'el-descriptions': PassthroughStub,
  'el-descriptions-item': BomsChildStub,
  'el-tag': PassthroughStub,
  'el-tabs': PassthroughStub,
  'el-tab-pane': PassthroughStub,
  'el-timeline': PassthroughStub,
  'el-timeline-item': PassthroughStub,
  'el-divider': PassthroughStub,
  'el-row': PassthroughStub,
  'el-col': PassthroughStub,
  'el-upload': PassthroughStub,
  'el-checkbox': PassthroughStub,
  'el-input-number': PassthroughStub,
  'el-tooltip': PassthroughStub,
  'el-pagination': BomsChildStub,
  'el-image-viewer': BomsChildStub,
  EmptyState: PassthroughStub,
}

const testGlobal = {
  stubs: globalStubs,
  directives: {
    loading: {},
  },
}

const locateResult = {
  productCode: 'P-001',
  productName: '产品一',
  version: 'V1.0',
  materialCode: 'M-001',
  materialName: '零部件一',
  quantity: 2,
  unit: '个',
}

describe('BOM locate-results dialog contract', () => {
  beforeEach(() => {
    exportToExcel.mockReset()
    getBoms.mockReset().mockResolvedValue({ data: [] })
    getBomStats.mockReset().mockResolvedValue({ data: {} })
    exportBoms.mockReset().mockResolvedValue({ data: new Blob(['xlsx']) })
    locatePart.mockReset().mockResolvedValue({ data: [locateResult] })
    prompt.mockReset().mockResolvedValue({ value: ' M-001 ' })
    window.URL.createObjectURL = vi.fn(() => 'blob:test')
    window.URL.revokeObjectURL = vi.fn()
    HTMLAnchorElement.prototype.click = vi.fn()
  })

  test('uses the shared BOM width for locate, view, and edit dialogs', async () => {
    const actualConstants = await vi.importActual('@/constants/bom')
    expect(actualConstants.BOM_DIALOG_WIDTH).toBe('1020px')

    const listWrapper = mount(Boms, { global: testGlobal })
    await nextTick()

    const locateDialog = listWrapper
      .findAllComponents(AppDialogStub)
      .find((dialog) => dialog.props('title') === '零部件定位结果')
    expect(locateDialog).toBeTruthy()
    expect(locateDialog.props('width')).toBe(SHARED_WIDTH_SENTINEL)

    const viewWrapper = mount(BomViewDialog, {
      props: { modelValue: true, bomData: { details: [] } },
      global: testGlobal,
    })
    expect(viewWrapper.findComponent(AppDialogStub).props('width')).toBe(SHARED_WIDTH_SENTINEL)

    const formWrapper = mount(BomFormDialog, {
      props: { modelValue: true, editData: null, title: '新增BOM' },
      global: testGlobal,
    })
    expect(formWrapper.findComponent(AppDialogStub).props('width')).toBe(SHARED_WIDTH_SENTINEL)
  })

  test('keeps export to the left of close and exports all locate-result fields', async () => {
    const wrapper = mount(Boms, { global: testGlobal })
    await nextTick()

    wrapper.vm.locateResults = [locateResult]
    wrapper.vm.locateDialogVisible = true
    await nextTick()

    const locateDialog = wrapper
      .findAllComponents(AppDialogStub)
      .find((dialog) => dialog.props('title') === '零部件定位结果')
    const buttons = locateDialog.find('footer').findAll('button')
    expect(buttons.map((button) => button.text())).toEqual(['导出', '关闭'])

    await buttons[0].trigger('click')

    expect(exportToExcel).toHaveBeenCalledTimes(1)
    const exportOptions = exportToExcel.mock.calls[0][0]
    expect(exportOptions.data).toEqual([locateResult])
    expect(exportOptions.columns.map((column) => column.key)).toEqual([
      'productCode',
      'productName',
      'version',
      'materialCode',
      'materialName',
      'quantity',
      'unit',
    ])
    expect(exportOptions.columns.map((column) => column.header)).toEqual([
      '产品编码',
      '产品名称',
      'BOM版本',
      '物料编码',
      '物料名称',
      '用量',
      '单位',
    ])
    expect(exportOptions.filename).toBe('零部件定位结果')
    expect(exportOptions.sheetName).toBe('定位结果')
  })

  test('opens the shared results dialog after locating a code from the BOM prompt', async () => {
    const wrapper = mount(Boms, { global: testGlobal })
    await flushPromises()

    await wrapper.vm.handleLocatePart()
    await nextTick()

    expect(prompt).toHaveBeenCalled()
    expect(locatePart).toHaveBeenCalledWith('M-001')
    expect(wrapper.findComponent(BomLocateResultsDialog).props()).toMatchObject({
      modelValue: true,
      keyword: 'M-001',
      results: [locateResult],
      canExport: true,
    })
  })

  test.each([
    [{ loading: true, results: [locateResult] }, '正在定位物料…', 'info'],
    [{ error: '定位失败，请稍后重试', results: [locateResult] }, '定位失败，请稍后重试', 'error'],
    [{ results: [] }, "未找到包含物料 'M-001' 的BOM", 'warning'],
  ])('shows the current request state and prevents exporting unavailable results: %j', async (state, title, type) => {
    const wrapper = mount(BomLocateResultsDialog, {
      props: { modelValue: true, keyword: 'M-001', canExport: true, ...state },
      global: testGlobal,
    })

    expect(wrapper.findComponent(AlertStub).props()).toMatchObject({ title, type })
    expect(wrapper.findComponent(TableStub).exists()).toBe(false)
    const exportButton = wrapper.findAllComponents(ButtonStub)[0]
    expect(exportButton.props('disabled')).toBe(true)
    await exportButton.trigger('click')
    expect(exportToExcel).not.toHaveBeenCalled()
  })

  test('hides export without permission and closes through v-model', async () => {
    const wrapper = mount(BomLocateResultsDialog, {
      props: { modelValue: true, results: [locateResult], canExport: false },
      global: testGlobal,
    })

    const buttons = wrapper.findAll('button')
    expect(buttons.map((button) => button.text())).toEqual(['关闭'])
    await buttons[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(exportToExcel).not.toHaveBeenCalled()
  })

  test('passes selected BOM IDs to the BOM export request', async () => {
    const wrapper = mount(Boms, { global: testGlobal })
    await nextTick()

    wrapper.vm.selectionMode = true
    wrapper.vm.selectedRows = [{ id: 12 }, { id: 34 }]
    await wrapper.vm.handleExportBom()

    expect(exportBoms).toHaveBeenCalledWith(expect.objectContaining({ ids: '12,34' }))
  })
})
