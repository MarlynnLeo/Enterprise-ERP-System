import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import Materials from '@/views/baseData/Materials.vue'
import MaterialTable from '@/views/baseData/components/MaterialTable.vue'
import BomLocateResultsDialog from '@/views/baseData/components/BomLocateResultsDialog.vue'

const mocks = vi.hoisted(() => ({
  permissions: new Set(),
  getMaterials: vi.fn(),
  getMaterial: vi.fn(),
  getMaterialAttachments: vi.fn(),
  locatePart: vi.fn(),
  exportToExcel: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ hasPermission: permission => mocks.permissions.has(permission) }),
}))
vi.mock('@/api/material', () => ({
  materialApi: {
    getMaterials: mocks.getMaterials,
    getMaterial: mocks.getMaterial,
    getMaterialAttachments: mocks.getMaterialAttachments,
    getMaterialStats: vi.fn(async () => ({ data: {} })),
  },
}))
vi.mock('@/api/bom', () => ({ bomApi: { locatePart: mocks.locatePart } }))
vi.mock('@/api/baseData', () => ({
  baseDataApi: {
    getMaterialSources: vi.fn(async () => ({ data: [] })),
    getUnits: vi.fn(async () => ({ data: [] })),
    getProductCategoryOptions: vi.fn(async () => ({ data: [] })),
    getInspectionMethods: vi.fn(async () => ({ data: [] })),
  },
}))
vi.mock('@/api/common', () => ({
  commonApi: { getEnums: vi.fn(async () => ({ data: [] })) },
}))
vi.mock('@/utils/optionLoaders', () => ({
  loadLocationOptions: vi.fn(async () => []),
  loadUserListOptions: vi.fn(async () => []),
}))
vi.mock('@/composables/useExportExcel', () => ({
  useExportExcel: () => ({ exportLoading: false, exportToExcel: mocks.exportToExcel }),
}))
vi.mock('element-plus/es/components/message/index', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))
vi.mock('element-plus/es/components/message-box/index', () => ({
  ElMessageBox: { prompt: vi.fn() },
}))
vi.mock('@/views/baseData/components/MaterialFormDialog.vue', () => ({
  default: { name: 'MaterialFormDialog', template: '<div />' },
}))
vi.mock('@/views/baseData/components/MaterialStatCards.vue', () => ({
  default: { name: 'MaterialStatCards', template: '<div />' },
}))
vi.mock('@/views/baseData/components/MaterialViewDialog.vue', () => ({
  default: {
    name: 'MaterialViewDialog',
    props: ['modelValue', 'viewData', 'canLocateBom'],
    emits: ['locate'],
    template: `<section v-if="modelValue" data-testid="material-detail">
      <span>{{ viewData.name }}</span>
      <button
        v-if="canLocateBom"
        data-testid="material-detail-code"
        @click="$emit('locate', viewData)"
      >{{ viewData.code }}</button>
      <span v-else data-testid="material-detail-code">{{ viewData.code }}</span>
    </section>`,
  },
}))

const AppDialogStub = defineComponent({
  props: ['modelValue', 'title'],
  template: '<section v-if="modelValue" role="dialog" :aria-label="title"><slot /><footer><slot name="footer" /></footer></section>',
})
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: ['disabled', 'loading', 'type', 'icon', 'link'],
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () => h('button', {
      ...attrs,
      type: 'button',
      class: 'el-button',
      disabled: Boolean(props.disabled || props.loading),
      onClick: event => emit('click', event),
    }, slots.default?.())
  },
})
const PassthroughStub = defineComponent({
  inheritAttrs: false,
  setup(_props, { slots }) {
    return () => h('div', Object.values(slots).flatMap(slot => slot()))
  },
})
const AlertStub = defineComponent({
  props: ['title', 'type'],
  template: '<div role="alert" :data-type="type">{{ title }}</div>',
})

// Render the production column slots inside native cells so DOM clicks can
// bubble into the table's row-click event just as they do in Element Plus.
const TableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  emits: ['row-click'],
  setup(props, { emit, slots }) {
    return () => {
      const columns = (slots.default?.() || []).filter(column => column.props?.label)
      return h('table', [h('tbody', props.data.map((row, index) => h('tr', {
        'data-row-id': row.id ?? index,
        onClick: event => emit('row-click', row, null, event),
      }, columns.map(column => h('td', { 'data-column': column.props.prop || column.props.label },
        column.children?.default
          ? column.children.default({ row, $index: index })
          : String(row[column.props.prop] ?? ''),
      )))))])
    }
  },
})

