import { defineComponent, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, test } from 'vitest'
import { ElForm } from 'element-plus/es/components/form/index'
import { ElInputNumber } from 'element-plus/es/components/input-number/index'
import VoucherNumberInput from '@/views/finance/gl/entries/VoucherNumberInput.vue'

let wrapper
afterEach(() => wrapper?.unmount())
const open = () => {
  wrapper = mount(defineComponent({
    components: { ElForm, VoucherNumberInput },
    setup: () => ({ value: ref(null), formDisabled: ref(true), fieldDisabled: ref(undefined) }),
    template: '<ElForm :disabled="formDisabled"><VoucherNumberInput v-model="value" :disabled="fieldDisabled" :precision="8" :controls="false" aria-label="汇率" /></ElForm>',
  }), { attachTo: document.body })
}

test('real Element Plus numeric input updates ARIA when its loading form becomes enabled, preserving null', async () => {
  open()
  const input = wrapper.get('input')
  expect(wrapper.findComponent(ElInputNumber).exists()).toBe(true)
  expect(input.element.disabled).toBe(true)
  expect(input.attributes('aria-disabled')).toBe('true')
  expect(wrapper.vm.value).toBeNull()
  wrapper.vm.formDisabled = false
  await flushPromises()
  expect(input.element.disabled).toBe(false)
  expect(input.attributes('aria-disabled')).toBe('false')
  expect(input.element.value).toBe('')
  expect(wrapper.vm.value).toBeNull()
  await input.setValue('7.125')
  expect(wrapper.vm.value).toBe(7.125)
  await input.setValue('')
  expect(wrapper.vm.value).toBeNull()
  expect(input.attributes('aria-disabled')).toBe('false')
})

test('real Element Plus numeric input exposes field disable/re-enable transitions to assistive technology', async () => {
  open()
  wrapper.vm.formDisabled = false
  wrapper.vm.fieldDisabled = true
  await flushPromises()
  const input = wrapper.get('input')
  expect(input.element.disabled).toBe(true)
  expect(input.attributes('aria-disabled')).toBe('true')
  wrapper.vm.fieldDisabled = false
  await flushPromises()
  expect(input.element.disabled).toBe(false)
  expect(input.attributes('aria-disabled')).toBe('false')
  expect(wrapper.vm.value).toBeNull()
  wrapper.vm.fieldDisabled = true
  await flushPromises()
  expect(input.element.disabled).toBe(true)
  expect(input.attributes('aria-disabled')).toBe('true')
})
