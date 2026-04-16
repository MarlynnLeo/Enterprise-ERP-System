<!--
/**
 * OrderDetail.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="order-detail-page">
    <NavBar title="采购订单详情" left-arrow @click-left="onClickLeft">
      <template #right>
        <Icon name="edit" size="18" @click="editOrder" v-if="order && order.status === 'draft'" />
      </template>
    </NavBar>

    <div class="content-container" v-if="order">
      <!-- 基本信息 -->
      <div class="info-section">
        <div class="section-header">
          <h3>基本信息</h3>
          <span :class="['status-tag', order.status]">
            {{ getOrderStatusText(order.status) }}
          </span>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="label">订单编号</span>
            <span class="value">{{ order.order_no }}</span>
          </div>
          <div class="info-item">
            <span class="label">供应商</span>
            <span class="value">{{ order.supplier_name }}</span>
          </div>
          <div class="info-item" v-if="order.contact_person">
            <span class="label">联系人</span>
            <span class="value">{{ order.contact_person }}</span>
          </div>
          <div class="info-item" v-if="order.contact_phone">
            <span class="label">联系电话</span>
            <span class="value">{{ order.contact_phone }}</span>
          </div>
          <div class="info-item">
            <span class="label">订单日期</span>
            <span class="value">{{ formatDateTime(order.order_date) }}</span>
          </div>
          <div class="info-item">
            <span class="label">预计交货日期</span>
            <span class="value">{{ formatDateTime(order.expected_delivery_date) }}</span>
          </div>
          <div class="info-item">
            <span class="label">订单金额</span>
            <span class="value amount">¥{{ formatAmount(order.total_amount) }}</span>
          </div>
          <div class="info-item" v-if="order.remark">
            <span class="label">备注</span>
            <span class="value">{{ order.remark }}</span>
          </div>
        </div>
      </div>

      <!-- 收货进度 -->
      <div class="info-section" v-if="order.received_amount > 0">
        <div class="section-header">
          <h3>收货进度</h3>
        </div>

        <div class="progress-container">
          <div class="progress-stats">
            <div class="stat-item">
              <span class="stat-label">订单金额</span>
              <span class="stat-value">¥{{ formatAmount(order.total_amount) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">已收货金额</span>
              <span class="stat-value">¥{{ formatAmount(order.received_amount) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">收货进度</span>
              <span class="stat-value">{{ getReceivePercent(order) }}%</span>
            </div>
          </div>

          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: getReceivePercent(order) + '%' }"></div>
          </div>
        </div>
      </div>

      <!-- 订单明细 -->
      <div class="info-section" v-if="orderItems && orderItems.length > 0">
        <div class="section-header">
          <h3>订单明细</h3>
        </div>

        <div class="items-list">
          <div v-for="item in orderItems" :key="item.id" class="item-row">
            <div class="item-info">
              <div class="item-name">{{ item.material_name }}</div>
              <div class="item-code">{{ item.material_code }}</div>
              <div class="item-spec" v-if="item.specification">{{ item.specification }}</div>
            </div>
            <div class="item-details">
              <div class="item-quantity">数量: {{ item.quantity }} {{ item.unit }}</div>
              <div class="item-price">单价: ¥{{ formatAmount(item.unit_price) }}</div>
              <div class="item-total">小计: ¥{{ formatAmount(item.total_price) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 时间信息 -->
      <div class="info-section">
        <div class="section-header">
          <h3>时间信息</h3>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="label">创建时间</span>
            <span class="value">{{ formatDateTime(order.created_at) }}</span>
          </div>
          <div class="info-item">
            <span class="label">更新时间</span>
            <span class="value">{{ formatDateTime(order.updated_at) }}</span>
          </div>
          <div class="info-item" v-if="order.created_by">
            <span class="label">创建人</span>
            <span class="value">{{ order.created_by }}</span>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <Button
          v-if="order.status === 'draft'"
          type="success"
          size="large"
          @click="confirmOrder"
          style="margin-bottom: 12px"
        >
          确认订单
        </Button>
        <Button
          v-if="order.status === 'confirmed'"
          type="primary"
          size="large"
          @click="createReceipt"
          style="margin-bottom: 12px"
        >
          创建入库单
        </Button>
        <Button
          v-if="order.status === 'draft'"
          type="danger"
          size="large"
          @click="cancelOrder"
          style="margin-bottom: 12px"
        >
          取消订单
        </Button>
        <Button type="default" size="large" @click="viewSupplier" v-if="order.supplier_id">
          查看供应商
        </Button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-else-if="loading" class="loading-container">
      <Loading size="24px" />
      <span>加载中...</span>
    </div>

    <!-- 错误状态 -->
    <div v-else class="error-container">
      <Empty description="采购订单不存在或已被删除" />
      <Button type="primary" @click="onClickLeft">返回列表</Button>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { NavBar, Icon, Button, Loading, Empty, showToast, Dialog } from 'vant'
  import { purchaseApi } from '@/services/api'

  const router = useRouter()
  const route = useRoute()

  const order = ref(null)
  const orderItems = ref([])
  const loading = ref(true)

  // 获取订单详情
  const fetchOrderDetail = async () => {
    try {
      loading.value = true
      const orderId = route.params.id

      const response = await purchaseApi.getOrder(orderId)
      order.value = response.data
      orderItems.value = response.data?.items || []
    } catch (error) {
      console.error('获取采购订单详情失败:', error)
      showToast('获取采购订单详情失败')
    } finally {
      loading.value = false
    }
  }

  // 返回上一页
  const onClickLeft = () => {
    router.back()
  }

  // 编辑订单
  const editOrder = () => {
    router.push(`/purchase/orders/${order.value.id}/edit`)
  }

  // 确认订单
  const confirmOrder = async () => {
    try {
      await Dialog.confirm({
        title: '确认订单',
        message: '确定要确认这个采购订单吗？'
      })

      await purchaseApi.updateOrderStatus(order.value.id, 'confirmed')
      showToast('订单已确认')

      // 刷新数据
      fetchOrderDetail()
    } catch (error) {
      if (error !== 'cancel') {
        console.error('确认订单失败:', error)
        showToast('确认订单失败')
      }
    }
  }

  // 取消订单
  const cancelOrder = async () => {
    try {
      await Dialog.confirm({
        title: '取消订单',
        message: '确定要取消这个采购订单吗？'
      })

      await purchaseApi.updateOrderStatus(order.value.id, 'cancelled')
      showToast('订单已取消')

      // 刷新数据
      fetchOrderDetail()
    } catch (error) {
      if (error !== 'cancel') {
        console.error('取消订单失败:', error)
        showToast('取消订单失败')
      }
    }
  }

  // 创建入库单
  const createReceipt = () => {
    router.push(`/purchase/receipts/create?orderId=${order.value.id}`)
  }

  // 查看供应商
  const viewSupplier = () => {
    router.push(`/baseData/suppliers/${order.value.supplier_id}`)
  }

  import { getPurchaseStatusText } from '@/constants/systemConstants'

  // 获取订单状态文本（使用统一常量）
  const getOrderStatusText = (status) => {
    return getPurchaseStatusText(status)
  }

  // 计算收货进度百分比
  const getReceivePercent = (order) => {
    if (!order.total_amount || order.total_amount === 0) return 0
    const percent = Math.round(((order.received_amount || 0) / order.total_amount) * 100)
    return Math.min(percent, 100)
  }

  // 格式化金额
  const formatAmount = (amount) => {
    if (!amount) return '0.00'
    return parseFloat(amount).toFixed(2)
  }

  // 格式化日期时间
  const formatDateTime = (dateTime) => {
    if (!dateTime) return '-'
    return new Date(dateTime).toLocaleString('zh-CN')
  }

  onMounted(() => {
    fetchOrderDetail()
  })
</script>

<style lang="scss" scoped>
  .order-detail-page {
    height: 100vh;
    background-color: var(--bg-secondary);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content-container {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    -webkit-overflow-scrolling: touch;
  }

  .info-section {
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 16px;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--glass-border);

    h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
    }
  }

  .status-tag {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;

    &.draft {
      background-color: var(--bg-tertiary);
      color: var(--text-secondary);
    }

    &.confirmed {
      background-color: rgba(59, 130, 246, 0.15);
      color: var(--color-info);
    }

    &.partial_received {
      background-color: rgba(234, 179, 8, 0.15);
      color: var(--color-warning);
    }

    &.completed {
      background-color: rgba(34, 197, 94, 0.15);
      color: var(--color-success);
    }

    &.cancelled {
      background-color: rgba(239, 68, 68, 0.15);
      color: var(--color-error);
    }
  }

  .info-grid {
    padding: 16px;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;

    &:last-child {
      margin-bottom: 0;
    }

    .label {
      color: var(--text-secondary);
      font-size: 0.875rem;
      min-width: 80px;
      flex-shrink: 0;
    }

    .value {
      color: var(--text-primary);
      font-size: 0.875rem;
      text-align: right;
      flex: 1;
      margin-left: 16px;
      word-break: break-all;

      &.amount {
        color: var(--van-primary-color);
        font-weight: 600;
      }
    }
  }

  .progress-container {
    padding: 16px;
  }

  .progress-stats {
    display: flex;
    justify-content: space-around;
    margin-bottom: 16px;
  }

  .stat-item {
    text-align: center;

    .stat-label {
      display: block;
      color: var(--text-secondary);
      font-size: 0.75rem;
      margin-bottom: 4px;
    }

    .stat-value {
      display: block;
      color: var(--text-primary);
      font-size: 1rem;
      font-weight: 600;
    }
  }

  .progress-bar {
    height: 8px;
    background-color: var(--bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background-color: var(--van-primary-color);
    transition: width 0.3s ease;
  }

  .items-list {
    padding: 16px;
  }

  .item-row {
    display: flex;
    justify-content: space-between;
    padding: 12px;
    border: 1px solid var(--glass-border);
    border-radius: 6px;
    margin-bottom: 8px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .item-info {
    flex: 1;

    .item-name {
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .item-code {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-bottom: 2px;
    }

    .item-spec {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
  }

  .item-details {
    text-align: right;
    font-size: 0.75rem;

    .item-quantity,
    .item-price,
    .item-total {
      margin-bottom: 2px;
      color: var(--text-secondary);

      &:last-child {
        margin-bottom: 0;
      }
    }

    .item-total {
      color: var(--van-primary-color);
      font-weight: 500;
    }
  }

  .action-buttons {
    padding: 16px 0;
  }

  .loading-container,
  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;

    span {
      margin-top: 12px;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
  }
</style>
