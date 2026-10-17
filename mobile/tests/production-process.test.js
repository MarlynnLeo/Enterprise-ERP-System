import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import Processes from '@/views/production/Processes.vue'
import { productionApi } from '@/api'
import { List, NoticeBar, PullRefresh, Search, showDialog, showToast } from 'vant'

const { auth, router } = vi.hoisted(() => ({
  auth: { hasPermission: vi.fn() },
  router: { back: vi.fn() }
}))
vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/api', () => ({ productionApi: {
  getProductionTasks: vi.fn(), startProductionTask: vi.fn(), updateProcess: vi.fn()
} }))
vi.mock('vant', async importOriginal => ({
  ...await importOriginal(), showToast: vi.fn(), showDialog: vi.fn(async () => {})
}))

const allStatuses = 'material_issued,material_partial_issued,in_progress,inspection,warehousing,completed'
const taskRecord = (changes = {}) => ({
  id: 7, code: 'SC-007', productName: '装配产品', quantity: 10, completedQuantity: 0,
  expectedEndDate: '2026-10-12', progress: 0, status: 'material_issued',
  processes: [
    { id: 11, processName: '备件', sequence: 1, status: 'pending', progress: 0 },
    { id: 12, processName: '装配', sequence: 2, status: 'pending', progress: 0 }
  ],
  ...changes
})
const response = (task = taskRecord(), total = 1) => ({ data: { items: [task], total } })
let wrapper
beforeEach(() => {
  vi.clearAllMocks()
  auth.hasPermission.mockReturnValue(true)
  productionApi.getProductionTasks.mockReset().mockResolvedValue(response())
  productionApi.startProductionTask.mockReset().mockResolvedValue({ data: {} })
  productionApi.updateProcess.mockReset().mockResolvedValue({ data: {} })
})
afterEach(() => wrapper?.unmount())

async function open(task, total = 1) {
  if (task) productionApi.getProductionTasks.mockResolvedValue(response(task, total))
  wrapper = shallowMount(Processes, { global: {
    renderStubDefaultSlot: true,
    stubs: {
      VanButton: {
        props: ['disabled', 'loading'],
        template: '<button :disabled="disabled || loading"><slot /></button>'
      },
      Field: { template: '<div><slot name="input" /><slot /></div>' }
    }
  } })
  await flushPromises()
  return wrapper.vm
}
async function expandTask() {
  await wrapper.find('.expand-button').trigger('click')
}
const button = (container, label) => container.findAll('button').find(item => item.text() === label)

