import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import Editor from '@/views/equipment/components/EquipmentRecordEditor.vue'
import RecordPage from '@/views/equipment/components/EquipmentRecordPage.vue'

const mocks = vi.hoisted(() => ({
  updateMaintenance: vi.fn(),
  updateFailure: vi.fn(),
  getMaintenances: vi.fn(),
  hasPermission: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/api', () => ({ equipmentApi: mocks }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ hasPermission: mocks.hasPermission, user: { realName: '张工' } }),
}))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))
vi.mock('@/utils/themePageSize', () => ({ getThemeDefaultPageSize: () => 20 }))
let wrapper
const record = {
  id: 31,
  equipmentId: 8,
  equipmentName: '设备甲',
  status: 'in_progress',
  maintenancePerson: '张工',
  maintenanceDate: '2026-10-01',
  description: '原计划',
  cost: 10,
}
const mount = (props = {}) => {
  wrapper = shallowMount(Editor, {
    props: { modelValue: true, record, kind: 'maintenance', ...props },
    global: {
      config: { warnHandler: () => {} },
      renderStubDefaultSlot: true,
      stubs: { AppDialog: { template: '<div><slot /><slot name="footer" /></div>' } },
    },
  })
  wrapper.vm.$.setupState.formRef = { validate: async () => true }
  return wrapper
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.hasPermission.mockReturnValue(true)
  mocks.updateMaintenance.mockResolvedValue({ data: {} })
  mocks.updateFailure.mockResolvedValue({ data: {} })
  mocks.getMaintenances.mockResolvedValue({ data: { list: [record], total: 1 } })
})
afterEach(() => wrapper?.unmount())

describe('desktop equipment processing', () => {
  test('viewing an incomplete historical record does not invent completion evidence', () => {
    mount({ record: { id: 31, status: 'completed' } })
    expect(wrapper.vm.form).toMatchObject({ person: '', completedDate: '', cost: undefined })
  })
  test('finishes the selected original maintenance record and preserves its plan description', async () => {
    mount()
    Object.assign(wrapper.vm.form, {
      result: '更换滤芯后试运行通过',
      completedDate: '2026-10-01',
      partsReplaced: '滤芯',
      cost: 12.5,
    })
    await wrapper.vm.submit()
    expect(mocks.updateMaintenance).toHaveBeenCalledWith(
      31,
      expect.objectContaining({
        status: 'completed',
        expectedStatus: 'in_progress',
        maintenancePerson: '张工',
        remarks: '更换滤芯后试运行通过',
        cost: 12.5,
        completedDate: '2026-10-01',
      })
    )
    expect(mocks.updateMaintenance.mock.calls[0][1]).not.toHaveProperty('description')
    expect(record.description).toBe('原计划')
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })
  test('failure repair form submits canonical repair fields to the same failure ID', async () => {
    mount({
      kind: 'failure',
      record: { id: 42, equipmentId: 8, status: 'repairing', resolvedBy: '李工' },
    })
    Object.assign(wrapper.vm.form, { result: '更换电源后试机通过', cost: 100, downtimeHours: 2 })
    await wrapper.vm.submit()
    expect(mocks.updateFailure).toHaveBeenCalledWith(42, {
      repairStatus: 'resolved',
      expectedStatus: 'repairing',
      resolvedBy: '李工',
      resolution: '更换电源后试机通过',
      repairCost: 100,
      downtimeHours: 2,
      remarks: '',
    })
  })
  test('waits for in-flight save and keeps edits visible when save fails', async () => {
    let reject
    mocks.updateMaintenance.mockReturnValueOnce(
      new Promise((resolve, fail) => {
        reject = fail
      })
    )
    mount()
    wrapper.vm.form.result = '保留这一段执行结果'
    const first = wrapper.vm.submit()
    await wrapper.vm.submit()
    wrapper.vm.close(false)
    expect(mocks.updateMaintenance).toHaveBeenCalledOnce()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    reject(new Error('网络中断'))
    await first
    expect(wrapper.vm.form.result).toBe('保留这一段执行结果')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(mocks.error).toHaveBeenCalledWith('网络中断')
  })
  test('blocks missing completion evidence before calling API', async () => {
    mount()
    await wrapper.vm.submit()
    expect(mocks.updateMaintenance).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('请填写执行人和处理结果')
  })
  test.each([
    ['readonly', false, 'in_progress'],
    ['terminal', true, 'completed'],
  ])('%s records cannot be changed', async (_, permission, status) => {
    mocks.hasPermission.mockReturnValue(permission)
    mount({ record: { ...record, status, remarks: '已执行' } })
    await wrapper.vm.submit()
    expect(wrapper.vm.canEdit).toBe(false)
    expect(mocks.updateMaintenance).not.toHaveBeenCalled()
  })
  test('list opens its original record in the editor', async () => {
    wrapper = shallowMount(RecordPage, {
      props: {
        title: '保养记录',
        apiMethod: 'getMaintenances',
        columns: [],
        recordKind: 'maintenance',
      },
      global: { config: { warnHandler: () => {} }, stubs: { ElTable: true, ElTableColumn: true } },
    })
    await flushPromises()
    wrapper.vm.openRecord(wrapper.vm.rows[0])
    await flushPromises()
    const editor = wrapper.findComponent(Editor)
    expect(editor.props()).toMatchObject({ modelValue: true, record: { id: 31, equipmentId: 8 } })
    editor.vm.$emit('saved')
    await flushPromises()
    expect(mocks.getMaintenances).toHaveBeenCalledTimes(2)
  })
})
