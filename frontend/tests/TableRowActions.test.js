import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import TableRowActions from '@/components/common/TableRowActions.vue'

const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot/></button>',
})

const ElPopconfirmStub = defineComponent({
  name: 'ElPopconfirmStub',
  emits: ['confirm'],
  template: '<span><slot name="reference"/></span>',
})

const mountActions = (props) =>
  mount(TableRowActions, {
    props: { row: { id: 1, status: 0 }, ...props },
    global: {
      stubs: {
        'el-button': ElButtonStub,
        'el-popconfirm': ElPopconfirmStub,
        'el-icon': true,
      },
    },
  })

describe('TableRowActions', () => {
  test('disabled records expose enable, edit and delete actions', () => {
    const wrapper = mountActions({ canUpdate: true, canDelete: true })

    expect(wrapper.text()).toContain('启用')
    expect(wrapper.text()).toContain('编辑')
    expect(wrapper.text()).toContain('删除')
    expect(wrapper.text()).not.toContain('禁用')
  })

  test('enabled records expose only the disable action', () => {
    const wrapper = mountActions({ row: { id: 1, status: 1 }, canUpdate: true, canDelete: true })

    expect(wrapper.text()).toContain('禁用')
    expect(wrapper.text()).not.toContain('启用')
    expect(wrapper.text()).not.toContain('编辑')
    expect(wrapper.text()).not.toContain('删除')
  })

  test('emits the row for an optional add action', async () => {
    const row = { id: 9, status: 0 }
    const wrapper = mountActions({ row, canAdd: true })

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('add')).toEqual([[row]])
  })
})