describe('mobile production process workflow', () => {
  test('restricts the first page and keeps keyword/status filters across pagination and refresh', async () => {
    const view = await open(taskRecord(), 30)
    expect(productionApi.getProductionTasks).toHaveBeenCalledTimes(1)
    expect(productionApi.getProductionTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1, statusList: allStatuses
    }))
    expect(wrapper.text()).toContain('计划完成：2026-10-12')

    view.searchValue = '  SC-007  '
    wrapper.findComponent(Search).vm.$emit('search')
    await flushPromises()
    await wrapper.findAll('.filter-chip').find(item => item.text() === '生产中').trigger('click')
    await flushPromises()
    expect(productionApi.getProductionTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1, keyword: 'SC-007', statusList: 'in_progress'
    }))
    await view.onLoad()
    expect(productionApi.getProductionTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 2, keyword: 'SC-007', statusList: 'in_progress'
    }))
    wrapper.findComponent(PullRefresh).vm.$emit('refresh')
    await flushPromises()
    expect(productionApi.getProductionTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1, keyword: 'SC-007', statusList: 'in_progress'
    }))
    wrapper.findComponent(Search).vm.$emit('clear')
    await flushPromises()
    expect(productionApi.getProductionTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1, keyword: undefined, statusList: 'in_progress'
    }))
  })

  test('keeps later pages on the submitted keyword while search input is still being edited', async () => {
    await open(taskRecord(), 30)
    const search = wrapper.findComponent(Search)
    search.vm.$emit('update:modelValue', 'SC-007')
    search.vm.$emit('search')
    await flushPromises()
    expect(productionApi.getProductionTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1, keyword: 'SC-007', statusList: allStatuses
    }))

    search.vm.$emit('update:modelValue', '  新产品  ')
    wrapper.findComponent(List).vm.$emit('load')
    await flushPromises()
    expect(productionApi.getProductionTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 2, keyword: 'SC-007', statusList: allStatuses
    }))

    search.vm.$emit('search')
    await flushPromises()
    expect(productionApi.getProductionTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1, keyword: '新产品', statusList: allStatuses
    }))
  })

  test('blocks later processes until preceding processes finish, then starts through the process endpoint', async () => {
    const view = await open()
    await expandTask()
    const processes = wrapper.findAll('.process-item')
    expect(button(processes[0], '开始工序').attributes('disabled')).toBeUndefined()
    expect(button(processes[1], '开始工序').attributes('disabled')).toBeDefined()
    expect(processes[1].text()).toContain('请先完成前序工序')
    const task = view.taskList[0]
    await view.startProcess(task, task.processes[1])
    expect(productionApi.updateProcess).not.toHaveBeenCalled()

    await button(processes[0], '开始工序').trigger('click')
    await flushPromises()
    expect(productionApi.updateProcess).toHaveBeenCalledWith(11, { status: 'in_progress', progress: 0 })
    expect(productionApi.getProductionTasks).toHaveBeenCalledTimes(2)
    expect(productionApi.getProductionTasks).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, statusList: allStatuses }))
  })

  test('permits the next process after preceding work was completed or skipped', async () => {
    await open(taskRecord({ status: 'in_progress', processes: [
      { id: 10, sequence: 1, status: 'completed', progress: 100 },
      { id: 11, sequence: 2, status: 'cancelled', progress: 100 },
      { id: 12, sequence: 3, status: 'pending', progress: 0 }
    ] }))
    await expandTask()
    await button(wrapper.findAll('.process-item')[2], '开始工序').trigger('click')
    await flushPromises()
    expect(productionApi.updateProcess).toHaveBeenCalledWith(12, { status: 'in_progress', progress: 0 })
  })

  test('keeps process viewers read-only and guards handlers as well as buttons', async () => {
    auth.hasPermission.mockImplementation(permission => permission === 'production:process:view')
    const view = await open()
    await expandTask()
    expect(button(wrapper, '开始生产')).toBeUndefined()
    expect(wrapper.find('.process-actions').exists()).toBe(false)
    const task = view.taskList[0]
    await view.startTask(task)
    await view.startProcess(task, task.processes[0])
    await view.completeProcess(task, task.processes[0])
    view.openProgress(task, task.processes[0])
    expect(view.showProgress).toBe(false)
    expect(productionApi.updateProcess).not.toHaveBeenCalled()
    expect(productionApi.startProductionTask).not.toHaveBeenCalled()
  })

  test('requires the task update permission for starting a task, while process updates remain available', async () => {
    auth.hasPermission.mockImplementation(permission => permission === 'production:process:update')
    const view = await open()
    await expandTask()
    expect(button(wrapper, '开始生产')).toBeUndefined()
    expect(button(wrapper, '开始工序')).toBeDefined()
    await view.startTask(view.taskList[0])
    expect(productionApi.startProductionTask).not.toHaveBeenCalled()
  })

  test('starts a task with both permissions and refreshes its status', async () => {
    await open()
    await button(wrapper, '开始生产').trigger('click')
    await flushPromises()
    expect(productionApi.startProductionTask).toHaveBeenCalledWith(7)
    expect(productionApi.getProductionTasks).toHaveBeenCalledTimes(2)
  })

  test('prevents duplicate or competing writes until the current update and refresh finish', async () => {
    let resolveUpdate
    productionApi.updateProcess.mockImplementationOnce(() => new Promise(resolve => { resolveUpdate = resolve }))
    const view = await open()
    await expandTask()
    const task = view.taskList[0]
    const first = view.startProcess(task, task.processes[0])
    await view.startProcess(task, task.processes[0])
    await view.startTask(task)
    await flushPromises()
    expect(productionApi.updateProcess).toHaveBeenCalledTimes(1)
    expect(productionApi.startProductionTask).not.toHaveBeenCalled()
    expect(button(wrapper, '开始生产').attributes('disabled')).toBeDefined()
    resolveUpdate({ data: {} })
    await first
    expect(view.pendingAction).toBe('')
    expect(productionApi.getProductionTasks).toHaveBeenCalledTimes(2)
  })

  test('completes work at 100%, refreshes the list, and retains quality warnings', async () => {
    const warning = '工序已完成；首件或过程检验尚未关闭，完成检验后将自动进入终检。'
    productionApi.updateProcess.mockResolvedValue({ data: { data: { warnings: [warning] } } })
    await open(taskRecord({ status: 'in_progress', processes: [
      { id: 11, sequence: 1, status: 'in_progress', progress: 50 }
    ] }))
    await expandTask()
    await button(wrapper, '完成工序').trigger('click')
    await flushPromises()
    expect(productionApi.updateProcess).toHaveBeenCalledWith(11, { status: 'completed', progress: 100 })
    expect(productionApi.getProductionTasks).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(NoticeBar).props('text')).toBe(warning)
  })

  test('shows quality blocking details without pretending the operation succeeded', async () => {
    productionApi.updateProcess.mockRejectedValue({ response: { data: {
      errorCode: 'OPEN_INSPECTIONS', message: '尚有未关闭的过程检验单，请先完成检验'
    } } })
    const view = await open(taskRecord({ status: 'in_progress', processes: [
      { id: 11, sequence: 1, status: 'in_progress', progress: 50 }
    ] }))
    const task = view.taskList[0]
    await view.completeProcess(task, task.processes[0])
    expect(showDialog).toHaveBeenCalledWith(expect.objectContaining({ message: '尚有未关闭的过程检验单，请先完成检验' }))
    expect(showToast).not.toHaveBeenCalledWith('工序已完成')
    expect(view.pendingAction).toBe('')
    expect(productionApi.getProductionTasks).toHaveBeenCalledTimes(1)
  })

  test('keeps an in-progress process at 0% without reversing its state and saves a legal completion', async () => {
    const view = await open(taskRecord({ status: 'in_progress', processes: [
      { id: 11, processName: '装配', sequence: 1, status: 'in_progress', progress: 20 }
    ] }))
    const task = view.taskList[0]
    view.openProgress(task, task.processes[0])
    expect(view.availableProcessStatuses).toEqual(['in_progress', 'completed'])
    view.progressForm.progress = 0
    await view.submitProgress()
    expect(productionApi.updateProcess).toHaveBeenLastCalledWith(11, { status: 'in_progress', progress: 0, remarks: '' })

    view.openProgress(task, task.processes[0])
    view.progressForm.status = 'completed'
    view.changeFormStatus('completed')
    await view.submitProgress()
    expect(productionApi.updateProcess).toHaveBeenLastCalledWith(11, { status: 'completed', progress: 100, remarks: '' })
    expect(view.showProgress).toBe(false)
  })

  test('rejects illegal pending completion and status/progress mismatches before sending', async () => {
    const view = await open()
    const task = view.taskList[0]
    view.openProgress(task, task.processes[0])
    expect(view.availableProcessStatuses).toEqual(['pending', 'in_progress'])
    view.progressForm.status = 'completed'
    view.progressForm.progress = 100
    await view.submitProgress()
    view.progressForm.status = 'pending'
    view.progressForm.progress = 10
    await view.submitProgress()
    view.progressForm.status = 'in_progress'
    view.progressForm.progress = 100
    await view.submitProgress()
    expect(productionApi.updateProcess).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('请检查工序状态与完成进度')
    view.openProgress(task, task.processes[1])
    expect(view.availableProcessStatuses).toEqual(['pending'])
  })

  test.each(['inspection', 'warehousing', 'completed'])(
    'removes mutation controls after a task reaches %s', async status => {
      await open(taskRecord({ status }))
      await expandTask()
      expect(button(wrapper, '开始生产')).toBeUndefined()
      expect(wrapper.find('.process-actions').exists()).toBe(false)
    }
  )
})
