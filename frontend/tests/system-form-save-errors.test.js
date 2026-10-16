import fs from 'node:fs'
import vm from 'node:vm'
import { describe, expect, test, vi } from 'vitest'

const targets = [
  ['Users', 'saveUser', 'userFormRef', 'saveLoading', 'userForm'],
  ['Departments', 'saveDepartment', 'departmentFormRef', 'saveLoading', 'departmentForm'],
  ['Permissions', 'saveRole', 'roleFormRef', 'roleSaveLoading', 'roleForm'],
  ['Permissions', 'saveMenu', 'menuFormRef', 'menuSaveLoading', 'menuForm']
]
// Execute the actual closure with controlled validation and transport boundaries.
function prepare([file, handler, formRef, loading, form]) {
  const source = fs.readFileSync(`src/views/system/${file}.vue`, 'utf8')
  const body = source.match(new RegExp(`const ${handler} = async \\(\\) => \\{[\\s\\S]*?\\r?\\n\\};?`))[0]
  const validate = vi.fn().mockResolvedValue(true)
  const save = vi.fn().mockResolvedValue({ data: { id: 9 } })
  const message = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  const context = {
    [formRef]: { value: { validate } }, [loading]: { value: false },
    [form]: { id: null, roleIds: [], status: 1 }, resolveSignatureCode: () => null,
    systemApi: new Proxy({}, { get: () => save }), ElMessage: message,
    getApiErrorMessage: error => error.message, console: { error() {} },
    dialogVisible: { value: true }, roleDialogVisible: { value: true }, menuDialogVisible: { value: true },
    loadUsers() {}, loadDepartments() {}, loadRoles() {}, loadMenus() {}
  }
  vm.runInNewContext(`${body}\nthis.run = ${handler}`, context)
  return { context, validate, save, message, loading }
}
describe.each(targets)('%s %s saves', (...target) => {
  test('reports network failure while preserving the open dialog and releasing its lock', async () => {
    const state = prepare(target)
    state.save.mockRejectedValue(Object.assign(new Error('网络连接失败'), { code: 'ERR_NETWORK' }))
    await state.context.run()
    expect(state.save).toHaveBeenCalledTimes(1)
    expect(state.message.error).toHaveBeenCalledTimes(1)
    expect(state.message.success).not.toHaveBeenCalled()
    expect(state.context.dialogVisible.value).toBe(true)
    expect(state.context[state.loading].value).toBe(false)
  })
  test('field validation failure does not save or produce a false transport message', async () => {
    const state = prepare(target)
    state.validate.mockRejectedValue({ name: [{ message: '必填' }] })
    await state.context.run()
    expect(state.save).not.toHaveBeenCalled()
    expect(state.message.error).not.toHaveBeenCalled()
    expect(state.context[state.loading].value).toBe(false)
  })
  test('locks before asynchronous validation, so duplicate attempts cannot save twice', async () => {
    const state = prepare(target)
    let resolve
    state.validate.mockImplementation(() => new Promise(done => { resolve = done }))
    const first = state.context.run()
    await state.context.run()
    expect(state.validate).toHaveBeenCalledTimes(1)
    resolve(true)
    await first
    expect(state.save).toHaveBeenCalledTimes(1)
    expect(state.message.success).toHaveBeenCalledTimes(1)
    expect(state.context[state.loading].value).toBe(false)
  })
})
