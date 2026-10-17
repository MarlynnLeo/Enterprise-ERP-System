import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import RecordEditor from '@/views/equipment/RecordEditor.vue'
import Maintenance from '@/views/equipment/Maintenance.vue'
import Repair from '@/views/equipment/Repair.vue'
import UniversalListPage from '@/components/common/UniversalListPage.vue'

const mocks = vi.hoisted(() => ({
  updateMaintenance: vi.fn(),
  updateFailure: vi.fn(),
  hasPermission: vi.fn(),
  toast: vi.fn()
}))
vi.mock('@/api', () => ({ equipmentApi: mocks }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ hasPermission: mocks.hasPermission, user: { realName: '张工' } })
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('vant', async (original) => ({ ...(await original()), showToast: mocks.toast }))

let wrapper
const record = {
  id: 31,
  equipmentId: 8,
  equipmentName: '设备甲',
  status: 'in_progress',
  maintenancePerson: '张工',
  maintenanceDate: '2026-10-01',
  description: '原计划'
}
const mount = (props = {}) => {
  wrapper = shallowMount(RecordEditor, {
    props: { show: true, record, kind: 'maintenance', ...props },
    global: { renderStubDefaultSlot: true }
  })
  wrapper.vm.$.setupState.formRef = { validate: async () => true }
  return wrapper
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.hasPermission.mockReturnValue(true)
  mocks.updateMaintenance.mockResolvedValue({ data: {} })
  mocks.updateFailure.mockResolvedValue({ data: {} })
})
afterEach(() => wrapper?.unmount())

describe('mobile equipment processing', () => {
  test('viewing an incomplete historical record does not invent completion evidence', () => {
    mount({ record: { id: 31, status: 'completed' } })
    expect(wrapper.vm.form).toMatchObject({ person: '', completedDate: '', cost: '' })
  })
  test('completes the selected original maintenance record', async () => {
    mount()
    Object.assign(wrapper.vm.form, {
      result: '试机通过',
      completedDate: '2026-10-01',
      cost: '20.50'
    })
    await wrapper.vm.submit()
    expect(mocks.updateMaintenance).toHaveBeenCalledWith(
      31,
      expect.objectContaining({
        status: 'completed',
        expectedStatus: 'in_progress',
        maintenancePerson: '张工',
        remarks: '试机通过',
        cost: 20.5,
        completedDate: '2026-10-01'
      })
    )
    expect(record.description).toBe('原计划')
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')[0]).toEqual([false])
  })
  test('saves failure resolution, actual cost and downtime to the original failure ID', async () => {
    mount({
      kind: 'failure',
      record: { id: 42, equipmentId: 8, status: 'repairing', resolvedBy: '李工' }
    })
    Object.assign(wrapper.vm.form, { result: '恢复运行', cost: '100', downtimeHours: '2.5' })
    await wrapper.vm.submit()
    expect(mocks.updateFailure).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        repairStatus: 'resolved',
        expectedStatus: 'repairing',
        resolvedBy: '李工',
        resolution: '恢复运行',
        repairCost: 100,
        downtimeHours: 2.5
      })
    )
  })
  test('prevents duplicate save and keeps evidence after a network rejection', async () => {
    let reject
    mocks.updateMaintenance.mockReturnValueOnce(
      new Promise((resolve, fail) => {
        reject = fail
      })
    )
    mount()
    wrapper.vm.form.result = '保留结果'
    const first = wrapper.vm.submit()
    await wrapper.vm.submit()
    wrapper.vm.close(false)
    expect(mocks.updateMaintenance).toHaveBeenCalledOnce()
    expect(wrapper.emitted('update:show')).toBeUndefined()
    reject(new Error('网络中断'))
    await first
    expect(wrapper.vm.form.result).toBe('保留结果')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
    expect(mocks.toast).toHaveBeenCalledWith('网络中断')
  })
  test.each([{ result: '' }, { result: '通过', cost: '-1' }, { result: '通过', cost: 'NaN' }])(
    'requires valid completion evidence %j',
    async (fields) => {
      mount()
      Object.assign(wrapper.vm.form, fields)
      await wrapper.vm.submit()
      expect(mocks.updateMaintenance).not.toHaveBeenCalled()
    }
  )
  test.each([
    [false, 'in_progress'],
    [true, 'completed']
  ])('permission %s, state %s cannot submit', async (permission, status) => {
    mocks.hasPermission.mockReturnValue(permission)
    mount({ record: { ...record, status, remarks: '已完成' } })
    await wrapper.vm.submit()
    expect(wrapper.vm.canEdit).toBe(false)
    expect(mocks.updateMaintenance).not.toHaveBeenCalled()
  })
  test.each([
    [Maintenance, 'maintenance'],
    [Repair, 'failure']
  ])('list opens its selected record for %s', async (component, kind) => {
    wrapper = shallowMount(component)
    wrapper.findComponent(UniversalListPage).vm.$emit('item-click', record)
    await flushPromises()
    expect(wrapper.findComponent(RecordEditor).props()).toMatchObject({
      show: true,
      record: { id: 31, equipmentId: 8 },
      kind
    })
  })
})
