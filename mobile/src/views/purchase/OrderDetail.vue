<!--
/**
 * OrderDetail.vue
 * @description 采购订单详情 - 对齐网页端操作逻辑
 * @date 2026-04-25
 * @version 2.0.0
 */
-->
<template>
  <div class="order-detail-page">
    <NavBar title="采购订单详情" left-arrow @click-left="onClickLeft">
      <template #right>
        <Icon name="edit" size="18" @click="editOrder" v-if="order && order.status === 'draft'" v-permission="'purchase:orders:update'" />
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
            <span class="value">{{ order.orderNo }}</span>
          </div>
          <div class="info-item">
            <span class="label">供应商</span>
            <span class="value">{{ order.supplierName }}</span>
          </div>
          <div class="info-item" v-if="order.contactPerson">
            <span class="label">联系人</span>
            <span class="value">{{ order.contactPerson }}</span>
          </div>
          <div class="info-item" v-if="order.contactPhone">
            <span class="label">联系电话</span>
            <span class="value">{{ order.contactPhone }}</span>
          </div>
          <div class="info-item">
            <span class="label">订单日期</span>
            <span class="value">{{ formatDateTime(order.orderDate) }}</span>
          </div>
          <div class="info-item">
            <span class="label">预计交货日期</span>
            <span class="value">{{ formatDateTime(order.expectedDeliveryDate) }}</span>
          </div>
          <div class="info-item">
            <span class="label">订单金额</span>
            <span class="value amount">{{ displayAmount(order.totalAmount) }}</span>
          </div>
          <div class="info-item" v-if="order.remarks">
            <span class="label">备注</span>
            <span class="value">{{ order.remarks }}</span>
          </div>
        </div>
      </div>

      <!-- 收货进度 -->
      <div class="info-section" v-if="order.receivedAmount > 0 || order.completionPercentage > 0">
        <div class="section-header">
          <h3>收货进度</h3>
        </div>

        <div class="progress-container">
          <div class="progress-stats">
            <div class="stat-item">
              <span class="stat-label">订单金额</span>
              <span class="stat-value">{{ displayAmount(order.totalAmount) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">已收货金额</span>
              <span class="stat-value">{{ displayAmount(order.receivedAmount) }}</span>
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
              <div class="item-name">{{ item.materialName }}</div>
              <div class="item-code">{{ item.materialCode }}</div>
              <div class="item-spec" v-if="item.specification">{{ item.specification }}</div>
            </div>
            <div class="item-details">
              <div class="item-quantity">数量: {{ item.quantity }} {{ item.unitName || item.unit }}</div>
              <div class="item-price">单价: {{ displayAmount(item.unitPrice || item.price) }}</div>
              <div class="item-total">小计: {{ displayAmount(item.totalPrice || item.amount) }}</div>
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
            <span class="value">{{ formatDateTime(order.createdAt) }}</span>
          </div>
          <div class="info-item">
            <span class="label">更新时间</span>
            <span class="value">{{ formatDateTime(order.updatedAt) }}</span>
          </div>
          <div class="info-item" v-if="order.createdByName || order.createdBy">
            <span class="label">创建人</span>
            <span class="value">{{ order.createdByName || order.createdBy }}</span>
          </div>
        </div>
      </div>

      <!-- 操作按钮 — 严格对齐网页端状态流转 -->
      <div class="action-buttons">
        <!-- draft(草稿): 提交审批、删除 -->
        <template v-if="order.status === 'draft'">
          <Button
            v-permission="'purchase:orders:update'"
            type="success"
            size="large"
            round
            block
            @click="submitForApproval"
            :loading="actionLoading"
            :disabled="!hasSupplier"
            style="margin-bottom: 10px"
          >
            提交审批
          </Button>
          <div v-if="!hasSupplier" class="supplier-hint">请先编辑订单并设置供应商后再提交审批</div>
          <Button
            v-permission="'purchase:orders:delete'"
            type="danger"
            size="large"
            round
            block
            plain
            @click="deleteOrder"
            :loading="actionLoading"
          >
            删除订单
          </Button>
        </template>

        <!-- pending(待审批): 批准、驳回 -->
        <template v-if="order.status === 'pending'">
          <Button
            v-permission="'purchase:orders:update'"
            type="success"
            size="large"
            round
            block
            @click="approveOrder"
            :loading="actionLoading"
            style="margin-bottom: 10px"
          >
            批准
          </Button>
          <Button
            v-permission="'purchase:orders:update'"
            type="warning"
            size="large"
            round
            block
            plain
            @click="rejectOrder"
            :loading="actionLoading"
          >
            驳回
          </Button>
        </template>

        <!-- confirmed/approved/partial_received: 到货 -->
        <template v-if="['confirmed', 'approved', 'partial_received'].includes(order.status)">
          <Button
            v-permission="'purchase:orders:update'"
            type="primary"
            size="large"
            round
            block
            @click="handleReceive"
          >
            确认到货
          </Button>
        </template>

        <!-- 所有状态可查看供应商 -->
        <Button type="default" size="large" round block @click="viewSupplier" v-if="order.supplierId" style="margin-top: 10px">
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
  import { ref, computed, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { NavBar, Icon, Button, Loading, Empty, showToast, showConfirmDialog } from 'vant'
  import { purchaseApi } from '@/api'
  import { extractApiData } from '@/utils/apiHelper'
  import { useAuthStore } from '@/stores/auth'
  import { canViewMaterialPrices, formatMaskedPrice } from '@/utils/priceVisibility'

  const router = useRouter()
  const route = useRoute()

  const order = ref(null)
  const orderItems = ref([])
  const loading = ref(true)
  const actionLoading = ref(false)

  // 获取订单详情
  const fetchOrderDetail = async () => {
    try {
      loading.value = true
      const orderId = route.params.id
      const response = await purchaseApi.getOrder(orderId)
      order.value = extractApiData(response, null)
      orderItems.value = order.value?.items || []
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

  // === 状态操作 === //

  const hasSupplier = computed(() => {
    const id = order.value?.supplierId
    return !(id === null || id === undefined || id === '' || id === 0 || id === '0')
  })

  // 草稿 → 提交审批 (draft → pending)
  const submitForApproval = async () => {
    try {
      if (!hasSupplier.value) {
        showToast('请先编辑订单并设置供应商后再提交审批')
        return
      }
      await showConfirmDialog({ title: '提交审批', message: '确定提交该订单进行审批？' })
      actionLoading.value = true
      await purchaseApi.updateOrderStatus(order.value.id, 'pending')
      showToast('已提交审批')
      await fetchOrderDetail()
    } catch (e) {
      if (e !== 'cancel') showToast(e.response?.data?.message || '操作失败')
    } finally {
      actionLoading.value = false
    }
  }

  // 待审批 → 批准 (pending → confirmed)
  const approveOrder = async () => {
    try {
      await showConfirmDialog({ title: '批准订单', message: '确定批准该采购订单？' })
      actionLoading.value = true
      await purchaseApi.updateOrderStatus(order.value.id, 'confirmed')
      showToast('订单已批准')
      await fetchOrderDetail()
    } catch (e) {
      if (e !== 'cancel') showToast(e.response?.data?.message || '操作失败')
    } finally {
      actionLoading.value = false
    }
  }

  // 待审批 → 驳回 (pending → draft)
  const rejectOrder = async () => {
    try {
      await showConfirmDialog({ title: '驳回订单', message: '确定驳回该采购订单？订单将退回草稿状态。' })
      actionLoading.value = true
      await purchaseApi.updateOrderStatus(order.value.id, 'draft')
      showToast('订单已驳回')
      await fetchOrderDetail()
    } catch (e) {
      if (e !== 'cancel') showToast(e.response?.data?.message || '操作失败')
    } finally {
      actionLoading.value = false
    }
  }

  // 草稿 → 删除
  const deleteOrder = async () => {
    try {
      await showConfirmDialog({ title: '删除订单', message: '确定删除该采购订单？此操作无法恢复。' })
      actionLoading.value = true
      await purchaseApi.deleteOrder(order.value.id)
      showToast('订单已删除')
      router.back()
    } catch (e) {
      if (e !== 'cancel') showToast(e.response?.data?.message || '删除失败')
    } finally {
      actionLoading.value = false
    }
  }

  // confirmed/partial_received → 到货（跳转到收货页面或直接操作）
  const handleReceive = () => {
    // 跳转到收货单列表，附带订单信息
    showToast('请在采购入库模块创建收货单')
    router.push('/purchase/receipts')
  }

  // 查看供应商
  const viewSupplier = () => {
    router.push(`/basedata/suppliers/${order.value.supplierId}`)
  }

  import { getPurchaseStatusText } from '@/constants/systemConstants'

  // 获取订单状态文本
  const getOrderStatusText = (status) => {
    const map = {
      draft: '草稿',
      pending: '待审批',
      confirmed: '已批准',
      approved: '已批准',
      partial_received: '部分到货',
      completed: '已完成',
      cancelled: '已取消'
    }
    return map[status] || getPurchaseStatusText(status) || status
  }

  // 计算收货进度百分比
  const getReceivePercent = (order) => {
    if (order.completionPercentage != null) return Math.round(Number(order.completionPercentage) || 0)
    if (!order.totalAmount || order.totalAmount === 0) return 0
    const percent = Math.round(((order.receivedAmount || 0) / order.totalAmount) * 100)
    return Math.min(percent, 100)
  }

  const authStore = useAuthStore()
  const canViewPrice = computed(() => canViewMaterialPrices((code) => authStore.hasPermission(code)))

  // 格式化金额
  const formatAmount = (amount) => {
    if (!amount) return '0.00'
    return parseFloat(amount).toFixed(2)
  }
  const displayAmount = (amount) => formatMaskedPrice(amount, canViewPrice.value, (value) => `¥${formatAmount(value)}`)

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
    height: 100%;
    background-color: var(--bg-secondary);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content-container {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    padding-bottom: var(--app-bottom-space);
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
    border-bottom: 1px solid var(--surface-border, var(--border-subtle));

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

    &.pending {
      background-color: rgba(234, 179, 8, 0.15);
      color: var(--color-warning);
    }

    &.confirmed, &.approved {
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
    border: 1px solid var(--surface-border, var(--border-subtle));
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

  .supplier-hint {
    margin: -4px 0 12px;
    padding: 0 4px;
    color: var(--van-danger-color, #ee0a24);
    font-size: 0.8125rem;
    line-height: 1.4;
    text-align: center;
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
