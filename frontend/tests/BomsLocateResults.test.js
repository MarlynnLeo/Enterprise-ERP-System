import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { BOM_DIALOG_WIDTH as SHARED_WIDTH_SENTINEL } from '@/constants/bom'
import Boms from '@/views/baseData/Boms.vue'
import BomViewDialog from '@/views/baseData/components/BomViewDialog.vue'
import BomFormDialog from '@/views/baseData/components/BomFormDialog.vue'

vi.mock('@/constants/bom', () => ({
  BOM_DIALOG_WIDTH: 'shared-bom-dialog-width-test',
}))

const exportToExcel = vi.fn()
const getBoms = vi.fn()
const getBomStats = vi.fn()

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
    locatePart: vi.fn(),
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
  'el-alert': PassthroughStub,
  'el-table': PassthroughStub,
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
  })
})
