import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import CustomerFormDialog from '@/views/baseData/components/CustomerFormDialog.vue'

const updateCustomer = vi.fn()
vi.mock('@/api/baseData', () => ({
  baseDataApi: {
    updateCustomer: (...args) => updateCustomer(...args),
    createCustomer: vi.fn(),
  },
}))

const Container = defineComponent({ template: '<div><slot/><slot name="footer"/></div>' })
const Form = defineComponent({
  props: ['model', 'rules'],
  setup(_props, { expose }) {
    expose({ validate: (callback) => callback(true), resetFields: () => {} })
  },
  template: '<form><slot/></form>',
})
const Button = defineComponent({
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot/></button>',
})

describe('CustomerFormDialog status contract', () => {
  beforeEach(() => updateCustomer.mockReset().mockResolvedValue({ success: true }))

  test.each([0, 'inactive'])('keeps a disabled customer disabled when saving status %s', async (status) => {
    const wrapper = mount(CustomerFormDialog, {
      props: { modelValue: true, editData: { id: 3, code: 'CUS-3', name: 'Disabled customer', status } },
      global: {
        stubs: {
          AppDialog: Container, ElForm: Form, ElFormItem: Container, ElButton: Button,
          ElInput: true, ElSelect: true, ElOption: true, ElInputNumber: true,
          ElRadioGroup: true, ElRadio: true,
          ElDescriptions: true, ElDescriptionsItem: true, ElTag: true,
        },
      },
    })
    await flushPromises()
    expect(wrapper.findComponent(Form).props('model').status).toBe(0)
    await wrapper.findAll('button').find(button => button.text() === '确定').trigger('click')
    await flushPromises()
    expect(updateCustomer).toHaveBeenCalledWith(3, expect.objectContaining({ status: 0 }))
    wrapper.unmount()
  })
})
