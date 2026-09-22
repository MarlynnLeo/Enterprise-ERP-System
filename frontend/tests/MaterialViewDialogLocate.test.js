import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import MaterialViewDialog from '@/views/baseData/components/MaterialViewDialog.vue'

const AppDialogStub = defineComponent({
  props: { modelValue: Boolean },
  template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>',
})

const ButtonStub = defineComponent({
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>',
})

const PassthroughStub = defineComponent({
  template: '<div><slot /></div>',
})

const viewData = {
  code: 'M-001',
  name: '螺栓',
  materialType: 'raw',
  status: 1,
}

const mountDialog = canLocateBom => mount(MaterialViewDialog, {
  props: {
    modelValue: true,
    viewData,
    canLocateBom,
  },
  global: {
    stubs: {
      AppDialog: AppDialogStub,
      'el-button': ButtonStub,
      'el-descriptions': PassthroughStub,
      'el-descriptions-item': PassthroughStub,
      'el-tag': PassthroughStub,
      'el-link': PassthroughStub,
      'el-icon': PassthroughStub,
    },
  },
})

describe('MaterialViewDialog BOM location entry', () => {
  test('emits the material row when the detail code is clicked', async () => {
    const wrapper = mountDialog(true)
    const codeButton = wrapper.findAll('button').find(button => button.text() === 'M-001')

    expect(codeButton).toBeTruthy()
    await codeButton.trigger('click')

    expect(wrapper.emitted('locate')).toEqual([[viewData]])
  })

  test('keeps the detail code plain without BOM view permission', () => {
    const wrapper = mountDialog(false)

    expect(wrapper.findAll('button').some(button => button.text() === 'M-001')).toBe(false)
    expect(wrapper.text()).toContain('M-001')
  })
})
