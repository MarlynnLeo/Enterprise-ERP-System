import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import AppDialog from '@/components/ui/AppDialog.vue'

const ElDialogStub = defineComponent({
  name: 'ElDialogStub',
  props: {
    modelValue: Boolean,
    width: [String, Number],
    fullscreen: Boolean
  },
  emits: ['update:modelValue'],
  template: '<section><slot name="header"/><slot/><slot name="footer"/></section>'
})

const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot/></button>'
})

const mountDialog = (props = {}) =>
  mount(AppDialog, {
    props: { modelValue: true, ...props },
    global: {
      stubs: {
        'el-dialog': ElDialogStub,
        'el-button': ElButtonStub
      },
      directives: {
        loading: {}
      }
    }
  })

describe('AppDialog interaction contract', () => {
  test('uses the ERP detail width and forwards close state', async () => {
    const wrapper = mountDialog({ mode: 'view', title: 'Detail' })
    const dialog = wrapper.findComponent(ElDialogStub)

    expect(dialog.props('width')).toBe('800px')
    dialog.vm.$emit('update:modelValue', false)
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  test('preview fullscreen button changes the dialog state', async () => {
    const wrapper = mountDialog({ mode: 'preview', title: 'Preview' })
    expect(wrapper.findComponent(ElDialogStub).props('fullscreen')).toBe(false)

    await wrapper.get('button').trigger('click')

    expect(wrapper.findComponent(ElDialogStub).props('fullscreen')).toBe(true)
    expect(wrapper.findComponent(ElDialogStub).props('width')).toBe('100%')
  })
})
