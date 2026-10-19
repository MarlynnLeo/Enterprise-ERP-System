import { ref } from 'vue'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useOrderActions } from '@/views/sales/composables/useOrderActions'

const mocks = vi.hoisted(() => ({
  getOrder: vi.fn(), getOrderUnshippedItems: vi.fn(), createOutbound: vi.fn(), updateOrderStatus: vi.fn(),
  message: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))
vi.mock('@/api', () => ({ salesApi: mocks }))
vi.mock('@/composables/useInventoryCheck', () => ({ checkInventory: vi.fn().mockResolvedValue([]) }))
vi.mock('@/utils/requestOptimizer', () => ({ clearAllRequestCaches: vi.fn() }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks.message }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { alert: vi.fn() } }))

describe('销售订单部分发货后继续发货', () => {
  beforeEach(() => { vi.clearAllMocks() })

  test('发货按钮使用聚合后的剩余数量和来源订单，不重复发出已履约数量', async () => {
    const row = { id: 7, orderNo: 'SO-PARTIAL', status: 'partial_shipped' }
    mocks.getOrder.mockResolvedValue({ data: { items: [{ materialId: 31, quantity: 10 }] } })
    mocks.getOrderUnshippedItems.mockResolvedValue({ data: { items: [
      { materialId: 31, orderedQuantity: 10, shippedQuantity: 4, remainingQuantity: 6, quantity: 6, unitId: 2, unitPrice: 15 },
    ] } })
    mocks.createOutbound.mockResolvedValue({ data: { id: 12 } })
    const refresh = vi.fn()
    await useOrderActions(refresh, ref([row])).handleShip(row)
    expect(mocks.getOrderUnshippedItems).toHaveBeenCalledWith(7)
    expect(mocks.createOutbound).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 7, status: 'draft', items: [{
        productId: 31, quantity: 6, sourceOrderId: 7, sourceOrderNo: 'SO-PARTIAL', unitId: 2, unitPrice: 15,
      }],
    }))
    expect(row.hasDraftOutbound).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test('列表过期而已无待发货物料时阻止生成空出库单', async () => {
    const row = { id: 7, orderNo: 'SO-PARTIAL', status: 'partial_shipped' }
    mocks.getOrder.mockResolvedValue({ data: { items: [{ materialId: 31, quantity: 10 }] } })
    mocks.getOrderUnshippedItems.mockResolvedValue({ data: { items: [] } })
    await useOrderActions(vi.fn(), ref([row])).handleShip(row)
    expect(mocks.createOutbound).not.toHaveBeenCalled()
    expect(mocks.message.warning).toHaveBeenCalledWith('订单已无待发货物料，请刷新列表')
  })

  test('确认后下游生成失败时保留缺货状态并明确提示，不报告确认成功', async () => {
    const row = { id: 7, orderNo: 'SO-SHORTAGE', status: 'draft' }
    mocks.getOrder.mockResolvedValue({ data: { items: [{ materialId: 31, quantity: 10 }] } })
    mocks.updateOrderStatus.mockResolvedValue({ data: {
      status: 'shortage', followUp: { status: 'failed', message: '订单已保存，生产计划生成失败：缺少已审核 BOM' },
    } })
    const refresh = vi.fn()
    await useOrderActions(refresh, ref([row])).handleConfirm(row)
    expect(row.status).toBe('shortage')
    expect(mocks.message.success).not.toHaveBeenCalled()
    expect(mocks.message.warning).toHaveBeenCalledWith(expect.objectContaining({
      message: '订单已保存，生产计划生成失败：缺少已审核 BOM', showClose: true,
    }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
