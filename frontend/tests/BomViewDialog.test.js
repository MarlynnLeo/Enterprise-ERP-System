import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import BomViewDialog from '@/views/baseData/components/BomViewDialog.vue'

vi.mock('element-plus', () => ({
  ElImageViewer: { template: '<div />' },
  ElMessage: { error: vi.fn() }
}))

vi.mock('@element-plus/icons-vue', () => ({
  View: { template: '<i />' },
  Download: { template: '<i />' }
}))

vi.mock('@/api', () => ({
  commonApi: { downloadResource: vi.fn() }
}))

const AppDialogStub = defineComponent({
  name: 'AppDialogStub',
  template: '<section><slot/><slot name="footer"/></section>'
})

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: {
    data: { type: Array, default: () => [] },
    rowKey: { type: [String, Function], default: 'id' }
  },
  template: '<div />'
})

const PassthroughStub = defineComponent({
  template: '<div><slot/></div>'
})

describe('BomViewDialog referenced BOM tree', () => {
  test('keeps referenced children visible with WBS numbering and unique row keys', () => {
    const wrapper = mount(BomViewDialog, {
      props: {
        modelValue: true,
        bomData: {
          details: [
            {
              id: 92211,
              bomId: 4437,
              treeKey: 'bom-4437/4437:92211:44',
              materialCode: '30059990231502',
              children: [
                {
                  id: 91632,
                  bomId: 4152,
                  treeKey: 'bom-4437/4437:92211:44/ref/4152:91632:0',
                  materialCode: '3005999023',
                  children: []
                }
              ]
            }
          ]
        }
      },
      global: {
        stubs: {
          AppDialog: AppDialogStub,
          'el-descriptions': true,
          'el-descriptions-item': true,
          'el-tabs': PassthroughStub,
          'el-tab-pane': PassthroughStub,
          'el-table': ElTableStub,
          'el-table-column': true,
          'el-tag': true,
          'el-button': true,
          'el-icon': true,
          'el-image-viewer': true
        }
      }
    })

    const table = wrapper.findComponent(ElTableStub)
    const rows = table.props('data')
    const rowKey = table.props('rowKey')

    expect(rows[0].wbs).toBe('1')
    expect(rows[0].children[0].wbs).toBe('1.1')
    expect(rows[0].children[0].materialCode).toBe('3005999023')
    expect(rowKey(rows[0])).toBe(rows[0].treeKey)
    expect(rowKey(rows[0].children[0])).toBe(rows[0].children[0].treeKey)
  })
})
