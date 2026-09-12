import { describe, expect, test, vi } from 'vitest'
import { ref } from 'vue'
import { baseDataApi } from '@/api/baseData'
import { useProductProcessSelection } from '@/composables/useProductProcessSelection'
import { createRouteDraft, buildRoutePayload, validateRouteDetails, processSnapshotInstructions, formatStandardHours, routeStatusLabel } from '@/utils/productProcessRoute'
import productionRoutes from '@/router/modules/production'
import basedataRoutes from '@/router/modules/basedata'
import { prepareMenuTree } from '@/utils/menuTree'

vi.mock('@/api/baseData', () => ({ baseDataApi: { getProcessTemplates: vi.fn(), getProcessTemplate: vi.fn() } }))
const active = (id, productId) => ({ id, productId, name: '装配工艺', version: 'V2', status: 1, details: [] })
const response = list => ({ data: { list } })
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

describe('task process version selection', () => {
  test('new tasks select only the current version of their product', async () => {
    baseDataApi.getProcessTemplates.mockResolvedValue(response([active(10, 2), active(11, 3), { ...active(12, 2), status: 0 }]))
    const form = ref({ processTemplateId: 99 })
    const selection = useProductProcessSelection(form)
    await selection.fetchProductProcessTemplates(2)
    expect(form.value.processTemplateId).toBe(10)
    expect(selection.processTemplateList.value.map(row => row.id)).toEqual([10])
  })

  test('editing preserves the inactive version originally assigned to a task', async () => {
    const old = { ...active(8, 2), status: 0, version: 'V1' }
    baseDataApi.getProcessTemplates.mockResolvedValue(response([active(10, 2)]))
    baseDataApi.getProcessTemplate.mockResolvedValue({ data: old })
    const form = ref({ processTemplateId: 8 })
    const selection = useProductProcessSelection(form)
    await selection.fetchProductProcessTemplates(2, { preserveId: 8, preserveSelection: true })
    expect(form.value.processTemplateId).toBe(8)
    expect(selection.selectedTemplate.value.version).toBe('V1')
    expect(selection.processTemplateList.value.map(row => row.id)).toEqual([8, 10])
  })

  test('an old task with no assigned version stays unassigned after a new version is published', async () => {
    baseDataApi.getProcessTemplates.mockResolvedValue(response([active(10, 2)]))
    const form = ref({ processTemplateId: undefined })
    const selection = useProductProcessSelection(form)
    await selection.fetchProductProcessTemplates(2, { preserveSelection: true })
    expect(form.value.processTemplateId).toBeUndefined()
    expect(selection.selectedTemplate.value).toBeNull()
  })

  test('a late response for the previous product cannot overwrite the latest choice', async () => {
    const first = deferred(), second = deferred()
    baseDataApi.getProcessTemplates.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const form = ref({})
    const selection = useProductProcessSelection(form)
    const pendingFirst = selection.fetchProductProcessTemplates(2)
    const pendingSecond = selection.fetchProductProcessTemplates(3)
    second.resolve(response([active(11, 3)]))
    await pendingSecond
    first.resolve(response([active(10, 2)]))
    await pendingFirst
    expect(form.value.processTemplateId).toBe(11)
    expect(selection.processTemplateList.value.map(row => row.id)).toEqual([11])
    expect(selection.processTemplateLoading.value).toBe(false)
  })

  test('clearing the product invalidates an outstanding historical-version request', async () => {
    const history = deferred()
    baseDataApi.getProcessTemplates.mockResolvedValue(response([active(10, 2)]))
    baseDataApi.getProcessTemplate.mockReturnValue(history.promise)
    const form = ref({ processTemplateId: 8 })
    const selection = useProductProcessSelection(form)
    const pending = selection.fetchProductProcessTemplates(2, { preserveId: 8 })
    await Promise.resolve()
    await selection.fetchProductProcessTemplates(null)
    history.resolve({ data: { ...active(8, 2), status: 0 } })
    await pending
    expect(form.value.processTemplateId).toBeUndefined()
    expect(selection.processTemplateList.value).toEqual([])
    expect(selection.processTemplateLoading.value).toBe(false)
  })
})

