import { createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import CIPList from '@/views/finance/assets/CIPList.vue'
import SourcePicker from '@/views/finance/assets/AssetCostSourcePicker.vue'
import { clickButton, fillField, financeDirectives, financeStubs } from './helpers/financeFormHarness'

const mocks = vi.hoisted(() => ({
  cip: Object.fromEntries(['getList', 'getDetail', 'create', 'update', 'delete', 'addCost', 'transfer'].map(name => [name, vi.fn()])),
  getSources: vi.fn(), message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))
vi.mock('@/api/finance', () => ({ financeApi: { assetCip: mocks.cip, getAssetCostSources: mocks.getSources } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks.message }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: vi.fn() } }))
let wrapper
const project = { id: 7, projectCode: 'CIP-7', projectName: 'Project', startDate: '2026-10-01', estimatedEndDate: '2026-11-30', accumulatedAmount: 100, status: '建设中', budget: 1000 }
const global = { plugins: [createPinia()], stubs: { ...financeStubs, ElCheckbox: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />' } }, directives: financeDirectives }
beforeEach(() => {
  Object.values(mocks.cip).forEach(mock => mock.mockReset().mockResolvedValue({ data: {} }))
  mocks.cip.getList.mockResolvedValue({ data: { list: [project], total: 1 } })
  mocks.cip.getDetail.mockResolvedValue({ data: { ...project, costSources: [] } })
  mocks.getSources.mockReset().mockResolvedValue({ data: [{ id: 21, entryNumber: 'GL-20', description: 'Line cost', availableAmount: 100 }] })
  Object.values(mocks.message).forEach(mock => mock.mockReset())
})
afterEach(() => wrapper?.unmount())

describe('CIP page contracts and source-backed operations', () => {
  test('renders the paginated list and create/edit submit only populated camel fields', async () => {
    wrapper = mount(CIPList, { global })
    await flushPromises()
    expect(wrapper.text()).toContain('CIP-7')
    await clickButton(wrapper, '新建在建工程')
    let form = wrapper.get('[data-dialog="新建在建工程"]')
    await fillField(form, 'projectCode', 'CIP-NEW')
    await fillField(form, 'projectName', 'New line')
    await clickButton(form, '确定')
    const created = mocks.cip.create.mock.calls[0][0]
    expect(created).toMatchObject({ projectCode: 'CIP-NEW', projectName: 'New line' })
    expect(created).not.toHaveProperty('project_code')
    expect(created).not.toHaveProperty('project_name')
    await clickButton(wrapper, '编辑')
    form = wrapper.get('[data-dialog="编辑在建工程"]')
    expect(form.get('[data-field="projectCode"] input').element.disabled).toBe(true)
    await fillField(form, 'projectName', 'Updated line')
    await fillField(form, '预计完工', '2026-12-01')
    await clickButton(form, '确定')
    expect(mocks.cip.update).toHaveBeenCalledWith(7, expect.objectContaining({ projectCode: 'CIP-7', projectName: 'Updated line', estimatedEndDate: '2026-12-01' }))
  })

  test('requires a cost source and sends the selected posted line with historical reconciliation mode', async () => {
    wrapper = mount(CIPList, { global })
    await flushPromises()
    await clickButton(wrapper, '归集成本')
    const form = wrapper.get('[data-dialog="归集成本"]')
    await fillField(form, '归集金额', 100)
    await clickButton(form, '确认归集')
    expect(mocks.cip.addCost).not.toHaveBeenCalled()
    await form.get('[data-field="成本凭证"] input').setValue('GL-20')
    await flushPromises()
    expect(mocks.getSources).toHaveBeenCalledWith({ kind: 'cip', search: 'GL-20' })
    await form.get('[data-field="成本凭证"] select').setValue('21')
    await form.get('[data-field="历史核对"] input').setValue(true)
    await clickButton(form, '确认归集')
    expect(mocks.cip.addCost).toHaveBeenCalledWith(7, { amount: 100, sourceEntryItemId: 21, reconcilesExisting: true })
  })

  test('transfer validates the actual fields before calling the capitalization endpoint', async () => {
    wrapper = mount(CIPList, { global })
    await flushPromises()
    await clickButton(wrapper, '转固')
    const form = wrapper.get('[data-dialog="在建工程转固"]')
    await clickButton(form, '确认转固')
    expect(mocks.cip.transfer).not.toHaveBeenCalled()
    await fillField(form, 'asset_code', 'FA-NEW')
    await clickButton(form, '确认转固')
    expect(mocks.cip.transfer).toHaveBeenCalledWith(7, expect.objectContaining({ assetData: expect.objectContaining({ asset_code: 'FA-NEW', asset_name: 'Project' }) }))
  })

  test('source picker returns the actual selected entry-item ID and surfaces lookup failure', async () => {
    wrapper = mount(SourcePicker, { props: { kind: 'asset' }, global })
    await wrapper.get('input').setValue('GL-20')
    await flushPromises()
    await wrapper.get('select').setValue('21')
    expect(wrapper.emitted('update:modelValue')).toEqual([[21]])
    mocks.getSources.mockRejectedValueOnce(new Error('Lookup failed'))
    await wrapper.get('input').setValue('GL-21')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('成本来源加载失败')
  })
})