const materials = [
  { id: 1, code: 'M-001', name: '螺栓', status: 1 },
  { id: 2, code: 'M-002', name: '螺母', status: 1 },
]
const firstResult = {
  productCode: 'P-001', productName: '装配产品一', version: 'V1.0',
  materialCode: 'M-001', materialName: '螺栓', quantity: 2, unit: '个',
}
const secondResult = {
  productCode: 'P-002', productName: '装配产品二', version: 'V2.0',
  materialCode: 'M-002', materialName: '螺母', quantity: 4, unit: '个',
}
const wrappers = []
const openMaterials = async () => {
  const wrapper = mount(Materials, { global: {
    mocks: { $t: key => key },
    directives: { loading: {} },
    stubs: {
      AppDialog: AppDialogStub,
      FinanceQueryCard: PassthroughStub,
      PageHeader: PassthroughStub,
      TableRowActions: true,
      EmptyState: true,
      'el-button': ButtonStub,
      'el-alert': AlertStub,
      'el-table': TableStub,
      'el-table-column': true,
      'el-card': PassthroughStub,
      'el-form-item': PassthroughStub,
      'el-input': true,
      'el-select': true,
      'el-option': true,
      'el-tag': PassthroughStub,
      'el-pagination': true,
      'el-dropdown': PassthroughStub,
      'el-dropdown-menu': PassthroughStub,
      'el-dropdown-item': PassthroughStub,
      'el-icon': PassthroughStub,
      'el-upload': true,
    },
  } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
const codeCell = (wrapper, id = 1) => wrapper.findComponent(MaterialTable).get(`[data-row-id="${id}"] [data-column="code"]`)
const detailCode = wrapper => wrapper.get('[data-testid="material-detail-code"]')
const openMaterialDetail = async (wrapper, id = 1) => {
  await codeCell(wrapper, id).trigger('click')
  await flushPromises()
}
const clickDetailCode = async wrapper => {
  await detailCode(wrapper).trigger('click')
  await flushPromises()
}
const locateDialog = wrapper => wrapper.get('[role="dialog"][aria-label="零部件定位结果"]')
const dialogButton = (wrapper, label) => locateDialog(wrapper).findAll('button').find(button => button.text() === label)
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  return { promise, resolve, reject }
}

beforeEach(() => {
  mocks.permissions.clear()
  ;['basedata:materials:view', 'basedata:boms:view', 'basedata:boms:export'].forEach(permission => mocks.permissions.add(permission))
  mocks.getMaterials.mockReset().mockResolvedValue({ data: { list: materials, total: 2 } })
  mocks.getMaterial.mockReset().mockImplementation(async id => ({
    data: materials.find(material => material.id === id) || materials[0],
  }))
  mocks.getMaterialAttachments.mockReset().mockResolvedValue({ data: [] })
  mocks.locatePart.mockReset().mockResolvedValue({ data: [firstResult] })
  mocks.exportToExcel.mockReset()
  delete window.__material_options_cache_v2__
})
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

describe('Materials BOM location shortcut', () => {
  test('keeps the main-table code unchanged and locates BOMs from the material detail code', async () => {
    const wrapper = await openMaterials()
    expect(codeCell(wrapper).text()).toBe('M-001')
    expect(codeCell(wrapper).find('button').exists()).toBe(false)

    await openMaterialDetail(wrapper)
    expect(wrapper.get('[data-testid="material-detail"]').text()).toContain('螺栓')
    expect(detailCode(wrapper).text()).toBe('M-001')

    await clickDetailCode(wrapper)
    await flushPromises()

    expect(mocks.locatePart).toHaveBeenCalledExactlyOnceWith('M-001')
    expect(locateDialog(wrapper).get('[role="alert"]').text()).toContain("共找到 1 个BOM包含物料 'M-001'")
    expect(locateDialog(wrapper).findAll('td').map(cell => cell.text())).toEqual([
      'P-001', '装配产品一', 'V1.0', 'M-001', '螺栓', '2', '个',
    ])
    expect(mocks.getMaterial).toHaveBeenCalledExactlyOnceWith(1)
    expect(mocks.getMaterialAttachments).toHaveBeenCalledExactlyOnceWith(1)
    expect(wrapper.find('[data-testid="material-detail"]').exists()).toBe(true)
  })

  test('clicking another cell still opens the ordinary material detail', async () => {
    const wrapper = await openMaterials()
    await wrapper.findComponent(MaterialTable).get('[data-row-id="1"] [data-column="name"]').trigger('click')
    await flushPromises()

    expect(mocks.getMaterial).toHaveBeenCalledExactlyOnceWith(1)
    expect(mocks.getMaterialAttachments).toHaveBeenCalledExactlyOnceWith(1)
    expect(wrapper.get('[data-testid="material-detail"]').text()).toContain('螺栓')
    expect(mocks.locatePart).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  test('without BOM view permission the code stays plain text and preserves ordinary detail access', async () => {
    mocks.permissions.delete('basedata:boms:view')
    const wrapper = await openMaterials()

    expect(codeCell(wrapper).text()).toBe('M-001')
    expect(codeCell(wrapper).find('button').exists()).toBe(false)
    await openMaterialDetail(wrapper)
    expect(detailCode(wrapper).element.tagName).toBe('SPAN')
    await detailCode(wrapper).trigger('click')
    expect(mocks.locatePart).not.toHaveBeenCalled()
    expect(mocks.getMaterial).toHaveBeenCalledExactlyOnceWith(1)
    expect(wrapper.get('[data-testid="material-detail"]').text()).toContain('螺栓')
  })

  test.each([
    { materialExport: true, bomExport: false },
    { materialExport: false, bomExport: true },
  ])('BOM result export uses its own permission: %j', async ({ materialExport, bomExport }) => {
    if (materialExport) mocks.permissions.add('basedata:materials:export')
    if (!bomExport) mocks.permissions.delete('basedata:boms:export')
    const wrapper = await openMaterials()
    await openMaterialDetail(wrapper)
    await clickDetailCode(wrapper)

    const exportButton = dialogButton(wrapper, '导出')
    expect(Boolean(exportButton)).toBe(bomExport)
    if (bomExport) {
      await exportButton.trigger('click')
      expect(mocks.exportToExcel).toHaveBeenCalledWith(expect.objectContaining({
        data: [firstResult], filename: '零部件定位结果',
      }))
    } else {
      expect(mocks.exportToExcel).not.toHaveBeenCalled()
    }
  })

  test('shows loading immediately, then an empty result with export unavailable', async () => {
    const request = deferred()
    mocks.locatePart.mockReturnValueOnce(request.promise)
    const wrapper = await openMaterials()
    await openMaterialDetail(wrapper)
    await clickDetailCode(wrapper)

    expect(locateDialog(wrapper).get('[role="alert"]').text()).toBe('正在定位物料…')
    expect(locateDialog(wrapper).find('table').exists()).toBe(false)
    expect(dialogButton(wrapper, '导出').element.disabled).toBe(true)

    request.resolve({ data: [] })
    await flushPromises()
    expect(locateDialog(wrapper).get('[role="alert"]').text()).toBe("未找到包含物料 'M-001' 的BOM")
    expect(locateDialog(wrapper).find('table').exists()).toBe(false)
    expect(dialogButton(wrapper, '导出').element.disabled).toBe(true)
  })

  test('clears previous results during a failed lookup and can recover on the next click', async () => {
    const wrapper = await openMaterials()
    await openMaterialDetail(wrapper)
    await clickDetailCode(wrapper)
    await dialogButton(wrapper, '关闭').trigger('click')

    const request = deferred()
    mocks.locatePart.mockReturnValueOnce(request.promise)
    await openMaterialDetail(wrapper, 2)
    await clickDetailCode(wrapper)
    expect(locateDialog(wrapper).find('table').exists()).toBe(false)
    request.reject({ response: { data: { message: '定位服务暂时不可用，请稍后重试' } } })
    await flushPromises()
    expect(locateDialog(wrapper).get('[role="alert"]').text()).toBe('定位服务暂时不可用，请稍后重试')
    expect(locateDialog(wrapper).find('table').exists()).toBe(false)
    expect(dialogButton(wrapper, '导出').element.disabled).toBe(true)

    await dialogButton(wrapper, '关闭').trigger('click')
    mocks.locatePart.mockResolvedValueOnce({ data: [secondResult] })
    await clickDetailCode(wrapper)
    expect(locateDialog(wrapper).get('[role="alert"]').attributes('data-type')).toBe('success')
    expect(locateDialog(wrapper).get('[data-column="productCode"]').text()).toBe('P-002')
    expect(dialogButton(wrapper, '导出').element.disabled).toBe(false)
  })

  test.each(['resolve', 'reject'])('a late %s from an earlier code cannot replace the current result', async completion => {
    const firstRequest = deferred()
    const secondRequest = deferred()
    mocks.locatePart.mockReturnValueOnce(firstRequest.promise).mockReturnValueOnce(secondRequest.promise)
    const wrapper = await openMaterials()
    await openMaterialDetail(wrapper)
    await clickDetailCode(wrapper)
    await dialogButton(wrapper, '关闭').trigger('click')
    await openMaterialDetail(wrapper, 2)
    await clickDetailCode(wrapper)
    secondRequest.resolve({ data: [secondResult] })
    await flushPromises()

    firstRequest[completion](completion === 'resolve' ? { data: [firstResult] } : new Error('旧请求失败'))
    await flushPromises()
    expect(mocks.locatePart.mock.calls).toEqual([['M-001'], ['M-002']])
    expect(locateDialog(wrapper).get('[role="alert"]').text()).toContain("包含物料 'M-002'")
    expect(locateDialog(wrapper).get('[data-column="productCode"]').text()).toBe('P-002')
    expect(dialogButton(wrapper, '导出').element.disabled).toBe(false)
  })

  test.each(['resolve', 'reject'])('closing a pending lookup stays closed after its %s', async completion => {
    const request = deferred()
    mocks.locatePart.mockReturnValueOnce(request.promise)
    const wrapper = await openMaterials()
    await openMaterialDetail(wrapper)
    await clickDetailCode(wrapper)
    await dialogButton(wrapper, '关闭').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    request[completion](completion === 'resolve' ? { data: [firstResult] } : new Error('请求失败'))
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findComponent(BomLocateResultsDialog).props('modelValue')).toBe(false)
  })
})
