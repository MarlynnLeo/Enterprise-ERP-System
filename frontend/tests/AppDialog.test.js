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
  test('uses an explicit width instead of the default view width', () => {
    const wrapper = mountDialog({ mode: 'view', width: '960px', title: 'BOM' })
    expect(wrapper.findComponent(ElDialogStub).props('width')).toBe('960px')
  })

  test('content-width only affects body padding, not chrome width', () => {
    const wrapper = mountDialog({ mode: 'view', contentWidth: 'wide', title: 'Detail' })
    expect(wrapper.findComponent(ElDialogStub).props('width')).toBe('fit-content')
  })

  test('uses adaptive fit-content by default and forwards close state', async () => {
    const wrapper = mountDialog({ mode: 'view', title: 'Detail' })
    const dialog = wrapper.findComponent(ElDialogStub)

    expect(dialog.props('width')).toBe('fit-content')
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