describe('product process drafts and navigation', () => {
  const source = { id: 8, productId: 2, name: '工艺', version: 'V1', status: 1, details: [
    { id: 5, name: '装配', orderNum: 1, standardHours: '0.000123', instructionDocs: [{ name: '作业书', url: '/uploads/sop.pdf' }],
      materials: [{ materialId: 4, quantity: '2', isScanRequired: 1 }], sopContent: '按顺序装配', sopImages: ['/uploads/sop.png'] }
  ] }

  test('copying creates an independent draft with a required new version and source-document links', () => {
    const draft = createRouteDraft(source, true)
    expect(draft).toMatchObject({ id: null, version: '', sourceTemplateId: 8, status: 0 })
    draft.details[0].materials[0].quantity = 3
    draft.details[0].instructionDocs[0].name = '新版作业书'
    expect(source.details[0].materials[0].quantity).toBe('2')
    expect(source.details[0].instructionDocs[0].name).toBe('作业书')
    draft.version = ' V2 '
    const payload = buildRoutePayload(draft)
    expect(payload).toMatchObject({ version: 'V2', sourceTemplateId: 8, status: 0 })
    expect(payload.details[0]).toMatchObject({ standardHours: 0.000123, materials: [{ materialId: 4, quantity: 3, isScanRequired: true }] })
    expect(payload.details[0].id).toBeUndefined()
    expect(formatStandardHours(payload.details[0].standardHours)).toBe('0.000123')
  })

  test('validates duplicate sequence/code, missing material quantities and publication hours', () => {
    const step = createRouteDraft(source).details[0]
    expect(validateRouteDetails([step], true)).toBe('')
    expect(validateRouteDetails([{ ...step, standardHours: 0 }], true)).toContain('大于 0')
    expect(validateRouteDetails([step, { ...step }])).toContain('顺序')
    expect(validateRouteDetails([{ ...step, stepCode: 'S1' }, { ...step, orderNum: 2, stepCode: 's1' }])).toContain('编号')
    expect(validateRouteDetails([{ ...step, materials: [{ materialId: 4, quantity: 0 }] }])).toContain('用量')
  })

  test('instructions come from the task snapshot and handle absent historical data', () => {
    const snapshot = { instructionDocs: source.details[0].instructionDocs, sopContent: 'V1已固定', sopImages: [] }
    expect(processSnapshotInstructions({ processSnapshot: snapshot }).sopContent).toBe('V1已固定')
    expect(processSnapshotInstructions({ processSnapshot: JSON.stringify(snapshot) }).instructionDocs).toHaveLength(1)
    expect(processSnapshotInstructions({ processSnapshot: '{invalid' })).toEqual({ instructionDocs: [], sopContent: '', sopImages: [] })
    expect(routeStatusLabel({ status: 0, publishedAt: '2026-09-11' })).toBe('停用')
    expect(routeStatusLabel({ status: 0 })).toBe('草稿')
  })

  test('both URLs lead to one menu and preserve the old URL query', () => {
    const legacy = productionRoutes.find(route => route.name === 'processRoutes')
    expect(legacy.redirect({ query: { productId: '2' } })).toEqual({ path: '/basedata/process-templates', query: { productId: '2' } })
    const canonical = basedataRoutes.children.find(route => route.name === 'processTemplates')
    expect(canonical.meta.permission).toBe('basedata:processtemplates')
    expect(prepareMenuTree([{ id: 1, path: '/production/process-routes' }, { id: 2, path: '/basedata/process-templates' }]).map(menu => menu.path))
      .toEqual(['/basedata/process-templates'])
  })
})
