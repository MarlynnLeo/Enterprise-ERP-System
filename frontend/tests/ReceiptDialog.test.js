import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import ReceiptDialog from '@/views/purchase/ReceiptDialog.vue'

const getReceiptProcessingDetail = vi.fn()
const getReceiptDetail = vi.fn()

vi.mock('@/api/purchase', () => ({
  purchaseApi: {
    outsourcedProcessing: {
      getDetail: vi.fn()
    },
    outsourcedReceipts: {
      getProcessingDetail: (...args) => getReceiptProcessingDetail(...args),
      getDetail: (...args) => getReceiptDetail(...args),
      create: vi.fn(),
      update: vi.fn()
    }
  }
}))

vi.mock('@/utils/optionLoaders', () => ({
  loadOutsourcedReceiptProcessingOptions: vi.fn(async () => []),
  loadOutsourcedReceiptWarehouseOptions: vi.fn(async () => []),
  searchOutsourcedReceiptProcessingOptions: vi.fn(async () => [])
}))

vi.mock('@/constants/systemConstants', () => ({
  getOutsourcedStatusText: (status) => ({ completed: '已完成' }[status] || status),
  getOutsourcedStatusColor: (status) => ({ completed: 'success' }[status] || 'info')
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}))

const AppDialogStub = defineComponent({
  name: 'AppDialogStub',
  props: { modelValue: Boolean },
  template: '<section><slot/><slot name="footer"/></section>'
})

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: {
    data: { type: Array, default: () => [] }
  },
  template: '<div />'
})

const PassthroughStub = defineComponent({
  template: '<div><slot/></div>'
})

describe('ReceiptDialog processing product mapping', () => {
  test('shows product fields and expected/actual quantities when creating a receipt', async () => {
    getReceiptProcessingDetail.mockResolvedValue({
      data: {
        id: 7,
        processingNo: 'WW260824001',
        supplierId: 472,
        supplierName: '北京英拓文远智能科技有限公司',
        products: [
          {
            productId: 12147,
            productCode: '300300402024',
            productName: '底座（钻孔）',
            specification: '钻孔',
            unit: '个',
            unitId: 2,
            quantity: '1.00',
            receivableQuantity: '1.00',
            unitPrice: '20.00',
            totalPrice: '20.00'
          }
        ]
      }
    })

    const wrapper = mount(ReceiptDialog, {
      props: {
        visible: false,
        mode: 'create',
        processingId: 7
      },
      global: {
        stubs: {
          AppDialog: AppDialogStub,
          'el-form': PassthroughStub,
          'el-card': PassthroughStub,
          'el-row': PassthroughStub,
          'el-col': PassthroughStub,
          'el-form-item': PassthroughStub,
          'el-input': true,
          'el-date-picker': true,
          'el-select': PassthroughStub,
          'el-option': true,
          'el-descriptions': PassthroughStub,
          'el-descriptions-item': PassthroughStub,
          'el-divider': PassthroughStub,
          'el-tag': PassthroughStub,
          'el-table': ElTableStub,
          'el-table-column': true,
          'el-input-number': true,
          'el-button': true
        }
      }
    })

    await wrapper.setProps({ visible: true })
    await flushPromises()

    expect(getReceiptProcessingDetail).toHaveBeenCalledWith(7)
    expect(wrapper.findComponent(ElTableStub).props('data')).toEqual([
      expect.objectContaining({
        productId: 12147,
        productCode: '300300402024',
        productName: '底座（钻孔）',
        specification: '钻孔',
        expectedQuantity: 1,
        actualQuantity: 0,
        unitPrice: 20,
        totalPrice: 0
      })
    ])
  })

  test('renders a read-only receipt detail layout instead of disabled form controls', async () => {
    getReceiptDetail.mockResolvedValue({
      data: {
        id: 9,
        receiptNo: 'WWRK260825002',
        processingId: 8,
        processingNo: 'WW260825002',
        supplierId: 472,
        supplierName: '北京英拓文远智能科技有限公司',
        locationId: 3,
        warehouseName: '成品库',
        receiptDate: '2026-08-25',
        operator: '管理员',
        remarks: '委外入库完成',
        status: 'completed',
        items: [
          {
            productId: 12147,
            productCode: '300300402024',
            productName: '底座（钻孔）',
            specification: '钻孔',
            unit: '个',
            unitId: 2,
            expectedQuantity: '1.00',
            actualQuantity: '1.00',
            unitPrice: '20.00',
            totalPrice: '20.00'
          }
        ]
      }
    })

    const wrapper = mount(ReceiptDialog, {
      props: {
        visible: false,
        mode: 'view',
        receiptId: 9
      },
      global: {
        stubs: {
          AppDialog: AppDialogStub,
          'el-form': PassthroughStub,
          'el-card': PassthroughStub,
          'el-row': PassthroughStub,
          'el-col': PassthroughStub,
          'el-form-item': PassthroughStub,
          'el-input': true,
          'el-date-picker': true,
          'el-select': PassthroughStub,
          'el-option': true,
          'el-descriptions': PassthroughStub,
          'el-descriptions-item': PassthroughStub,
          'el-divider': PassthroughStub,
          'el-tag': PassthroughStub,
          'el-table': ElTableStub,
          'el-table-column': true,
          'el-input-number': true,
          'el-button': PassthroughStub
        }
      }
    })

    await wrapper.setProps({ visible: true })
    await flushPromises()

    expect(getReceiptDetail).toHaveBeenCalledWith(9)
    expect(wrapper.find('.receipt-view').exists()).toBe(true)
    expect(wrapper.find('.form-container').exists()).toBe(false)
    expect(wrapper.text()).toContain('WWRK260825002')
    expect(wrapper.text()).toContain('北京英拓文远智能科技有限公司')
    expect(wrapper.text()).toContain('入库成品明细')
    expect(wrapper.findComponent(ElTableStub).props('data')).toEqual([
      expect.objectContaining({
        productCode: '300300402024',
        productName: '底座（钻孔）',
        expectedQuantity: 1,
        actualQuantity: 1,
        unitPrice: 20,
        totalPrice: 20
      })
    ])
  })
})
