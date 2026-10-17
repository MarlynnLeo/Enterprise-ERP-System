import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import DocumentManagement from '@/views/system/DocumentManagement.vue'

const { getList, create, uploadFile } = vi.hoisted(() => ({
  getList: vi.fn(), create: vi.fn(), uploadFile: vi.fn()
}))
vi.mock('@/api/enhanced', () => ({ documentApi: { getList, create } }))
vi.mock('@/api/common', () => ({ commonApi: { uploadFile } }))
vi.mock('element-plus/es/components/message/index', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
}))

const Container = defineComponent({ template: '<div><slot/><slot name="footer"/><slot name="actions"/></div>' })
const Form = defineComponent({ props: ['model'], template: '<div><slot/></div>' })
const Upload = defineComponent({ props: ['onChange', 'onRemove', 'fileList'], template: '<div/>' })
const Button = defineComponent({ emits: ['click'], template: '<button @click="$emit(\'click\')"><slot/></button>' })
const Pagination = defineComponent({
  props: ['currentPage', 'pageSize', 'total'], emits: ['update:currentPage', 'change'], template: '<div/>'
})
const Table = defineComponent({ props: ['data'], template: '<div/>' })
const Query = defineComponent({ emits: ['search'], template: '<div/>' })
const wrappers = []

const open = () => {
  const wrapper = mount(DocumentManagement, { global: {
    stubs: {
      PageHeader: Container, AppDialog: Container, ElCard: Container, ElForm: Form,
      ElFormItem: Container, ElButton: Button, ElUpload: Upload, ElPagination: Pagination,
      ElTable: Table, ElTableColumn: true, ElInput: true, ElSelect: true, ElOption: true,
      ElPopconfirm: true, FinanceQueryCard: Query
    },
    directives: { permission: () => {}, loading: () => {} }
  } })
  wrappers.push(wrapper)
  return wrapper
}
const click = (wrapper, text) => wrapper.findAll('button').find(button => button.text() === text).trigger('click')

beforeEach(() => {
  getList.mockReset().mockResolvedValue({ data: { list: [], total: 41 } })
  create.mockReset().mockResolvedValue({ data: { id: 1 } })
  uploadFile.mockReset().mockResolvedValue({ data: { url: '/uploads/doc.pdf' } })
})
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

describe('document management', () => {
  test('paginator uses the same page size as the API and a filter restarts page one', async () => {
    const wrapper = open()
    await flushPromises()
    const pagination = wrapper.findComponent(Pagination)
    expect(pagination.props('pageSize')).toBe(20)
    pagination.vm.$emit('update:currentPage', 3)
    pagination.vm.$emit('change', 3)
    await flushPromises()
    expect(getList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3, pageSize: 20 }))
    wrapper.findComponent(Query).vm.$emit('search')
    await flushPromises()
    expect(getList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }))
  })

  test('an older query cannot replace the latest document results', async () => {
    let finishOld
    getList.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve }))
      .mockResolvedValueOnce({ data: { list: [{ id: 2 }], total: 1 } })
    const wrapper = open()
    wrapper.findComponent(Query).vm.$emit('search')
    await flushPromises()
    finishOld({ data: { list: [{ id: 1 }], total: 41 } })
    await flushPromises()
    expect(wrapper.findComponent(Table).props('data')).toEqual([{ id: 2 }])
  })

  test('removing a selected attachment prevents it from being uploaded or saved', async () => {
    const wrapper = open()
    await click(wrapper, '上传文档')
    wrapper.findComponent(Form).props('model').name = 'Document without file'
    const upload = wrapper.findComponent(Upload)
    upload.props('onChange')({ name: 'private.pdf', size: 4, raw: new File(['test'], 'private.pdf') })
    upload.props('onRemove')()
    await click(wrapper, '保存')
    await flushPromises()
    expect(uploadFile).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ file_url: 'manual' }))
    expect(create.mock.calls[0][0]).not.toHaveProperty('_file')
    expect(create.mock.calls[0][0]).not.toHaveProperty('fileName')
  })

  test('a malformed upload response cannot silently create a document without its attachment', async () => {
    uploadFile.mockResolvedValueOnce({ data: {} })
    const wrapper = open()
    await click(wrapper, '上传文档')
    wrapper.findComponent(Form).props('model').name = 'Attachment required'
    wrapper.findComponent(Upload).props('onChange')({ name: 'report.pdf', raw: new File(['test'], 'report.pdf') })
    await click(wrapper, '保存')
    await flushPromises()
    expect(create).not.toHaveBeenCalled()
  })
})
